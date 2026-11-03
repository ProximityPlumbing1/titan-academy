import type { FastifyInstance } from 'fastify';
import { one, q } from './db.js';
import { HttpError, isStaff, need, type UserRow } from './auth.js';
import { getModule, modulesForRole } from './content.js';
import { activeProgram, dueDates, signoffItems, sydneyToday, weekOf } from './program.js';
import { completeModules } from './progress.js';

// ------------------------------------------------------------------ CSV export

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  // Quote, and stop spreadsheet formula injection from names or notes.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
export const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';

const ROLE: Record<string, string> = { install: 'Install', service: 'Service', salestech: 'Sales' };

async function progressCsv() {
  const techs = await q<UserRow>(`select * from users where trade_role is not null order by trade_role, name`);
  const ids = techs.map((t) => t.id);
  const program = await activeProgram();
  const today = sydneyToday();
  const complete = await completeModules(ids);
  const lessons = new Map((await q<{ k: string; n: number }>(
    `select user_id || ':' || module_id k, count(*)::int n from lesson_progress where user_id = any($1) group by 1`, [ids])).map((r) => [r.k, r.n]));
  const quiz = new Map((await q<{ k: string; best: number; n: number; passed: boolean }>(
    `select user_id || ':' || module_id k, max(score)::int best, count(*)::int n, bool_or(passed) passed
       from quiz_attempts where user_id = any($1) group by 1`, [ids])).map((r) => [r.k, r]));
  const signoffs = new Map((await q<{ k: string; approved: number; waiting: number }>(
    `select user_id || ':' || module_id k, count(*) filter (where status = 'approved')::int approved,
            count(*) filter (where status = 'waiting')::int waiting
       from signoffs where user_id = any($1) group by 1`, [ids])).map((r) => [r.k, r]));
  const finals = new Map((await q<{ user_id: string; best: number; passed: boolean }>(
    `select user_id, max(score)::int best, coalesce(bool_or(passed), false) passed from final_attempts
      where user_id = any($1) and submitted_at is not null group by 1`, [ids])).map((r) => [r.user_id, r]));
  const certs = new Map((await q<{ user_id: string; number: string; completed_on: string }>(
    `select user_id, number, completed_on::text from certificates where revoked_at is null`)).map((r) => [r.user_id, r]));
  const rows: unknown[][] = [[
    'Name', 'Role', 'Apprentice', 'Account', 'Module', 'Module title', 'Due', 'Lessons read', 'Lessons', 'Quiz best %',
    'Quiz attempts', 'Quiz passed', 'Module complete', 'Overdue', 'Sign-offs approved', 'Sign-offs waiting', 'Sign-offs total',
    'Final best %', 'Final passed', 'Certificate', 'Certified on',
  ]];
  for (const t of techs) {
    const due = program ? dueDates(program, t.trade_role) : new Map();
    for (const m of modulesForRole(t.trade_role)) {
      const k = `${t.id}:${m}`;
      const done = complete.get(t.id)?.has(m) ?? false;
      const d = due.get(m)?.due ?? '';
      rows.push([
        t.name, ROLE[t.trade_role!] ?? t.trade_role, t.is_apprentice ? 'yes' : '', t.status, m, getModule(m)?.module.title,
        d, lessons.get(k) ?? 0, getModule(m)?.module.lessons.length, quiz.get(k)?.best ?? '', quiz.get(k)?.n ?? 0,
        quiz.get(k)?.passed ? 'yes' : '', done ? 'yes' : '', d && !done && d < today ? 'yes' : '',
        signoffs.get(k)?.approved ?? 0, signoffs.get(k)?.waiting ?? 0, signoffItems(m).length,
        finals.get(t.id)?.best ?? '', finals.get(t.id)?.passed ? 'yes' : '', certs.get(t.id)?.number ?? '', certs.get(t.id)?.completed_on ?? '',
      ]);
    }
  }
  return toCsv(rows);
}

async function signoffsCsv() {
  const rows = await q(
    `select u.name, u.trade_role, s.module_id, s.item_index, s.item_text, s.status, s.job_ref, s.tech_note,
            s.requested_at, r.name reviewer, s.review_note, s.reviewed_at
       from signoffs s join users u on u.id = s.user_id left join users r on r.id = s.reviewed_by
      order by u.name, s.module_id, s.item_index`);
  return toCsv([
    ['Name', 'Role', 'Module', 'Item', 'Sign-off', 'Status', 'ServiceTitan job', 'Tech note', 'Requested', 'Reviewed by', 'Review note', 'Reviewed'],
    ...rows.map((r: any) => [r.name, ROLE[r.trade_role] ?? r.trade_role, r.module_id, r.item_index + 1, r.item_text, r.status, r.job_ref,
      r.tech_note, r.requested_at?.toISOString?.() ?? r.requested_at, r.reviewer, r.review_note, r.reviewed_at?.toISOString?.() ?? r.reviewed_at ?? '']),
  ]);
}

