// One-off migration: imports the legacy JSON event state (participants, claims,
// submissions, task review state) from data/nas-mediabank/event-state.json into Supabase.
// Run scripts/sync-nas-tasks-supabase.ts first so all referenced tasks exist.
// Stale active claims ("assigned" tasks with expired leases) are released; every
// original UUID and timestamp is preserved.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSql } from '../lib/event-store';

type LegacyRoundCompletion = {
  participantId: string;
  nickname: string;
  submittedAt: string;
};

type LegacyTask = {
  taskId: string;
  status: 'unoffered' | 'assigned' | 'pending-round-2' | 'completed';
  assignmentCount?: number;
  lastAssignedAt?: string | null;
  round1?: LegacyRoundCompletion | null;
  round2?: LegacyRoundCompletion | null;
};

type LegacySubmission = {
  submissionId: string;
  taskId: string;
  participantId: string;
  claimId: string;
  submittedAt: string;
  payload: unknown;
};

type LegacyParticipant = {
  participantId: string;
  nickname: string;
  startedAt: string;
  lastSeenAt: string;
};

type LegacyState = {
  eventId: string;
  tasks: LegacyTask[];
  participants: Record<string, LegacyParticipant>;
  submissions: LegacySubmission[];
};

const STATE_PATH = join(__dirname, '../..', 'data', 'nas-mediabank', 'event-state.json');

type ParticipantRow = {
  participant_id: string;
  nickname: string;
  started_at: string;
  last_seen_at: string;
};

type ClaimRow = {
  claim_id: string;
  task_id: string;
  participant_id: string;
  round: 1 | 2;
  assigned_at: string;
  lease_until: string;
};

type SubmissionRow = {
  submission_id: string;
  task_id: string;
  participant_id: string;
  claim_id: string;
  round: 1 | 2;
  decision: string;
  location_unknown: boolean;
  added_places: string;
  added_dates: string;
  added_persons: string;
  notes: string;
  payload: string;
  submitted_at: string;
};

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isDecision(value: unknown): value is 'confirm' | 'skip' {
  return value === 'confirm' || value === 'skip';
}

async function main() {
  const state = JSON.parse(readFileSync(STATE_PATH, 'utf8')) as LegacyState;
  const sql = getSql();

  const tasksById = new Map(state.tasks.map((task) => [task.taskId, task]));
  const participantRows = new Map<string, ParticipantRow>();
  for (const participant of Object.values(state.participants)) {
    if (!participant.participantId) continue;
    participantRows.set(participant.participantId, {
      participant_id: participant.participantId,
      nickname: (participant.nickname || 'onbekend').slice(0, 40),
      started_at: participant.startedAt,
      last_seen_at: participant.lastSeenAt || participant.startedAt,
    });
  }

  let missingParticipants = 0;
  let skippedSubmissions = 0;
  const claimRows = new Map<string, ClaimRow>();
  const submissionRows: SubmissionRow[] = [];

  for (const submission of state.submissions) {
    if (!submission.submissionId || !submission.taskId || !submission.participantId || !submission.claimId) {
      skippedSubmissions += 1;
      continue;
    }
    if (!tasksById.has(submission.taskId)) {
      skippedSubmissions += 1;
      continue;
    }
    if (!participantRows.has(submission.participantId)) {
      missingParticipants += 1;
      participantRows.set(submission.participantId, {
        participant_id: submission.participantId,
        nickname: 'onbekend',
        started_at: submission.submittedAt,
        last_seen_at: submission.submittedAt,
      });
    }

    const task = tasksById.get(submission.taskId);
    const round2 = task?.round2;
    const round: 1 | 2 =
      round2?.participantId === submission.participantId && round2.submittedAt === submission.submittedAt
        ? 2
        : 1;

    const payload = (submission.payload ?? {}) as Record<string, unknown>;
    const decision = payload.decision;
    if (!isDecision(decision)) {
      skippedSubmissions += 1;
      continue;
    }

    claimRows.set(submission.claimId, {
      claim_id: submission.claimId,
      task_id: submission.taskId,
      participant_id: submission.participantId,
      round,
      assigned_at: submission.submittedAt,
      lease_until: submission.submittedAt,
    });

    submissionRows.push({
      submission_id: submission.submissionId,
      task_id: submission.taskId,
      participant_id: submission.participantId,
      claim_id: submission.claimId,
      round,
      decision,
      location_unknown: payload.locationUnknown === true,
      added_places: JSON.stringify(toArray(payload.addedPlaces)),
      added_dates: JSON.stringify(toArray(payload.addedDates)),
      added_persons: JSON.stringify(toArray(payload.addedPersons)),
      notes: typeof payload.notes === 'string' ? payload.notes : '',
      payload: JSON.stringify(payload),
      submitted_at: submission.submittedAt,
    });
  }

  await sql.begin(async (db) => {
    const participants = [...participantRows.values()];
    if (participants.length > 0) {
      await db`
        insert into participants ${db(participants, 'participant_id', 'nickname', 'started_at', 'last_seen_at')}
        on conflict (participant_id) do nothing`;
    }

    const claims = [...claimRows.values()];
    if (claims.length > 0) {
      await db`
        insert into claims ${db(claims, 'claim_id', 'task_id', 'participant_id', 'round', 'assigned_at', 'lease_until')}
        on conflict (claim_id) do nothing`;
    }

    if (submissionRows.length > 0) {
      await db`
        insert into submissions ${db(
          submissionRows,
          'submission_id',
          'task_id',
          'participant_id',
          'claim_id',
          'round',
          'decision',
          'location_unknown',
          'added_places',
          'added_dates',
          'added_persons',
          'notes',
          'payload',
          'submitted_at',
        )}
        on conflict (submission_id) do nothing`;
    }

    let unknownTasks = 0;
    for (const task of state.tasks) {
      if (!task.taskId) continue;
      const status =
        task.status === 'assigned' ? (task.round1 ? 'pending-round-2' : 'unoffered') : task.status;
      const updated = await db`
        update tasks
        set status = ${status},
            assignment_count = ${task.assignmentCount ?? 0},
            last_assigned_at = ${task.lastAssignedAt ?? null},
            round1_participant = ${task.round1?.participantId ?? null},
            round1_submitted_at = ${task.round1?.submittedAt ?? null},
            round2_participant = ${task.round2?.participantId ?? null},
            round2_submitted_at = ${task.round2?.submittedAt ?? null},
            current_claim_id = null,
            updated_at = now()
        where task_id = ${task.taskId}
        returning task_id`;
      if (updated.length === 0) unknownTasks += 1;
    }

    console.log(
      [
        `participants=${participants.length}`,
        `claims=${claims.length}`,
        `submissions=${submissionRows.length}`,
        `tasksUpdated=${state.tasks.length - unknownTasks}`,
        `tasksUnknown=${unknownTasks}`,
        `skippedSubmissions=${skippedSubmissions}`,
        `missingParticipantsRepaired=${missingParticipants}`,
      ].join(' '),
    );
  });

  console.log('Import finished. Stale claims released; original IDs and timestamps preserved.');
  await sql.end({ timeout: 5 });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
