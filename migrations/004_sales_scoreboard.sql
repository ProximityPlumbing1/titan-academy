-- Advanced Sales scoreboard: a baseline (week 0) and weekly numbers per Sales Tech, entered by
-- Harriet or an admin until they can be pulled from ServiceTitan.
create table sales_metrics (
  user_id uuid not null references users(id) on delete cascade,
  week int not null check (week between 0 and 52),   -- 0 = baseline (their last 90 days)
  avg_ticket numeric(10, 2),
  close_rate numeric(5, 2),       -- percent
  bundled_pct numeric(5, 2),      -- quotes with a bundled option, percent
  financed_pct numeric(5, 2),     -- big jobs financed through HomePro, percent
  care_plan_pct numeric(5, 2),    -- Care Plan offered on completed jobs, percent
  note text,
  recorded_by uuid references users(id),
  recorded_at timestamptz not null default now(),
  primary key (user_id, week)
);
