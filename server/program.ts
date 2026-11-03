import type { FastifyInstance } from 'fastify';
import { one, q, tx } from './db.js';
import { HttpError, canPresent, isStaff, need, type UserRow } from './auth.js';
import { getModule, modulesForRole, program as programSpec } from './content.js';

// ------------------------------------------------------------------ program and due dates

export interface GroupTime { weekday: number; time: string } // weekday 1 = Monday … 7 = Sunday
export interface ProgramRow {
  id: string; name: string; start_date: string; schedule: Array<{ week: number; sessions: Array<{ group: string; modules: string[] }> }>;
  group_times: Record<string, GroupTime>; active: boolean; created_at: string;
}

export const PROGRAM_GROUPS = ['field', 'install', 'service', 'sales', 'all'] as const;
const TZ = 'Australia/Sydney';

// The live-session groups each trade sits in.
export function groupsForRole(role: string | null): string[] {
  if (role === 'install') return ['field', 'install', 'all'];
  if (role === 'service') return ['field', 'service', 'all'];
  if (role === 'salestech') return ['sales', 'all'];
  return [];
}

// Today's date in Sydney as YYYY-MM-DD.
export function sydneyToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const isoWeekday = (date: string) => ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

// Week n (1-based) runs from start + 7(n-1) to start + 7n - 1. A module is due on the last day of
// the week its group covers it in class.
export function dueDates(p: Pick<ProgramRow, 'start_date' | 'schedule'>, role: string | null) {
  const groups = groupsForRole(role);
  const mine = new Set(modulesForRole(role));
  const out = new Map<string, { week: number; due: string }>();
  for (const w of p.schedule) {
    for (const s of w.sessions) {
      if (!groups.includes(s.group)) continue;
      for (const m of s.modules) if (mine.has(m) && !out.has(m)) out.set(m, { week: w.week, due: addDays(p.start_date, 7 * w.week - 1) });
    }
  }
  return out;
}

