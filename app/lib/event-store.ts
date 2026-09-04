import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { LOCATION_TYPES, type AddedPlace } from './event-types';

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

// One entry per completed review round; the full answer payload lives in state.submissions.
export type RoundCompletion = {
  participantId: string;
  nickname: string;
  submittedAt: string;
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
  assignmentCount: number;
  status: 'unoffered' | 'assigned' | 'pending-round-2' | 'completed';
  lastAssignedAt: string | null;
  currentClaim: {
    claimId: string;
    participantId: string;
    assignedAt: string;
    leaseUntil: string;
    round: 1 | 2;
  } | null;
  round1: RoundCompletion | null;
  round2: RoundCompletion | null;
};

export type EventSubmissionPayload = {
  decision: 'confirm' | 'skip';
  locationUnknown: boolean;
  selectedPlaceIds: string[];
  selectedPlaceNames: string[];
  addedPlaces: AddedPlace[];
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
const STATE_PATH = join(DATA_DIR, 'event-state.json');

const LEASE_MINUTES_RAW = Number(process.env.EVENT_TASK_LEASE_MINUTES || '15');
const LEASE_MINUTES_MAX = 240;
const LEASE_MINUTES =
  Number.isFinite(LEASE_MINUTES_RAW) && LEASE_MINUTES_RAW > 0 && LEASE_MINUTES_RAW <= LEASE_MINUTES_MAX
    ? LEASE_MINUTES_RAW
    : 15;

let lock: Promise<void> = Promise.resolve();

// This JSON store is intentionally scoped to the local, single-process review tool.
// Use a transactional persistent store before deploying across workers or containers.

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

const THUMBNAIL_DIR = join(process.cwd(), 'public', 'data', 'nas-thumbnails');

// Prefers the locally cached copy (see scripts/cache-nas-thumbnails.ts) so review devices
// never depend on venue wifi reaching images.memorix.nl during the event.
function makeLowResUrl(mediaId: string): string {
  if (!mediaId) return '';
  if (existsSync(join(THUMBNAIL_DIR, `${mediaId}.jpg`))) {
    return `/data/nas-thumbnails/${mediaId}.jpg`;
  }
  return `https://images.memorix.nl/nas/thumb/350x350crop/${mediaId}.jpg`;
}

function toStringArray(value: unknown, maxItems = 50, maxLength = 200): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

const LOCATION_TYPE_SET = new Set<string>(LOCATION_TYPES);

function toPlaceEntries(value: unknown, maxItems = 50, maxLength = 200): AddedPlace[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const entries: AddedPlace[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Partial<AddedPlace>;
    const text = typeof entry.text === 'string' ? entry.text.trim().slice(0, maxLength) : '';
    if (!text || seen.has(text)) continue;
    const type = typeof entry.type === 'string' && LOCATION_TYPE_SET.has(entry.type) ? (entry.type as AddedPlace['type']) : '';
    seen.add(text);
    entries.push({ text, type });
    if (entries.length >= maxItems) break;
  }
  return entries;
}

function normalizePayload(value: unknown): EventSubmissionPayload {
  const raw = (value ?? {}) as Partial<Record<keyof EventSubmissionPayload, unknown>>;
  if (raw.decision !== 'confirm' && raw.decision !== 'skip') {
    throw new Error('payload.decision must be "confirm" or "skip".');
  }
  return {
    decision: raw.decision,
    locationUnknown: raw.locationUnknown === true,
    selectedPlaceIds: toStringArray(raw.selectedPlaceIds),
    selectedPlaceNames: toStringArray(raw.selectedPlaceNames),
    addedPlaces: toPlaceEntries(raw.addedPlaces),
    addedDates: toStringArray(raw.addedDates),
    selectedPersons: toStringArray(raw.selectedPersons),
    addedPersons: toStringArray(raw.addedPersons),
    notes: typeof raw.notes === 'string' ? raw.notes.trim().slice(0, 2000) : '',
  };
}

function initializeStateFromData(): EventState {
  const records = readJsonFile<NasRecord[]>(RECORDS_PATH);

  const tasks: EventTask[] = [];
  for (const record of records) {
    const sourceUrl = splitDetailUrl(record.detailUrl || '');

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
        assignmentCount: 0,
        status: 'unoffered',
        lastAssignedAt: null,
        currentClaim: null,
        round1: null,
        round2: null,
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

// Upgrades tasks written by the older single-review schema (completedBy/completedAt/finalSubmission)
// to the round1/round2 shape, without losing already-collected test-phase reviews.
function migrateLegacyTasks(state: EventState): void {
  for (const task of state.tasks as unknown as Array<EventTask & Record<string, unknown>>) {
    if (task.round1 !== undefined && task.round2 !== undefined) continue;

    const legacyCompletedBy = typeof task.completedBy === 'string' ? task.completedBy : null;
    const legacyCompletedAt = typeof task.completedAt === 'string' ? task.completedAt : null;
    delete task.completedAt;
    delete task.completedBy;
    delete task.finalSubmission;
    delete task.round1Offered;

    if (legacyCompletedBy && legacyCompletedAt) {
      task.round1 = {
        participantId: legacyCompletedBy,
        nickname: state.participants[legacyCompletedBy]?.nickname || 'onbekend',
        submittedAt: legacyCompletedAt,
      };
      task.round2 = null;
      task.status = 'pending-round-2';
    } else {
      task.round1 = null;
      task.round2 = null;
      if (task.status !== 'assigned') task.status = 'unoffered';
    }
  }
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
  migrateLegacyTasks(state);
  // Re-resolve on every load so newly cached thumbnails (scripts/cache-nas-thumbnails.ts)
  // take effect for tasks created before the cache existed, without a one-off migration flag.
  for (const task of state.tasks) {
    task.lowResUrl = makeLowResUrl(task.mediaId);
  }
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

function getStatsFromState(state: EventState) {
  const total = state.tasks.length;
  const completed = state.tasks.filter((task) => task.status === 'completed').length;
  const assigned = state.tasks.filter((task) => task.status === 'assigned').length;
  const unoffered = state.tasks.filter((task) => task.status === 'unoffered').length;
  const pendingRound2 = state.tasks.filter((task) => task.status === 'pending-round-2').length;

  return {
    total,
    completed,
    assigned,
    unoffered,
    pendingRound2,
    participants: Object.keys(state.participants).length,
    round: unoffered > 0 ? (1 as const) : (2 as const),
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
        round: activeOwned.currentClaim!.round,
        reused: true,
        done: false,
        task: activeOwned,
        stats: getStatsFromState(state),
      };
    }

    // Round 1: hand out every task once before any task is offered a second time.
    let round: 1 | 2 = 1;
    let candidates = state.tasks.filter(
      (task) =>
        task.status === 'unoffered' ||
        (task.status === 'assigned' && task.currentClaim?.round === 1 && !isLeaseActive(task, now)),
    );

    if (candidates.length === 0) {
      // Round 2: re-review the same tasks, but never assign one back to its round-1 reviewer.
      round = 2;
      candidates = state.tasks.filter((task) => {
        if (task.round1?.nickname === participant.nickname) return false;
        return (
          task.status === 'pending-round-2' ||
          (task.status === 'assigned' && task.currentClaim?.round === 2 && !isLeaseActive(task, now))
        );
      });
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

    const safePayload = normalizePayload(payload);
    const hasAnyLocation =
      safePayload.locationUnknown ||
      safePayload.selectedPlaceIds.length > 0 ||
      safePayload.selectedPlaceNames.length > 0 ||
      safePayload.addedPlaces.length > 0;
    const missingLocationOnConfirm = safePayload.decision === 'confirm' && !hasAnyLocation;
    const round = task.currentClaim.round;

    const submittedAt = nowIso();
    state.submissions.push({
      submissionId: randomUUID(),
      taskId,
      participantId,
      claimId,
      submittedAt,
      payload: safePayload,
    });

    if (missingLocationOnConfirm) {
      task.currentClaim = null;
      task.status = round === 2 ? 'pending-round-2' : 'unoffered';
      participant.lastSeenAt = submittedAt;
      saveState(state);

      return {
        ok: true,
        completed: false,
        reason: 'missing_location',
        stats: getStatsFromState(state),
      };
    }

    const completion: RoundCompletion = { participantId, nickname: participant.nickname, submittedAt };
    if (round === 1) {
      task.round1 = completion;
      task.status = 'pending-round-2';
    } else {
      task.round2 = completion;
      task.status = 'completed';
    }
    task.currentClaim = null;

    participant.lastSeenAt = submittedAt;
    saveState(state);

    return {
      ok: true,
      completed: task.status === 'completed',
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
