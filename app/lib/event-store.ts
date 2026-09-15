import postgres, { type ISql, type Sql } from 'postgres';
import { LOCATION_TYPES, type AddedPlace } from './event-types';

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

type Stats = {
  total: number;
  completed: number;
  assigned: number;
  unoffered: number;
  pendingRound2: number;
  participants: number;
  round: 1 | 2;
};

type ClaimResponse = {
  ok: true;
  round: 1 | 2;
  reused: boolean;
  done: boolean;
  task: EventTask | null;
  stats: Stats;
};

const LEASE_MINUTES_RAW = Number(process.env.EVENT_TASK_LEASE_MINUTES || '15');
const LEASE_MINUTES_MAX = 240;
const LEASE_MINUTES =
  Number.isFinite(LEASE_MINUTES_RAW) && LEASE_MINUTES_RAW > 0 && LEASE_MINUTES_RAW <= LEASE_MINUTES_MAX
    ? LEASE_MINUTES_RAW
    : 15;

// Server-side only: DATABASE_URL must come from the environment. There is no
// filesystem fallback, because the runtime filesystem is read-only on Vercel.
function resolveDatabaseUrl(): string {
  const fromEnv = process.env.DATABASE_URL?.trim();
  if (fromEnv) return fromEnv;
  throw new Error('DATABASE_URL is not configured. Set it in the deployment environment or app/.env.local.');
}

let sql: Sql | null = null;