// ------------------------------------------------------------------ sales scoreboard

const METRICS = ['avg_ticket', 'close_rate', 'bundled_pct', 'financed_pct', 'care_plan_pct'] as const;
const canScore = (u: UserRow) => u.is_admin || u.is_sales_manager;

export async function registerExtras(app: FastifyInstance) {
  app.get('/api/admin/export/:kind', async (req, reply) => {
    need(req, isStaff);
    const kind = (req.params as any).kind;
    const csv = kind === 'progress.csv' ? await progressCsv() : kind === 'signoffs.csv' ? await signoffsCsv() : null;
    if (csv === null) throw new HttpError(404, 'Unknown export.');
    reply.header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="titan-academy-${kind.replace('.csv', '')}-${sydneyToday()}.csv"`)
      .header('cache-control', 'private, no-store');
    return reply.send('﻿' + csv); // BOM so Excel reads the UTF-8 names correctly
  });

  app.get('/api/admin/scoreboard', async (req) => {
    need(req, isStaff);
    const techs = await q<UserRow>(`select * from users where trade_role = 'salestech' and status <> 'disabled' order by name`);
    const metrics = await q(`select * from sales_metrics where user_id = any($1) order by week`, [techs.map((t) => t.id)]);
    const program = await activeProgram();
    return {
      week: program ? Math.min(8, weekOf(program)) : null,
      techs: techs.map((t) => ({ id: t.id, name: t.name, rows: metrics.filter((m: any) => m.user_id === t.id) })),
    };
  });

  app.put('/api/admin/scoreboard/:userId/:week', async (req) => {
    const me = need(req, canScore);
    const { userId, week } = req.params as any;
    const w = Number(week);
    if (!Number.isInteger(w) || w < 0 || w > 52) throw new HttpError(400, 'Week must be 0 (baseline) to 52.');
    const t = await one<UserRow>(`select * from users where id = $1`, [userId]);
    if (!t || t.trade_role !== 'salestech') throw new HttpError(400, 'The scoreboard is for Sales Techs.');
    const b = (req.body ?? {}) as any;
    const vals = METRICS.map((k) => {
      const v = b[k];
      if (v === null || v === '' || v === undefined) return null;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || (k !== 'avg_ticket' && n > 100) || n > 10_000_000) throw new HttpError(400, `That ${k.replace('_', ' ')} doesn't look right.`);
      return n;
    });
    if (vals.every((v) => v === null)) {
      await q(`delete from sales_metrics where user_id = $1 and week = $2`, [userId, w]);
      return { ok: true, deleted: true };
    }
    const note = typeof b.note === 'string' ? b.note.trim().slice(0, 300) || null : null;
    await q(
      `insert into sales_metrics (user_id, week, ${METRICS.join(', ')}, note, recorded_by, recorded_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
       on conflict (user_id, week) do update set ${METRICS.map((k, i) => `${k} = $${i + 3}`).join(', ')}, note = $8, recorded_by = $9, recorded_at = now()`,
      [userId, w, ...vals, note, me.id]);
    return { ok: true };
  });

  // A Sales Tech's own two numbers, for their phone.
  app.get('/api/me/numbers', async (req) => {
    const u = need(req);
    if (u.trade_role !== 'salestech') return { rows: [] };
    return { rows: await q(`select week, avg_ticket, close_rate from sales_metrics where user_id = $1 order by week`, [u.id]) };
  });

  // Week 8 on the TV: everyone certified so far. Needs the live class's join code, like the TV view.
  app.get('/api/live/:code/certified', async (req) => {
    const c = await one<{ group_id: string }>(`select group_id from classes where join_code = $1 and status = 'live'`, [(req.params as any).code]);
    if (!c) throw new HttpError(404, 'That class is not live.');
    const roles = c.group_id === 'all' ? ['install', 'service', 'salestech'] : c.group_id === 'sales' ? ['salestech'] : c.group_id === 'field' ? ['install', 'service'] : [c.group_id];
    const rows = await q<{ name: string; title: string }>(
      `select c.name, c.title from certificates c join users u on u.id = c.user_id
        where c.revoked_at is null and u.trade_role = any($1) order by c.issued_at`, [roles]);
    return { certified: rows };
  });
}
