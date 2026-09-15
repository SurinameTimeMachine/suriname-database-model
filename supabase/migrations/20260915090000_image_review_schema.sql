-- Image review app (/annotate): anonymous photo-review schema.
-- Identity is a server-generated UUID plus a user-chosen nickname; no login,
-- no email, no IP or device identifiers are stored.
-- RLS is enabled with no permissive policies (deny-all for anon/authenticated
-- roles). The app only connects server-side with the postgres role, which
-- bypasses RLS.

create table if not exists participants (
  participant_id uuid primary key default gen_random_uuid(),
  nickname text not null check (char_length(nickname) between 1 and 40),
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists tasks (
  task_id text primary key,
  record_key text not null unique,
  detail_id text not null default '',
  media_id text not null default '',
  media_type text not null default 'image',
  title text not null default '',
  description text not null default '',
  year_raw text not null default '',
  inventory_number text not null default '',
  document_type text not null default '',
  source_url text not null default '',
  low_res_url text not null default '',
  status text not null default 'unoffered'
    check (status in ('unoffered', 'assigned', 'pending-round-2', 'completed')),
  assignment_count integer not null default 0,
  last_assigned_at timestamptz,
  round1_participant uuid references participants (participant_id),
  round1_submitted_at timestamptz,
  round2_participant uuid references participants (participant_id),
  round2_submitted_at timestamptz,
  current_claim_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists claims (
  claim_id uuid primary key default gen_random_uuid(),
  task_id text not null references tasks (task_id),
  participant_id uuid not null references participants (participant_id),
  round smallint not null check (round in (1, 2)),
  assigned_at timestamptz not null default now(),
  lease_until timestamptz not null
);

alter table tasks
  add constraint tasks_current_claim_id_fkey
  foreign key (current_claim_id) references claims (claim_id);

create table if not exists submissions (
  submission_id uuid primary key default gen_random_uuid(),
  task_id text not null references tasks (task_id),
  participant_id uuid not null references participants (participant_id),
  claim_id uuid not null references claims (claim_id),
  round smallint not null check (round in (1, 2)),
  decision text not null check (decision in ('confirm', 'skip')),
  location_unknown boolean not null default false,
  added_places jsonb not null default '[]'::jsonb,
  added_dates jsonb not null default '[]'::jsonb,
  added_persons jsonb not null default '[]'::jsonb,
  notes text not null default '',
  payload jsonb not null,
  submitted_at timestamptz not null default now()
);

create index if not exists idx_claims_task on claims (task_id);
create index if not exists idx_claims_participant on claims (participant_id);
create index if not exists idx_submissions_task on submissions (task_id);
create index if not exists idx_submissions_participant on submissions (participant_id);
create index if not exists idx_tasks_claim_pool
  on tasks (status, assignment_count, last_assigned_at)
  where status in ('unoffered', 'pending-round-2', 'assigned');

alter table participants enable row level security;
alter table tasks enable row level security;
alter table claims enable row level security;
alter table submissions enable row level security;

comment on table participants is 'Anonymous review participants: server-generated UUID plus user-chosen nickname (max 40 chars). No email, IP, or device identifiers.';
comment on table tasks is 'One row per NAS mediabank image to review. Metadata is synced from data/nas-mediabank/nas-mediabank-records.json; review state is app-owned.';
comment on table claims is 'Lease-based task assignments. The active claim is referenced by tasks.current_claim_id; expired claims stay as history.';
comment on table submissions is 'Annotation payloads submitted per review round. Free-text notes may contain personal information: keep restricted, never publish raw rows.';
