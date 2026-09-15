# Supabase backend for the image review app (`/annotate`)

## Context

- The review app is `app/app/annotate/page.tsx` → re-exports `app/app/event/page.tsx`; all state mutations go through `POST /api/event/{start,claim,submit}` and `GET /api/event/status` (routes in `app/app/api/event/`).
- State currently lives in a single JSON file `data/nas-mediabank/event-state.json` via `app/lib/event-store.ts`, which explicitly warns it must be replaced by a transactional store before multi-worker deployment.
- Task metadata comes from `data/nas-mediabank/nas-mediabank-records.json` (images only, `taskId = "img:<recordKey>"`).
- Supabase project: `https://stydnbdvuttbbzouaknv.supabase.co`, project-ref `stydnbdvuttbbzouaknv`. Publishable key `sb_publishable_tivh7Hl4_gizOK_BZSdESg__TTsY8sz` (safe to expose; **not needed** for this integration — see Integration approach).
- User decision: **import** existing `event-state.json` data (participants, submissions, task progress through 2026-09-01) into Supabase.
- Detailed "user information rules" are deferred by the user; this plan includes minimal defaults only.

## Analysis result — minimal tables (4)

Derived 1:1 from the types in `app/lib/event-store.ts` (`Participant`, `EventTask`, `currentClaim`, `SubmissionRecord`/`EventSubmissionPayload`):

1. **`participants`** — anonymous session identity, no login.
   `participant_id uuid PK default gen_random_uuid()`, `nickname text (1..40)`, `started_at timestamptz`, `last_seen_at timestamptz`.
2. **`tasks`** — NAS image metadata + review state.
   `task_id text PK ('img:<recordKey>')`, `record_key`, `detail_id`, `media_id`, `media_type`, `title`, `description`, `year_raw`, `inventory_number`, `document_type`, `source_url`, `low_res_url` (all text, default `''`); mutable state: `status text check in ('unoffered','assigned','pending-round-2','completed') default 'unoffered'`, `assignment_count int default 0`, `last_assigned_at timestamptz`, `round1_participant uuid → participants`, `round1_submitted_at`, `round2_participant uuid → participants`, `round2_submitted_at`, `current_claim_id uuid → claims`, `created_at`, `updated_at`.
3. **`claims`** — lease-based assignments (keeps history; active one referenced by `tasks.current_claim_id`).
   `claim_id uuid PK default gen_random_uuid()`, `task_id → tasks`, `participant_id → participants`, `round smallint check in (1,2)`, `assigned_at`, `lease_until`.
4. **`submissions`** — the annotations users input.
   `submission_id uuid PK default gen_random_uuid()`, `task_id → tasks`, `participant_id → participants`, `claim_id → claims`, `round smallint`, `decision check in ('confirm','skip')`, `location_unknown boolean`, `added_places jsonb (array of {text,type})`, `added_dates jsonb (string[])`, `added_persons jsonb (string[])`, `notes text (≤2000)`, `payload jsonb` (full normalized payload, preserves legacy `selectedPlaceIds/Names/Persons` arrays present in older records), `submitted_at`.

Indexes: `claims(task_id)`, `claims(participant_id)`, `submissions(task_id)`, `submissions(participant_id)`, `tasks(status)`.

Port behavior **exactly** from `event-store.ts` (lease minutes via `EVENT_TASK_LEASE_MINUTES`, round-1-first distribution, round-2 excludes the round-1 reviewer, `confirm` without any location → task returns to pool with `missing_location`, ordering rules). One deliberate improvement: round-2 exclusion by `round1_participant_id` (UUID) instead of nickname comparison.

## Integration approach

Server-side only: rewrite the internals of `app/lib/event-store.ts` with `postgres` (postgres.js) + `DATABASE_URL`, keeping the exported signatures (`startParticipant`, `claimTask`, `submitTask`, `getEventStatus`) so the API routes and client stay unchanged. Use real transactions:

- `claimTask`: single transaction, `SELECT … FOR UPDATE SKIP LOCKED` for candidate selection → insert claim → update task.
- `submitTask`: single transaction (validate claim → insert submission → update task/participant).
- Do NOT use `@supabase/supabase-js` (no transaction support); do NOT expose tables to anon clients.