export function weekOf(p: Pick<ProgramRow, 'start_date'>, today = sydneyToday()): number {
  const days = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${p.start_date}T00:00:00Z`)) / 86400000);
  return days < 0 ? 0 : Math.floor(days / 7) + 1;
}

export async function activeProgram(): Promise<ProgramRow | null> {
  const r = await one<ProgramRow>(`select *, to_char(start_date, 'YYYY-MM-DD') start_date from programs where active`);
  return r ?? null;
}

// The scheduled date (YYYY-MM-DD) for a session: the group's weekday in that week. A group's second
// session in the same week goes two days later.
export function sessionDate(start: string, week: number, weekday: number, nth: number): string {
  const weekStart = addDays(start, 7 * (week - 1));
  const offset = (weekday - isoWeekday(weekStart) + 7) % 7;
  return addDays(weekStart, Math.min(6, offset + nth * 2));
}

const GROUP_NAMES: Record<string, string> = { field: 'Install + Service', install: 'Install', service: 'Service', sales: 'Advanced Sales', all: 'Everyone' };

// ------------------------------------------------------------------ sign-off routing

export type Route = 'lead_trade' | 'lead_install' | 'lead_service' | 'install_manager' | 'sales_manager' | 'dispatch';

// Reads each module's "Signed off by" line from trade-paths.json.
export function routeFor(moduleId: string): Route[] {
  const a = (getModule(moduleId)?.module.assessor ?? '').toLowerCase();
  const r = new Set<Route>();
  if (a.includes('lead tech in their trade')) r.add('lead_trade');
  if (a.includes('lead installer')) r.add('lead_install');
  if (a.includes('lead service tech')) r.add('lead_service');
  if (a.includes('charlotte') || a.includes('install manager')) r.add('install_manager');
  if (a.includes('harriet')) r.add('sales_manager');
  if (a.includes('kim')) r.add('dispatch');
  return [...r];
}

export function canReview(reviewer: UserRow, tech: Pick<UserRow, 'id' | 'trade_role'>, moduleId: string): boolean {
  if (reviewer.id === tech.id || reviewer.status !== 'active') return false;
  if (reviewer.signoff_all) return true;
  return routeFor(moduleId).some((r) =>
    (r === 'lead_trade' && reviewer.is_lead_tech && !!reviewer.trade_role && reviewer.trade_role === tech.trade_role)
    || (r === 'lead_install' && reviewer.is_lead_tech && reviewer.trade_role === 'install')
    || (r === 'lead_service' && reviewer.is_lead_tech && reviewer.trade_role === 'service')
    || (r === 'install_manager' && reviewer.is_install_manager)
    || (r === 'sales_manager' && reviewer.is_sales_manager)
    || (r === 'dispatch' && reviewer.is_dispatch));
}

export const isReviewer = (u: UserRow) =>
  u.signoff_all || u.is_lead_tech || u.is_install_manager || u.is_sales_manager || u.is_dispatch;

// ------------------------------------------------------------------ photos

const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 700 * 1024;
function decodePhoto(v: unknown): { mime: string; bytes: Buffer } {
  const m = typeof v === 'string' ? /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(v) : null;
  if (!m) throw new HttpError(400, 'Photos must be JPEG, PNG or WebP images.');
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length > MAX_PHOTO_BYTES) throw new HttpError(400, 'One of the photos is too large. Try again: the app shrinks them first.');
  const magic = bytes.subarray(0, 4).toString('hex');
  const ok = (m[1] === 'image/jpeg' && magic.startsWith('ffd8')) || (m[1] === 'image/png' && magic === '89504e47')
    || (m[1] === 'image/webp' && bytes.subarray(8, 12).toString('ascii') === 'WEBP');
  if (!ok) throw new HttpError(400, 'One of the photos is not a valid image.');
  return { mime: m[1], bytes };
}

// ------------------------------------------------------------------ routes

const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function signoffView(where: string, params: unknown[]) {
  return q(
    `select s.id, s.user_id, s.module_id, s.item_index, s.item_text, s.status, s.job_ref, s.tech_note, s.requested_at,
            s.review_note, s.reviewed_at, r.name reviewed_by_name, u.name tech_name, u.trade_role tech_role,
            u.is_apprentice tech_apprentice,
            coalesce((select array_agg(p.id order by p.created_at) from signoff_photos p where p.signoff_id = s.id), '{}') photo_ids
       from signoffs s join users u on u.id = s.user_id left join users r on r.id = s.reviewed_by
      where ${where}`, params);
}

export function signoffItems(moduleId: string): string[] {
  return getModule(moduleId)?.module.signoff ?? [];
}

export async function registerProgram(app: FastifyInstance) {
  // ---- program (admin)
  app.get('/api/admin/program', async (req) => {
    need(req, isStaff);
    const p = await activeProgram();
    const classes = p ? await q(
      `select id, title, group_id, module_ids, week, scheduled_at, status from classes where program_id = $1 order by week, scheduled_at`, [p.id]) : [];
    return {
      program: p, classes, week: p ? weekOf(p) : 0, today: sydneyToday(),
      defaults: { name: 'Field Team Certification Feb–Mar 2027', startDate: '2027-02-01', schedule: programSpec.schedule, groups: programSpec.groups },
    };
  });

  app.post('/api/admin/program', async (req) => {
    const me = need(req, (u) => u.is_admin);
    const b = req.body as any;
    const name = str(b?.name, 120);
    const start = str(b?.startDate, 10);
    if (!name) throw new HttpError(400, 'Give the program a name.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || isNaN(Date.parse(`${start}T00:00:00Z`))) throw new HttpError(400, 'Choose a start date.');
    const times: Record<string, GroupTime> = {};
    for (const g of PROGRAM_GROUPS) {
      const t = b?.groupTimes?.[g];
      const weekday = Number(t?.weekday);
      const time = str(t?.time, 5);
      if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
        throw new HttpError(400, `Set a day and time for ${GROUP_NAMES[g]}.`);
      times[g] = { weekday, time };
    }
    if (await activeProgram()) throw new HttpError(409, 'A program is already running. End it before creating another.');
    const schedule = programSpec.schedule as ProgramRow['schedule'];
    return tx(async (c) => {
      const p = (await c.query(
        `insert into programs (name, start_date, schedule, group_times, created_by) values ($1, $2, $3, $4, $5) returning id`,
        [name, start, JSON.stringify(schedule), JSON.stringify(times), me.id])).rows[0];
      let n = 0;
      for (const w of schedule) {
        const seen: Record<string, number> = {};
        for (const s of w.sessions) {
          const nth = seen[s.group] ?? 0;
          seen[s.group] = nth + 1;
          const t = times[s.group];
          const date = sessionDate(start, w.week, t.weekday, nth);
          const mods = s.modules.filter((m) => getModule(m));
          const title = mods.length
            ? `Week ${w.week} · ${GROUP_NAMES[s.group]}: ${mods.map((m) => getModule(m)!.module.title).join(', ')}`
            : `Week ${w.week} · ${GROUP_NAMES[s.group]}: final assessment and certificates`;
          await c.query(
            `insert into classes (title, group_id, module_ids, scheduled_at, created_by, program_id, week)
             values ($1, $2, $3, ($4::date + $5::time) at time zone '${TZ}', $6, $7, $8)`,
            [title.slice(0, 160), s.group, s.modules, date, t.time, me.id, p.id, w.week]);
          n++;
        }
      }
      return { ok: true, id: p.id, classes: n };
    });
  });

  app.post('/api/admin/program/end', async (req) => {
    need(req, (u) => u.is_admin);
    const p = await activeProgram();
    if (!p) throw new HttpError(404, 'No program is running.');
    await tx(async (c) => {
      await c.query(`delete from classes where program_id = $1 and status = 'scheduled'`, [p.id]);
      await c.query(`update programs set active = false where id = $1`, [p.id]);
    });
    return { ok: true };
  });

  // Move one class (any class that hasn't started).
  app.patch('/api/admin/classes/:id', async (req) => {
    need(req, canPresent);
    const b = req.body as any;
    const date = str(b?.date, 10);
    const time = str(b?.time, 5);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new HttpError(400, 'Choose a date and time.');
    const r = await q(
      `update classes set scheduled_at = ($2::date + $3::time) at time zone '${TZ}'
        where id = $1 and status = 'scheduled' returning id, scheduled_at`, [(req.params as any).id, date, time]);
    if (!r.length) throw new HttpError(400, 'Only classes that have not started can be moved.');
    return { class: r[0] };
  });

  // ---- learner: this week
  app.get('/api/me/program', async (req) => {
    const u = need(req);
    const p = await activeProgram();
    if (!p || !u.trade_role) return { program: null };
    const today = sydneyToday();
    const due = dueDates(p, u.trade_role);
    const passed = new Set((await q<{ module_id: string }>(
      `select distinct module_id from quiz_attempts where user_id = $1 and passed`, [u.id])).map((r) => r.module_id));
    const modules = [...due.entries()].map(([id, d]) => ({
      id, title: getModule(id)!.module.title, week: d.week, due: d.due, done: passed.has(id),
      overdue: !passed.has(id) && d.due < today,
    }));
    const groups = groupsForRole(u.trade_role);
    const next = await one(
      `select id, title, scheduled_at, status, join_code from classes
        where program_id = $1 and group_id = any($2) and status <> 'ended' and scheduled_at > now() - interval '3 hours'
        order by scheduled_at limit 1`, [p.id, groups]);
    return { program: { id: p.id, name: p.name, startDate: p.start_date, week: weekOf(p, today), weeks: p.schedule.length }, today, modules, nextClass: next };
  });

  // ---- learner: sign-offs
  app.get('/api/me/signoffs', async (req) => {
    const u = need(req);
    const rows = await signoffView('s.user_id = $1', [u.id]);
    const ids = modulesForRole(u.trade_role);
    const total = ids.reduce((n, id) => n + signoffItems(id).length, 0);
    return { signoffs: rows, total, approved: rows.filter((r: any) => r.status === 'approved').length };
  });

  app.post('/api/modules/:id/signoffs/:n', { bodyLimit: 4 * 1024 * 1024 }, async (req) => {
    const u = need(req);
    const { id, n } = req.params as any;
    const items = signoffItems(id);
    const idx = Number(n);
    if (!Number.isInteger(idx) || idx < 0 || idx >= items.length) throw new HttpError(404, 'Sign-off not found.');
    if (!modulesForRole(u.trade_role).includes(id)) throw new HttpError(403, 'This module is not in your training path.');
    const b = req.body as any;
    const photos = Array.isArray(b?.photos) ? b.photos : [];
    if (photos.length > MAX_PHOTOS) throw new HttpError(400, `Attach up to ${MAX_PHOTOS} photos.`);
    const decoded = photos.map(decodePhoto);
    const jobRef = str(b?.jobRef, 40);
    const note = str(b?.note, 600);
    if (!jobRef && !note && !decoded.length) throw new HttpError(400, 'Add the ServiceTitan job number, a note or a photo so the assessor can check it.');
    return tx(async (c) => {
      const existing = (await c.query(`select id, status from signoffs where user_id = $1 and module_id = $2 and item_index = $3 for update`, [u.id, id, idx])).rows[0];
      if (existing?.status === 'approved') throw new HttpError(409, 'This one is already signed off.');
      let sid: string;
      if (existing) {
        sid = existing.id;
        await c.query(
          `update signoffs set status = 'waiting', job_ref = $2, tech_note = $3, item_text = $4, requested_at = now(),
                  reviewed_by = null, review_note = null, reviewed_at = null where id = $1`, [sid, jobRef || null, note || null, items[idx]]);
        await c.query(`delete from signoff_photos where signoff_id = $1`, [sid]);
      } else {
        sid = (await c.query(
          `insert into signoffs (user_id, module_id, item_index, item_text, job_ref, tech_note) values ($1, $2, $3, $4, $5, $6) returning id`,
          [u.id, id, idx, items[idx], jobRef || null, note || null])).rows[0].id;
      }
      for (const p of decoded) await c.query(`insert into signoff_photos (signoff_id, mime, bytes) values ($1, $2, $3)`, [sid, p.mime, p.bytes]);
      return { ok: true, id: sid };
    });
  });

  app.delete('/api/signoffs/:id', async (req) => {
    const u = need(req);
    const r = await q(`delete from signoffs where id = $1 and user_id = $2 and status <> 'approved' returning id`, [(req.params as any).id, u.id]);
    if (!r.length) throw new HttpError(404, 'Request not found.');
    return { ok: true };
  });

  // ---- reviewers
  app.get('/api/review/signoffs', async (req) => {
    const me = need(req);
    if (!isReviewer(me) && !isStaff(me)) throw new HttpError(403, 'You do not review sign-offs.');
    const status = ['waiting', 'approved', 'returned'].includes((req.query as any)?.status) ? (req.query as any).status : 'waiting';
    const rows: any[] = await signoffView(`s.status = $1 order by ${status === 'waiting' ? 's.requested_at' : 's.reviewed_at desc'} limit 300`, [status]);
    const mine = rows.map((r) => ({ ...r, canReview: canReview(me, { id: r.user_id, trade_role: r.tech_role }, r.module_id),
      moduleTitle: getModule(r.module_id)?.module.title, assessor: getModule(r.module_id)?.module.assessor ?? null }));
    return { signoffs: isStaff(me) || me.signoff_all ? mine : mine.filter((r) => r.canReview) };
  });

  app.post('/api/review/signoffs/:id', async (req) => {
    const me = need(req);
    const b = req.body as any;
    const action = b?.action === 'approve' ? 'approved' : b?.action === 'return' ? 'returned' : null;
    if (!action) throw new HttpError(400, 'Approve or send back.');
    const note = str(b?.note, 600);
    if (action === 'returned' && !note) throw new HttpError(400, 'Say what the tech needs to do before it can be signed off.');
    const s = await one(`select s.*, u.trade_role from signoffs s join users u on u.id = s.user_id where s.id = $1`, [(req.params as any).id]);
    if (!s) throw new HttpError(404, 'Sign-off not found.');
    if (!canReview(me, { id: s.user_id, trade_role: s.trade_role }, s.module_id)) throw new HttpError(403, 'This sign-off is routed to someone else.');
    if (s.status !== 'waiting') throw new HttpError(409, 'Someone has already reviewed this one.');
    await q(`update signoffs set status = $2, review_note = $3, reviewed_by = $4, reviewed_at = now() where id = $1`, [s.id, action, note || null, me.id]);
    return { ok: true };
  });

  app.get('/api/signoffs/:id/photos/:pid', async (req, reply) => {
    const me = need(req);
    const { id, pid } = req.params as any;
    const s = await one(`select s.user_id, s.module_id, u.trade_role from signoffs s join users u on u.id = s.user_id where s.id = $1`, [id]);
    if (!s) throw new HttpError(404, 'Not found.');
    if (s.user_id !== me.id && !isStaff(me) && !canReview(me, { id: s.user_id, trade_role: s.trade_role }, s.module_id))
      throw new HttpError(403, 'Not allowed.');
    const p = await one(`select mime, bytes from signoff_photos where id = $1 and signoff_id = $2`, [pid, id]);
    if (!p) throw new HttpError(404, 'Not found.');
    reply.header('content-type', p.mime).header('cache-control', 'private, max-age=86400').header('x-content-type-options', 'nosniff');
    return reply.send(p.bytes);
  });
}

