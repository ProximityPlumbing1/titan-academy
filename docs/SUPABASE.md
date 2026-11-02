# Supabase backend (LEGACY, read only)

> **v2 doesn't use Supabase.** Titan Academy v2 runs on Railway Postgres like Proximity's other
> apps (see `BUILD_INSTRUCTIONS.md`). This file documents the old Netlify app's backend. The
> "Proposed new tables" section below is still the reference **data model**: build it in
> Railway Postgres, with `auth.users` becoming the app's own `users` table, and RLS and RPCs
> becoming server-side checks and API routes. Never change the legacy Supabase project
> without the owner's OK.


- Project URL: `https://zszkxjsjnrynkksbpbtu.supabase.co`
- The anon (public) key is in `legacy/index.html` line 3311 and in `.env.example`. It's
  meant to be public, but treat it as config rather than code.
- **This project is shared with other Proximity apps.** The `users` table is keyed by an
  `app` column, and admins are recognised across apps.

The schema below is **inferred from client code** and has not been confirmed. Before
building, get the real schema in one of these ways:
- `supabase db dump --schema public` (needs the DB password), or
- Supabase dashboard → SQL editor → run the query at the bottom of this file and paste the
  results into this doc.

## Tables used

### `users` (shared across apps)
Columns the app uses: `id`, `app` (always filtered `= 'titan'`), `email`, `name`, `role`
(`'admin'` grants all paths), `status` (`pending` | `approved` | `disabled`),
`titan_access` (text[] or jsonb array of path ids), `titan_requested_role`, `last_login`.

Operations:
- **Learner:** select own row by email (`name, role, status, titan_access`).
- **Admin:** select all titan rows. Update `status` and `titan_access` by `id`.

### `titan_progress`
Columns: `user_id` (unique, = `auth.users.id`), `progress` (jsonb, shape in
`CURRENT_APP.md`), `updated_at`, `time_spent_seconds` (incremented by the heartbeat RPC).

Operations:
- **Learner:** select and upsert own row.
- **Admin:** select all rows.

## RPCs used
| RPC | Args | Purpose |
|---|---|---|
| `is_titan_admin()` | none | Returns true for cross-app admins. The legacy code names John and William. **John has left. Aldwin replaces him as admin (confirmed by the owner).** Show the owner the SQL that removes John and adds Aldwin before running it, because this function is shared across apps. |
| `titan_register(p_name, p_requested_role)` | text, text | Creates a pending `users` row (`app = 'titan'`) for the current auth user. |
| `titan_heartbeat(p_seconds)` | int | Adds seconds to `time_spent_seconds` and probably updates `last_login`. |

## Auth
- Email/password, with self sign-up enabled.
- Google OAuth, hinted to the `proximityplumbing.com.au` domain. **When the app moves to
  Railway, add the new domain(s)** under Supabase → Authentication → URL Configuration →
  Site URL / Redirect URLs. Otherwise Google sign-in will bounce back to Netlify or fail.
- The `hd` parameter is only a hint. If the app must be limited to company accounts,
  enforce that server-side (in `titan_register` or a trigger).

## Things to verify (security)
- RLS on `users`: can a non-admin select other people's rows or update their own `status`
  or `titan_access`? The client never tries, but the policy has to block it.
- RLS on `titan_progress`: is it own-row only, with admin read? Since the client upserts the
  whole blob, a learner can currently give themselves any XP or certificates. Phase 3
  server-side grading addresses this.

## Schema discovery query
```sql
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name in ('users','titan_progress')
order by table_name, ordinal_position;

select policyname, tablename, cmd, roles, qual, with_check
from pg_policies where tablename in ('users','titan_progress');

select proname, pg_get_function_identity_arguments(oid) as args, prosrc
from pg_proc where proname in ('is_titan_admin','titan_register','titan_heartbeat');
```

## Proposed new tables for v2 (additive only; get sign-off before running)
These support the four requirements in `REBUILD_BRIEF.md`. Nothing existing is changed.

