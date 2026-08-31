import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

type NasRecord = {
  detailId: string;
  mediaId: string;
  recordKey: string;
  detailUrl: string;
  title: string;
  description: string;
  documentType: string;
  inventoryNumber: string;
  yearRaw: string;
  personsRaw: string;
  keywordsRaw: string;
  mediaType: 'image' | 'video' | 'audio' | 'unknown';
};

type NasHit = {
  recordKey: string;
  hitType: 'place' | 'person';
  canonicalName: string;
  stmGazetteerId: string;
  category: string;
  matchSource: string;
};

export type EventTask = {
  taskId: string;
  mode: 'image';
  recordKey: string;
  detailId: string;
  mediaId: string;
  mediaType: string;
  title: string;
  description: string;
  yearRaw: string;
  inventoryNumber: string;
  documentType: string;
  sourceUrl: string;
  lowResUrl: string;
  suggestedPersons: string[];
  round1Offered: boolean;
  assignmentCount: number;
  status: 'unoffered' | 'assigned' | 'completed';
  lastAssignedAt: string | null;
  currentClaim: {
    claimId: string;
    participantId: string;
    assignedAt: string;
    leaseUntil: string;
    round: 1 | 2;
  } | null;
  completedAt: string | null;
  completedBy: string | null;
  finalSubmission: EventSubmissionPayload | null;
};

export type EventSubmissionPayload = {
  decision: 'confirm' | 'skip';
  locationUnknown: boolean;
  selectedPlaceIds: string[];
  selectedPlaceNames: string[];
  addedPlaces: string[];
  addedDates: string[];
  selectedPersons: string[];
  addedPersons: string[];
  notes: string;
};

type Participant = {
  participantId: string;
  nickname: string;
  startedAt: string;
  lastSeenAt: string;
};

type SubmissionRecord = {
  submissionId: string;
  taskId: string;
  participantId: string;
  claimId: string;
  submittedAt: string;
  payload: EventSubmissionPayload;
};

type EventState = {
  eventId: string;
  createdAt: string;
  updatedAt: string;
  tasks: EventTask[];
  participants: Record<string, Participant>;
  submissions: SubmissionRecord[];
};

type ClaimResponse = {
  ok: true;
  round: 1 | 2;
  reused: boolean;
  done: boolean;
  task: EventTask | null;
  stats: ReturnType<typeof getStatsFromState>;
};

const DATA_DIR = join(process.cwd(), '..', 'data', 'nas-mediabank');
const RECORDS_PATH = join(DATA_DIR, 'nas-mediabank-records.json');
const HITS_HIGH_PATH = join(DATA_DIR, 'nas-place-person-hits.high-precision.json');
const STATE_PATH = join(DATA_DIR, 'event-state.json');

const LEASE_MINUTES = Number(process.env.EVENT_TASK_LEASE_MINUTES || '15');

let lock: Promise<void> = Promise.resolve();

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  const prev = lock;
  lock = prev.then(() => next);
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

function readJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function splitDetailUrl(value: string): string {
  return value.split('|')[0]?.trim() || '';
}

function makeLowResUrl(mediaId: string): string {
  if (!mediaId) return '';
  return `https://images.memorix.nl/nas/thumb/350x350crop/${mediaId}.jpg`;
}

function buildSuggestionMaps(hits: NasHit[]): {
  peopleByRecord: Map<string, string[]>;
} {
  const peopleByRecord = new Map<string, string[]>();

  for (const hit of hits) {
    if (hit.hitType === 'person') {
      const current = peopleByRecord.get(hit.recordKey) || [];
      current.push(hit.canonicalName);
      peopleByRecord.set(hit.recordKey, current);
    }
  }

  for (const [key, values] of peopleByRecord.entries()) {
    peopleByRecord.set(key, [...new Set(values)]);
  }

  return { peopleByRecord };
}

function dedupe<T>(values: T[], keyFn: (value: T) => string): T[] {
  const map = new Map<string, T>();
  for (const value of values) {
    const key = keyFn(value);
    if (!map.has(key)) map.set(key, value);
  }
  return [...map.values()];
}

