-- 8-week program and field sign-offs.

-- Who receives sign-off requests. Flags, not names, so a new Install Manager takes over
-- Charlotte's routing by switching two flags.
alter table users
  add column is_install_manager boolean not null default false,
  add column is_sales_manager boolean not null default false,
  add column is_dispatch boolean not null default false,
  add column signoff_all boolean not null default false,  -- can sign off anything (William, Charlotte)
  add column supervisor_id uuid references users(id);     -- apprentices' supervising tech

update users set is_install_manager = true, signoff_all = true where seed_key = 'office:charlotte';
update users set signoff_all = true where seed_key = 'office:william';
update users set is_sales_manager = true where seed_key = 'office:harriet';
update users set is_dispatch = true where seed_key = 'office:kim';

-- One 8-week run (cohort). Only one is active at a time.
create table programs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  schedule jsonb not null,           -- copied from data/trade-paths.json program.schedule
  group_times jsonb not null,        -- { field: { weekday: 1, time: "07:00" }, ... } (weekday 1 = Monday)
  active boolean not null default true,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
create unique index programs_one_active on programs (active) where active;

alter table classes
  add column program_id uuid references programs(id) on delete cascade,
  add column week int;

-- A field sign-off: requested by the tech, approved or sent back by an assessor.
create table signoffs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  module_id text not null,
  item_index int not null,
  item_text text not null,
  status text not null default 'waiting' check (status in ('waiting', 'approved', 'returned')),
  job_ref text,                      -- ServiceTitan job number
  tech_note text,
  requested_at timestamptz not null default now(),
  reviewed_by uuid references users(id),
  review_note text,
  reviewed_at timestamptz,
  unique (user_id, module_id, item_index)
);
create index signoffs_status on signoffs (status, requested_at);

-- Photos attached to a sign-off request (resized on the phone, so each is small).
create table signoff_photos (
  id uuid primary key default gen_random_uuid(),
  signoff_id uuid not null references signoffs(id) on delete cascade,
  mime text not null,
  bytes bytea not null,
  created_at timestamptz not null default now()
);
create index signoff_photos_signoff on signoff_photos (signoff_id);