```sql
-- Per-tech settings (users is shared across apps, so keep Titan-specific fields here)
create table titan_learner_settings (
  user_id uuid primary key references auth.users(id),
  trade_role text check (trade_role in ('install','service','salestech')),
  training_group text,                       -- 'install' | 'service' | 'sales'
  program_id uuid,                           -- which 8-week run they're in
  is_assessor boolean not null default false,
  is_trainer boolean not null default false, -- can run live sessions (admins can always)
  is_apprentice boolean not null default false,
  is_lead_tech boolean not null default false,  -- can sign off technical items for their trade_role
  supervisor_id uuid references auth.users(id)
);

-- An 8-week program run (cohort)
create table titan_programs (
  id uuid primary key default gen_random_uuid(),
  name text not null,                        -- e.g. 'Field Team Certification Feb–Mar 2027'
  start_date date not null,
  schedule jsonb not null,                   -- copied from trade-paths.json program.schedule
  created_at timestamptz not null default now()
);

-- Live sessions (one row per scheduled session)
create table titan_sessions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references titan_programs(id),
  group_id text not null,                    -- 'all' | 'selling' | 'install' | 'service' | 'sales'
  module_ids text[] not null,                -- e.g. {f1,f2,f3}, or {final}
  scheduled_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','live','ended')),
  join_code text unique,                     -- short code shown on the TV while live
  presenter_id uuid references auth.users(id),
  current_slide int not null default 0,
  phase text not null default 'show',        -- show | question_open | question_closed | reveal
  started_at timestamptz, ended_at timestamptz
);
create table titan_session_attendance (
  session_id uuid references titan_sessions(id), user_id uuid references auth.users(id),
  joined_at timestamptz not null default now(), manual boolean not null default false,
  primary key (session_id, user_id)
);
create table titan_session_answers (
  session_id uuid references titan_sessions(id), user_id uuid references auth.users(id),
  slide_key text not null,                   -- e.g. 'f1.q3' or 'f4.sim.2'
  choice int not null, correct boolean, answered_at timestamptz not null default now(),
  primary key (session_id, user_id, slide_key)
);

-- Practical sign-offs on live jobs
create table titan_signoffs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  path_id text not null, module_id text not null,
  item_index int not null, item_text text not null,
  assessor_id uuid not null references auth.users(id),
  supervised boolean not null default false, -- apprentices
  assessor_role text,                        -- 'install_manager' | 'lead_tech' | 'sales_manager' | 'dispatch' | 'admin'
  job_ref text,                              -- ServiceTitan job number for evidence-based sign-offs
  evidence_paths text[],                     -- photos/video attached by the tech
  signed_at timestamptz not null default now(), note text, photo_path text,
  unique (user_id, path_id, module_id, item_index)
);

-- Advanced Sales scoreboard: baseline and weekly numbers per sales tech
create table titan_sales_metrics (
  user_id uuid references auth.users(id), week int not null,  -- 0 = baseline
  avg_sale numeric, items_per_quote numeric, bundled_quote_pct numeric,
  conversion_pct numeric, open_estimate_value numeric,
  financed_pct numeric,            -- share of big jobs financed via HomePro (benchmark 40%)
  care_plan_offer_pct numeric,     -- Care Plan offered on completed jobs
  source text,                     -- 'manual' | 'csv'
  recorded_at timestamptz not null default now(), primary key (user_id, week)
);

-- Final assessment attempts
create table titan_final_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id), role text not null,
  session_id uuid references titan_sessions(id),
  question_ids text[] not null, answers int[], score int, passed boolean,
  started_at timestamptz not null default now(), submitted_at timestamptz
);

-- Certificates
create table titan_certificates (
  id uuid primary key default gen_random_uuid(),
  cert_number text unique not null,          -- e.g. 'PP-TA-2027-0001'
  user_id uuid not null references auth.users(id),
  role text not null, title text not null,   -- 'Proximity Certified Install Technician'
  supervised boolean not null default false,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz
);
```

### RPCs (security definer, small and auditable)
| RPC | Purpose |
|---|---|
| `titan_live_join(code)` | Validates the code and the caller's group, then inserts attendance. Returns the session and current state. |
| `titan_live_answer(session_id, slide_key, choice)` | Only works if the caller has joined and that question is open right now. |
| `titan_live_end(session_id)` | Presenter or admin only. Credits lessons, records quiz and sim attempts, and closes the session. |
| `titan_check_certification(user_id)` | Runs after any completion event and issues the certificate when every requirement is met. |
| `titan_verify_certificate(cert_number)` | **Callable without logging in.** Returns only name, title, issue date and valid/revoked. |

### RLS outline
- Techs read only their own rows: settings, attendance, answers, sign-offs, attempts,
  certificates.
- Admins and trainers read everything for the dashboard.
- Assessors insert sign-offs (for apprentices, only if they're the supervisor, or an admin).
- `titan_sessions`: group members can read their own group's sessions. Only the presenter
  or an admin can update a session.
- The TV view uses no login. It reads session state through the join code via a narrow RPC
  (or Realtime broadcast only) and never sees names or answers.

### Realtime
Turn on Realtime for `titan_sessions` (or rely on Broadcast plus a polling fallback). Use
Presence on channel `live:{sessionId}`. See `LIVE_SESSIONS.md`.

### Inviting techs (server only)
`auth.admin.inviteUserByEmail` needs the **service-role key**, so it runs on the Railway Node
server (`/api/admin/invite`). The server verifies the caller's JWT is an admin
(`is_titan_admin`) before acting. Add the Railway domain to the Auth redirect URLs so invite
links land in the app.