function initializeStateFromData(): EventState {
  const records = readJsonFile<NasRecord[]>(RECORDS_PATH);
  const hits = readJsonFile<NasHit[]>(HITS_HIGH_PATH);
  const { peopleByRecord } = buildSuggestionMaps(hits);

  const tasks: EventTask[] = [];
  for (const record of records) {
    const sourceUrl = splitDetailUrl(record.detailUrl || '');
    const suggestedPersons = peopleByRecord.get(record.recordKey) || [];

    if (record.mediaType === 'image') {
      tasks.push({
        taskId: `img:${record.recordKey}`,
        mode: 'image',
        recordKey: record.recordKey,
        detailId: record.detailId,
        mediaId: record.mediaId,
        mediaType: record.mediaType,
        title: record.title,
        description: record.description,
        yearRaw: record.yearRaw,
        inventoryNumber: record.inventoryNumber,
        documentType: record.documentType,
        sourceUrl,
        lowResUrl: makeLowResUrl(record.mediaId),
        suggestedPersons,
        round1Offered: false,
        assignmentCount: 0,
        status: 'unoffered',
        lastAssignedAt: null,
        currentClaim: null,
        completedAt: null,
        completedBy: null,
        finalSubmission: null,
      });
      continue;
    }

    // The current event intentionally reviews photographs only.
    continue;
  }

  const now = new Date().toISOString();
  return {
    eventId: randomUUID(),
    createdAt: now,
    updatedAt: now,
    tasks,
    participants: {},
    submissions: [],
  };
}

