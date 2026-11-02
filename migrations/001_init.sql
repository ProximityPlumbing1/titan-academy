-- Titan Academy v1 schema (Railway Postgres)

create table users (
  id uuid primary key default gen_random_uuid(),
  seed_key text unique,
  name text not null,
  email text,
  password_hash text,
  status text not null default 'invited' check (status in ('invited', 'active', 'disabled')),
  position text,
  trade_role text check (trade_role in ('install', 'service', 'salestech')),
  training_group text,
  is_admin boolean not null default false,
  is_office boolean not null default false,
  is_trainer boolean not null default false,
  is_assessor boolean not null default false,
  is_lead_tech boolean not null default false,
  is_apprentice boolean not null default false,
  created_at timestamptz not null default now(),
  last_login_at timestamptz,
  last_seen_at timestamptz
);
create unique index users_email_uq on users (lower(email)) where email is not null;

create table sessions (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  user_agent text
);
create index sessions_user_idx on sessions (user_id);

create table auth_tokens (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('invite', 'reset')),
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index auth_tokens_user_idx on auth_tokens (user_id);

create table lesson_progress (
  user_id uuid not null references users(id) on delete cascade,
  module_id text not null,
  lesson_index int not null,
  source text not null default 'self',
  completed_at timestamptz not null default now(),
  primary key (user_id, module_id, lesson_index)
);

create table quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  module_id text not null,
  score int not null,
  passed boolean not null,
  answers jsonb not null default '[]',
  source text not null default 'self',
  class_id uuid,
  created_at timestamptz not null default now()
);
create index quiz_attempts_user_idx on quiz_attempts (user_id, module_id);

create table classes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  group_id text not null,
  module_ids text[] not null,
  scheduled_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'ended')),
  join_code text,
  presenter_id uuid references users(id),
  current_slide int not null default 0,
  phase text not null default 'show',
  revealed text[] not null default '{}',
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz,
  summary jsonb
);
create unique index classes_live_code_uq on classes (join_code) where status = 'live';

create table class_attendance (
  class_id uuid not null references classes(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  manual boolean not null default false,
  primary key (class_id, user_id)
);

create table class_answers (
  class_id uuid not null references classes(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  slide_key text not null,
  choice int not null,
  correct boolean,
  answered_at timestamptz not null default now(),
  primary key (class_id, user_id, slide_key)
);