export function getSql(): Sql {
  if (!sql) {
    sql = postgres(resolveDatabaseUrl(), {
      max: 2,
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return sql;
}

type TaskJoinRow = {
  task_id: string;
  record_key: string;
  detail_id: string;
  media_id: string;
  media_type: string;
  title: string;
  description: string;
  year_raw: string;
  inventory_number: string;
  document_type: string;
  source_url: string;
  low_res_url: string;
  assignment_count: number;
  status: EventTask['status'];
  last_assigned_at: Date | null;
  round1_participant: string | null;
  round1_submitted_at: Date | null;
  round1_nickname: string | null;
  round2_participant: string | null;
  round2_submitted_at: Date | null;
  round2_nickname: string | null;
  claim_id: string | null;
  claim_participant_id: string | null;
  claim_round: number | null;
  claim_assigned_at: Date | null;
  claim_lease_until: Date | null;
};

type TaskIdRow = { task_id: string };

type ClaimIdRow = { claim_id: string };

type ParticipantIdRow = { participant_id: string };

type LockedTaskRow = {
  status: EventTask['status'];
  current_claim_id: string | null;
  claim_round: number | null;
  claim_participant_id: string | null;
};

type SubmittedAtRow = { submitted_at: Date };

type StatsRow = {
  total: number;
  completed: number;
  assigned: number;
  unoffered: number;
  pending_round2: number;
  participants: number;
};

// Public Memorix CDN thumbnail. Local /data/nas-thumbnails files exist only on
// dev machines (app/public/data is gitignored), so tasks synced with a local
// path are resolved to the CDN URL at response time instead.
function resolveCdnThumbnailUrl(mediaId: string): string {
  if (!mediaId) return '';
  return `https://images.memorix.nl/nas/thumb/350x350crop/${mediaId}.jpg`;
}

function mapRoundCompletion(  participantId: string | null,
  nickname: string | null,
  submittedAt: Date | null,
): RoundCompletion | null {
  if (!participantId) return null;
  return {
    participantId,
    nickname: nickname || 'onbekend',
    submittedAt: submittedAt ? submittedAt.toISOString() : '',
  };
}

function mapTask(row: TaskJoinRow): EventTask {
  let currentClaim: EventTask['currentClaim'] = null;
  if (
    row.claim_id &&
    row.claim_participant_id &&
    row.claim_round !== null &&
    row.claim_assigned_at &&
    row.claim_lease_until
  ) {
    currentClaim = {
      claimId: row.claim_id,
      participantId: row.claim_participant_id,
      assignedAt: row.claim_assigned_at.toISOString(),
      leaseUntil: row.claim_lease_until.toISOString(),
      round: row.claim_round === 1 ? 1 : 2,
    };
  }
  return {
    taskId: row.task_id,
    mode: 'image',
    recordKey: row.record_key,
    detailId: row.detail_id,
    mediaId: row.media_id,
    mediaType: row.media_type,
    title: row.title,
    description: row.description,
    yearRaw: row.year_raw,
    inventoryNumber: row.inventory_number,
    documentType: row.document_type,
    sourceUrl: row.source_url,
    // Local /data thumbnails are never deployed (app/public/data is gitignored),
    // so resolve to the public Memorix CDN thumbnail as a runtime fallback.
    lowResUrl: row.low_res_url.startsWith('/data/') ? resolveCdnThumbnailUrl(row.media_id) : row.low_res_url,
    assignmentCount: row.assignment_count,
    status: row.status,
    lastAssignedAt: row.last_assigned_at ? row.last_assigned_at.toISOString() : null,
    currentClaim,
    round1: mapRoundCompletion(row.round1_participant, row.round1_nickname, row.round1_submitted_at),
    round2: mapRoundCompletion(row.round2_participant, row.round2_nickname, row.round2_submitted_at),
  };
}

async function loadTask(db: ISql, taskId: string): Promise<EventTask | null> {
  const rows = await db<TaskJoinRow[]>`
    select
      t.task_id, t.record_key, t.detail_id, t.media_id, t.media_type, t.title, t.description,
      t.year_raw, t.inventory_number, t.document_type, t.source_url, t.low_res_url,
      t.assignment_count, t.status, t.last_assigned_at,
      t.round1_participant, t.round1_submitted_at, p1.nickname as round1_nickname,
      t.round2_participant, t.round2_submitted_at, p2.nickname as round2_nickname,
      c.claim_id, c.participant_id as claim_participant_id, c.round as claim_round,
      c.assigned_at as claim_assigned_at, c.lease_until as claim_lease_until
    from tasks t
    left join participants p1 on p1.participant_id = t.round1_participant
    left join participants p2 on p2.participant_id = t.round2_participant
    left join claims c on c.claim_id = t.current_claim_id
    where t.task_id = ${taskId}`;
  if (rows.length === 0) return null;
  return mapTask(rows[0]);
}

async function getStats(db: ISql): Promise<Stats> {
  const rows = await db<StatsRow[]>`
    select
      count(*)::int as total,
      count(*) filter (where status = 'completed')::int as completed,
      count(*) filter (where status = 'assigned')::int as assigned,
      count(*) filter (where status = 'unoffered')::int as unoffered,
      count(*) filter (where status = 'pending-round-2')::int as pending_round2,
      (select count(*)::int from participants) as participants
    from tasks`;
  const row = rows[0];
  return {
    total: row.total,
    completed: row.completed,
    assigned: row.assigned,
    unoffered: row.unoffered,
    pendingRound2: row.pending_round2,
    participants: row.participants,
    round: row.unoffered > 0 ? 1 : 2,
  };
}

function toStringArray(value: unknown, maxItems = 50, maxLength = 200): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

const locationTypeSet = new Set<string>(LOCATION_TYPES);

function toPlaceEntries(value: unknown, maxItems = 50, maxLength = 200): AddedPlace[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const entries: AddedPlace[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Partial<AddedPlace>;
    const text = typeof entry.text === 'string' ? entry.text.trim().slice(0, maxLength) : '';
    if (!text || seen.has(text)) continue;
    const type = typeof entry.type === 'string' && locationTypeSet.has(entry.type) ? entry.type : '';
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

export async function startParticipant(nickname: string): Promise<{
  participantId: string;
  nickname: string;
  stats: Stats;
}> {
  return await getSql().begin(async (db) => {
    const inserted = await db<Array<{ participant_id: string; nickname: string }>>`
      insert into participants (nickname)
      values (${nickname})
      returning participant_id, nickname`;
    const participant = inserted[0];
    const stats = await getStats(db);
    return {
      participantId: participant.participant_id,
      nickname: participant.nickname,
      stats,
    };
  });
}

export async function claimTask(participantId: string): Promise<ClaimResponse> {
  return await getSql().begin(async (db) => {
    const participants = await db<ParticipantIdRow[]>`
      update participants
      set last_seen_at = now()
      where participant_id = ${participantId}
      returning participant_id`;
    if (participants.length === 0) {
      throw new Error('Unknown participantId. Start a session first.');
    }

    const owned = await db<TaskIdRow[]>`
      select t.task_id
      from tasks t
      join claims c on c.claim_id = t.current_claim_id
      where t.status = 'assigned'
        and c.participant_id = ${participantId}
        and c.lease_until > now()
      limit 1`;
    if (owned.length > 0) {
      const task = await loadTask(db, owned[0].task_id);
      if (task?.currentClaim) {
        return {
          ok: true,
          round: task.currentClaim.round,
          reused: true,
          done: false,
          task,
          stats: await getStats(db),
        };
      }
    }

    // Round 1: hand out every task once before any task is offered a second time.
    let round: 1 | 2 = 1;
    let candidates = await db<TaskIdRow[]>`
      select t.task_id
      from tasks t
      left join claims c on c.claim_id = t.current_claim_id
      where t.status = 'unoffered'
         or (t.status = 'assigned' and c.round = 1 and c.lease_until <= now())
      order by t.task_id asc
      limit 1
      for update of t skip locked`;

    if (candidates.length === 0) {
      // Round 2: re-review the same tasks, but never assign one back to its round-1 reviewer.
      round = 2;
      candidates = await db<TaskIdRow[]>`
        select t.task_id
        from tasks t
        left join claims c on c.claim_id = t.current_claim_id
        where t.round1_participant is distinct from ${participantId}
          and (
            t.status = 'pending-round-2'
            or (t.status = 'assigned' and c.round = 2 and c.lease_until <= now())
          )
        order by t.assignment_count asc, t.last_assigned_at asc nulls first
        limit 1
        for update of t skip locked`;
    }

    if (candidates.length === 0) {
      return {
        ok: true,
        round,
        reused: false,
        done: true,
        task: null,
        stats: await getStats(db),
      };
    }

    const taskId = candidates[0].task_id;
    const insertedClaims = await db<ClaimIdRow[]>`
      insert into claims (task_id, participant_id, round, assigned_at, lease_until)
      values (
        ${taskId},
        ${participantId},
        ${round},
        now(),
        now() + make_interval(mins => ${LEASE_MINUTES}::int)
      )
      returning claim_id`;
    const claimId = insertedClaims[0].claim_id;

    await db`
      update tasks
      set status = 'assigned',
          assignment_count = assignment_count + 1,
          last_assigned_at = now(),
          current_claim_id = ${claimId},
          updated_at = now()
      where task_id = ${taskId}`;

    const task = await loadTask(db, taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    return {
      ok: true,
      round,
      reused: false,
      done: false,
      task,
      stats: await getStats(db),
    };
  });
}

export async function submitTask(
  participantId: string,
  taskId: string,
  claimId: string,
  payload: EventSubmissionPayload,
): Promise<{ ok: true; completed: boolean; reason?: 'missing_location'; stats: Stats }> {
  return await getSql().begin(async (db) => {
    const participants = await db<ParticipantIdRow[]>`
      update participants
      set last_seen_at = now()
      where participant_id = ${participantId}
      returning participant_id`;
    if (participants.length === 0) {
      throw new Error('Unknown participantId. Start a session first.');
    }

    const locked = await db<LockedTaskRow[]>`
      select t.status, t.current_claim_id, c.round as claim_round, c.participant_id as claim_participant_id
      from tasks t
      left join claims c on c.claim_id = t.current_claim_id
      where t.task_id = ${taskId}
      for update of t`;
    if (locked.length === 0) throw new Error(`Task not found: ${taskId}`);
    const task = locked[0];
    if (task.status === 'completed') throw new Error('Task is already completed.');
    if (!task.current_claim_id) throw new Error('Task has no active claim.');
    if (task.claim_participant_id !== participantId) {
      throw new Error('Task is currently assigned to a different participant.');
    }
    if (task.current_claim_id !== claimId) {
      throw new Error('Claim mismatch. Refresh and claim a new task.');
    }

    const safePayload = normalizePayload(payload);
    const hasAnyLocation =
      safePayload.locationUnknown ||
      safePayload.selectedPlaceIds.length > 0 ||
      safePayload.selectedPlaceNames.length > 0 ||
      safePayload.addedPlaces.length > 0;
    const missingLocationOnConfirm = safePayload.decision === 'confirm' && !hasAnyLocation;
    const round: 1 | 2 = task.claim_round === 2 ? 2 : 1;

    const insertedSubmissions = await db<SubmittedAtRow[]>`
      insert into submissions (
        task_id, participant_id, claim_id, round, decision, location_unknown,
        added_places, added_dates, added_persons, notes, payload
      )
      values (
        ${taskId}, ${participantId}, ${claimId}, ${round}, ${safePayload.decision},
        ${safePayload.locationUnknown},
        ${JSON.stringify(safePayload.addedPlaces)}::jsonb,
        ${JSON.stringify(safePayload.addedDates)}::jsonb,
        ${JSON.stringify(safePayload.addedPersons)}::jsonb,
        ${safePayload.notes},
        ${JSON.stringify(safePayload)}::jsonb
      )
      returning submitted_at`;
    const submittedAt = insertedSubmissions[0].submitted_at;

    if (missingLocationOnConfirm) {
      await db`
        update tasks
        set status = ${round === 2 ? 'pending-round-2' : 'unoffered'},
            current_claim_id = null,
            updated_at = now()
        where task_id = ${taskId}`;
      return {
        ok: true,
        completed: false,
        reason: 'missing_location' as const,
        stats: await getStats(db),
      };
    }

    if (round === 1) {
      await db`
        update tasks
        set round1_participant = ${participantId},
            round1_submitted_at = ${submittedAt},
            status = 'pending-round-2',
            current_claim_id = null,
            updated_at = now()
        where task_id = ${taskId}`;
    } else {
      await db`
        update tasks
        set round2_participant = ${participantId},
            round2_submitted_at = ${submittedAt},
            status = 'completed',
            current_claim_id = null,
            updated_at = now()
        where task_id = ${taskId}`;
    }

    return {
      ok: true,
      completed: round === 2,
      stats: await getStats(db),
    };
  });
}

export async function getEventStatus(): Promise<Stats> {
  return await getStats(getSql());
}
