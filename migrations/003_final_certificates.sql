-- Final assessment, live role-play round (Sales) and certificates.

create table settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into settings (key, value) values ('final_open', 'false');

-- Uploaded images the app needs (William's signature for certificates).
create table assets (
  key text primary key,
  mime text not null,
  bytes bytea not null,
  updated_by uuid references users(id),
  updated_at timestamptz not null default now()
);

-- One row per sitting. The questions are snapshotted so later edits to the pool don't change a result.
create table final_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  role text not null,
  questions jsonb not null,          -- [{ module, q, options, correct, why }]
  answers int[],
  score int,
  passed boolean,
  started_at timestamptz not null default now(),
  submitted_at timestamptz
);
create index final_attempts_user on final_attempts (user_id, started_at);

-- Extra sittings granted by an admin, on top of the two everyone gets.
create table final_grants (
  user_id uuid primary key references users(id) on delete cascade,
  extra int not null default 0
);

-- Sales Techs' live role-play round in week 8, marked by William or Harriet.
create table roleplay_passes (
  user_id uuid primary key references users(id) on delete cascade,
  passed_by uuid references users(id),
  passed_at timestamptz not null default now()
);

create sequence certificate_seq;
create table certificates (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  role_label text not null,
  name text not null,                -- name as printed
  completed_on date not null,
  issued_at timestamptz not null default now(),
  issued_by uuid references users(id), -- null = issued automatically
  seen_at timestamptz,               -- when the tech first opened it (celebration screen)
  revoked_at timestamptz,
  revoked_by uuid references users(id),
  revoke_reason text
);
create unique index certificates_one_valid on certificates (user_id) where revoked_at is null;