Concurrency-safe because Vercel may run multiple instances; the JSON file approach could not.

## Tasks

1. **Dependency + env template**: add `postgres` to `app/package.json`; extend `app/.env.example` with `DATABASE_URL=postgresql://postgres:[PASSWORD]@db.stydnbdvuttbbzouaknv.supabase.co:5432/postgres` and keep `EVENT_TASK_LEASE_MINUTES`.
2. **Migration SQL**: create `supabase/migrations/20260915090000_image_review_schema.sql` (repo root; user will run `supabase init`/`link` per their notes) with the 4 tables, checks, indexes, and `ALTER TABLE … ENABLE ROW LEVEL SECURITY` on all four with **no** policies (deny-all; server connects as `postgres`, bypassing RLS). Add `COMMENT ON TABLE` documenting purpose and privacy rules.
3. **Rewrite `app/lib/event-store.ts`** to postgres.js: same function signatures and response shapes (`ClaimResponse`, stats, `missing_location` semantics); transactions as above; delete file-lock machinery; keep `makeLowResUrl` out (URLs are synced, not computed at request time).
4. **Sync script** `app/scripts/sync-nas-tasks-supabase.ts`: upsert image records from `data/nas-mediabank/nas-mediabank-records.json` into `tasks` (`ON CONFLICT (task_id) DO UPDATE` metadata only — never mutable review state; compute `low_res_url` with the existing thumbnail-existence check).
5. **Import script** `app/scripts/import-event-state-supabase.ts` (run after sync): import from `data/nas-mediabank/event-state.json` preserving original UUIDs/timestamps — participants; historical `claims` rows synthesized per submission (round inferred, `assigned_at/lease_until = submitted_at`); all `submissions` with full payload; per-task `status`, `assignment_count`, `last_assigned_at`, `round1/2_*`; **clear** `current_claim_id` and reset stray `assigned` statuses to `unoffered`/`pending-round-2` so no stale leases survive. Skips nothing silently: log counts.
6. **Secrets + deploy config**: real DB password in `app/.env.local` (never committed) and in Vercel project env as `DATABASE_URL`. Note: if direct `db.…supabase.co:5432` fails from Vercel (IPv6-only), switch to the Supabase session-pooler URI from the dashboard.
7. **Apply**: `supabase login` → `supabase link --project-ref stydnbdvuttbbzouaknv` → `supabase db push` (or paste SQL in the dashboard SQL editor); then `tsx scripts/sync-nas-tasks-supabase.ts`, then `tsx scripts/import-event-state-supabase.ts`.
8. **Validation**:
   - `pnpm lint` and typecheck in `app/`.
   - Local e2e: start session → claim → confirm without location (expect `missing_location` retry path) → confirm with place+type → skip → verify round-1/round-2 transitions and stats in Supabase dashboard tables.
   - Deploy to Vercel and verify `https://data.surinametijdmachine.org/annotate` behaves identically (existing nickname sessions in localStorage will error once with "unknown participant" and gracefully re-prompt — acceptable, matches existing expiry behavior).

## User-data rules (minimal defaults; full policy deferred)

- No login/auth: identity = server-generated random UUID + user-chosen nickname (≤40 chars). Duplicate nicknames allowed; UUID is the key.
- Stored per participant: UUID, nickname, `started_at`, `last_seen_at`. **Never** store IP, user-agent, fingerprint, or email. The localStorage key `stm_annotate_participant_v1` stays device-only.
- Submissions are research data tied to the anonymous UUID; `notes` is free text and may contain personal information → treat `submissions` as restricted (RLS deny-all, no public API exposing raw rows).
- Publishable key may live in client code later; the DB password must exist only as a server-side secret (`.env.local`, Vercel env).

## Risks / notes

- Direct DB connection from Vercel may require the pooler URI (see task 6).
- JSON files under `data/nas-mediabank/` remain as archive; harvest scripts (`harvest-nas-mediabank.ts`, `cache-nas-thumbnails.ts`) are untouched — only `event-store.ts` changes its storage backend.
- Round-2 exclusion switches from nickname- to UUID-based (fixes nickname-collision edge case; behavior otherwise identical).