function loadState(): EventState {
  mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(STATE_PATH)) {
    const initial = initializeStateFromData();
    writeFileSync(STATE_PATH, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  const state = readJsonFile<EventState>(STATE_PATH);
  const photoTaskIds = new Set(
    state.tasks
      .filter((task) => task.mediaType === 'image')
      .map((task) => task.taskId),
  );
  state.tasks = state.tasks.filter((task) => photoTaskIds.has(task.taskId));
  state.submissions = state.submissions.filter((submission) => photoTaskIds.has(submission.taskId));
  return state;
}

function saveState(state: EventState): void {
  state.updatedAt = new Date().toISOString();
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

function nowIso(): string {
  return new Date().toISOString();
}

function leaseUntilIso(): string {
  return new Date(Date.now() + LEASE_MINUTES * 60_000).toISOString();
}

function isLeaseActive(task: EventTask, now: string): boolean {
  if (!task.currentClaim) return false;
  return task.currentClaim.leaseUntil > now;
}

function getRound(state: EventState): 1 | 2 {
  return state.tasks.some((task) => !task.round1Offered) ? 1 : 2;
}

function getStatsFromState(state: EventState) {
  const total = state.tasks.length;
  const completed = state.tasks.filter((task) => task.status === 'completed').length;
  const assigned = state.tasks.filter((task) => task.status === 'assigned').length;
  const unoffered = state.tasks.filter((task) => !task.round1Offered).length;
  const unresolved = state.tasks.filter((task) => task.round1Offered && task.status !== 'completed').length;

  return {
    total,
    completed,
    assigned,
    unoffered,
    unresolved,
    participants: Object.keys(state.participants).length,
    round: getRound(state),
  };
}

export async function startParticipant(nickname: string): Promise<{
  participantId: string;
  nickname: string;
  stats: ReturnType<typeof getStatsFromState>;
}> {
  return withLock(async () => {
    const state = loadState();
    const participantId = randomUUID();
    state.participants[participantId] = {
      participantId,
      nickname,
      startedAt: nowIso(),
      lastSeenAt: nowIso(),
    };
    saveState(state);
    return {
      participantId,
      nickname,
      stats: getStatsFromState(state),
    };
  });
}

export async function claimTask(participantId: string): Promise<ClaimResponse> {
  return withLock(async () => {
    const state = loadState();
    const participant = state.participants[participantId];
    if (!participant) {
      throw new Error('Unknown participantId. Start a session first.');
    }
    participant.lastSeenAt = nowIso();

    const now = nowIso();

    const activeOwned = state.tasks.find(
      (task) =>
        task.status === 'assigned' &&
        task.currentClaim?.participantId === participantId &&
        isLeaseActive(task, now),
    );

    if (activeOwned) {
      saveState(state);
      return {
        ok: true,
        round: activeOwned.currentClaim?.round || getRound(state),
        reused: true,
        done: false,
        task: activeOwned,
        stats: getStatsFromState(state),
      };
    }

    const round = getRound(state);
    let candidates: EventTask[] = [];

    if (round === 1) {
      candidates = state.tasks.filter(
        (task) => task.mediaType === 'image' && !task.round1Offered,
      );
    } else {
      candidates = state.tasks.filter(
        (task) =>
          task.mediaType === 'image' &&
          task.status !== 'completed' &&
          (!task.currentClaim || !isLeaseActive(task, now)),
      );
    }

    if (candidates.length === 0) {
      saveState(state);
      return {
        ok: true,
        round,
        reused: false,
        done: true,
        task: null,
        stats: getStatsFromState(state),
      };
    }

    candidates = [...candidates].sort((a, b) => {
      if (round === 1) return a.taskId.localeCompare(b.taskId);
      if (a.assignmentCount !== b.assignmentCount) return a.assignmentCount - b.assignmentCount;
      return (a.lastAssignedAt || '').localeCompare(b.lastAssignedAt || '');
    });

    const selected = candidates[0];
    selected.round1Offered = true;
    selected.status = 'assigned';
    selected.assignmentCount += 1;
    selected.lastAssignedAt = now;
    selected.currentClaim = {
      claimId: randomUUID(),
      participantId,
      assignedAt: now,
      leaseUntil: leaseUntilIso(),
      round,
    };

    saveState(state);

    return {
      ok: true,
      round,
      reused: false,
      done: false,
      task: selected,
      stats: getStatsFromState(state),
    };
  });
}

export async function submitTask(
  participantId: string,
  taskId: string,
  claimId: string,
  payload: EventSubmissionPayload,
): Promise<{ ok: true; completed: boolean; reason?: 'missing_location'; stats: ReturnType<typeof getStatsFromState> }> {
  return withLock(async () => {
    const state = loadState();
    const participant = state.participants[participantId];
    if (!participant) throw new Error('Unknown participantId. Start a session first.');

    const task = state.tasks.find((entry) => entry.taskId === taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (task.status === 'completed') throw new Error('Task is already completed.');
    if (!task.currentClaim) throw new Error('Task has no active claim.');
    if (task.currentClaim.participantId !== participantId) {
      throw new Error('Task is currently assigned to a different participant.');
    }
    if (task.currentClaim.claimId !== claimId) {
      throw new Error('Claim mismatch. Refresh and claim a new task.');
    }

    const hasAnyLocation = payload.locationUnknown || payload.selectedPlaceIds.length > 0 || payload.selectedPlaceNames.length > 0 || payload.addedPlaces.length > 0;
    const missingLocationOnConfirm = payload.decision === 'confirm' && !hasAnyLocation;

    const submittedAt = nowIso();
    state.submissions.push({
      submissionId: randomUUID(),
      taskId,
      participantId,
      claimId,
      submittedAt,
      payload,
    });

    if (missingLocationOnConfirm) {
      task.currentClaim = null;
      task.status = 'assigned';
      task.completedAt = null;
      task.completedBy = null;
      task.finalSubmission = null;
      participant.lastSeenAt = submittedAt;
      saveState(state);

      return {
        ok: true,
        completed: false,
        reason: 'missing_location',
        stats: getStatsFromState(state),
      };
    }

    task.status = 'completed';
    task.completedAt = submittedAt;
    task.completedBy = participantId;
    task.finalSubmission = payload;
    task.currentClaim = null;

    participant.lastSeenAt = submittedAt;
    saveState(state);

    return {
      ok: true,
      completed: true,
      stats: getStatsFromState(state),
    };
  });
}

export async function getEventStatus(): Promise<ReturnType<typeof getStatsFromState>> {
  return withLock(async () => {
    const state = loadState();
    return getStatsFromState(state);
  });
}
