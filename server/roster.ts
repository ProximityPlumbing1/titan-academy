import type { FastifyInstance } from 'fastify';
import { q, tx } from './db.js';
import { HttpError, isStaff, need, type UserRow } from './auth.js';
import { toCsv } from './extras.js';
import { sydneyToday } from './program.js';

// Roster CSV: same columns as data/team-roster.csv. Only `name` and `trade_role` are required;
// unknown columns are ignored. People missing from the file are listed, never removed automatically.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

const ROLES: Record<string, string> = {
  install: 'install', installer: 'install', 'install tech': 'install',
  service: 'service', 'service tech': 'service',
  salestech: 'salestech', sales: 'salestech', 'sales tech': 'salestech',
};
const GROUP: Record<string, string> = { install: 'install', service: 'service', salestech: 'sales' };
const yes = (v: string) => /^(y|yes|true|1)$/i.test(v.trim());
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const norm = (s: string) => s.normalize('NFKD').replace(/[’']/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const positionFor = (role: string, apprentice: boolean) =>
  role === 'install' ? (apprentice ? 'Install Tech (apprentice)' : 'Install Tech') : role === 'service' ? 'Service Tech' : 'Sales Tech';

export interface PlanRow {
  line: number; name: string; action: 'new' | 'update' | 'same' | 'error'; changes: string[]; error?: string;
  data?: { name: string; trade_role: string; is_apprentice: boolean; email: string | null; supervisor: string | null; lead: boolean | null };
  userId?: string;
}

export async function planRoster(csv: string): Promise<{ rows: PlanRow[]; notInFile: Array<{ id: string; name: string }> }> {
  const table = parseCsv(csv);
  if (!table.length) throw new HttpError(400, 'The file is empty.');
  const header = table[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const col = (n: string) => header.indexOf(n);
  if (col('name') < 0 || col('trade_role') < 0) throw new HttpError(400, 'The first row must have the column names, including name and trade_role.');
  if (table.length > 301) throw new HttpError(400, 'That file has more than 300 rows.');
  const users = await q<UserRow>(`select * from users`);
  const byEmail = new Map(users.filter((u) => u.email).map((u) => [u.email!.toLowerCase(), u]));
  const byName = new Map(users.map((u) => [norm(u.name), u]));
  const get = (r: string[], n: string) => (col(n) >= 0 ? (r[col(n)] ?? '').trim() : '');
  const seen = new Set<string>();
  const fileNames = new Set(table.slice(1).map((r) => norm(get(r, 'name'))));
  const rows: PlanRow[] = [];
  table.slice(1).forEach((r, i) => {
    const line = i + 2;
    const name = get(r, 'name').replace(/\s+/g, ' ');
    const roleRaw = get(r, 'trade_role').toLowerCase();
    const email = get(r, 'email').toLowerCase() || null;
    const supervisor = get(r, 'supervising_tech') || null;
    const leadRaw = get(r, 'lead_tech');
    const fail = (error: string) => rows.push({ line, name: name || '(no name)', action: 'error', changes: [], error });
    if (!name) return fail('Name is missing.');
    if (name.length > 120) return fail('Name is too long.');
    const role = ROLES[roleRaw];
    if (!role) return fail(`Unknown trade_role "${roleRaw || '(blank)'}". Use install, service or salestech.`);
    if (email && !EMAIL_RE.test(email)) return fail(`"${email}" isn't a valid email.`);
    if (seen.has(norm(name))) return fail('This name appears twice in the file.');
    seen.add(norm(name));
    if (supervisor && !byName.has(norm(supervisor)) && !fileNames.has(norm(supervisor))) return fail(`Supervising tech "${supervisor}" isn't in the team.`);
    const data = { name, trade_role: role, is_apprentice: yes(get(r, 'apprentice')), email, supervisor, lead: leadRaw ? yes(leadRaw) : null };
    const existing = (email && byEmail.get(email)) || byName.get(norm(name));
    if (email && existing && byEmail.get(email) && byEmail.get(email)!.id !== existing.id)
      return fail(`${email} already belongs to ${byEmail.get(email)!.name}.`);
    if (!existing) return void rows.push({ line, name, action: 'new', changes: [], data });
    if (existing.status === 'disabled') return void rows.push({ line, name, action: 'update', changes: ['re-enable account'], data, userId: existing.id });
    const changes: string[] = [];
    if (existing.name !== name) changes.push(`name: ${existing.name} → ${name}`);
    if (existing.trade_role !== role) changes.push(`role: ${existing.trade_role ?? 'office'} → ${role}`);
    if (existing.is_apprentice !== data.is_apprentice) changes.push(data.is_apprentice ? 'now an apprentice' : 'no longer an apprentice');
    if (email && existing.email?.toLowerCase() !== email) changes.push(`email: ${existing.email ?? '(none)'} → ${email}`);
    if (data.lead !== null && existing.is_lead_tech !== data.lead) changes.push(data.lead ? 'now a lead tech' : 'no longer a lead tech');
    if (supervisor) {
      const sup = byName.get(norm(supervisor));
      if (!sup || sup.id !== existing.supervisor_id) changes.push(`supervisor: ${supervisor}`);
    }
    rows.push({ line, name, action: changes.length ? 'update' : 'same', changes, data, userId: existing.id });
  });
  const notInFile = users
    .filter((u) => u.trade_role && u.status !== 'disabled' && !fileNames.has(norm(u.name)) && !(u.email && rows.some((r) => r.data?.email === u.email!.toLowerCase())))
    .map((u) => ({ id: u.id, name: u.name }));
  return { rows, notInFile };
}

export async function registerRoster(app: FastifyInstance) {
  app.post('/api/admin/roster/preview', { bodyLimit: 1024 * 1024 }, async (req) => {
    need(req, (u) => u.is_admin);
    const csv = typeof (req.body as any)?.csv === 'string' ? (req.body as any).csv : '';
    return planRoster(csv);
  });

  app.post('/api/admin/roster/apply', { bodyLimit: 1024 * 1024 }, async (req) => {
    need(req, (u) => u.is_admin);
    const csv = typeof (req.body as any)?.csv === 'string' ? (req.body as any).csv : '';
    const plan = await planRoster(csv);
    if (plan.rows.some((r) => r.action === 'error')) throw new HttpError(400, 'Fix the rows with errors first.');
    let added = 0, updated = 0;
    await tx(async (c) => {
      const ids = new Map<string, string>(); // name → id, for supervisors added in the same file
      for (const r of plan.rows) {
        const d = r.data!;
        if (r.action === 'new') {
          const base = `tech:${slug(d.name)}`;
          const taken = (await c.query(`select 1 from users where seed_key = $1`, [base])).rowCount;
          const row = (await c.query(
            `insert into users (seed_key, name, email, position, trade_role, training_group, is_apprentice, is_lead_tech)
             values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
            [taken ? `${base}-${Date.now().toString(36)}` : base, d.name, d.email, positionFor(d.trade_role, d.is_apprentice), d.trade_role,
              GROUP[d.trade_role], d.is_apprentice, d.lead ?? false])).rows[0];
          ids.set(norm(d.name), row.id);
          added++;
        } else if (r.action === 'update') {
          await c.query(
            `update users set name = $2, email = coalesce($3, email), trade_role = $4, training_group = $5, is_apprentice = $6,
                    position = $7, is_lead_tech = coalesce($8, is_lead_tech),
                    status = case when status = 'disabled' then (case when password_hash is null then 'invited' else 'active' end) else status end
              where id = $1`,
            [r.userId, d.name, d.email, d.trade_role, GROUP[d.trade_role], d.is_apprentice, positionFor(d.trade_role, d.is_apprentice), d.lead]);
          ids.set(norm(d.name), r.userId!);
          updated++;
        } else ids.set(norm(d.name), r.userId!);
      }
      // Supervisors last, so they can refer to people added in the same file.
      for (const r of plan.rows) {
        if (!r.data?.supervisor) continue;
        const sup = ids.get(norm(r.data.supervisor))
          ?? (await c.query(`select id from users where lower(name) = $1`, [norm(r.data.supervisor)])).rows[0]?.id;
        if (sup) await c.query(`update users set supervisor_id = $2 where id = $1`, [ids.get(norm(r.data.name)), sup]);
      }
    });
    return { added, updated, unchanged: plan.rows.filter((r) => r.action === 'same').length };
  });

  // The current field team, in the same format, for editing in a spreadsheet and importing back.
  app.get('/api/admin/roster.csv', async (req, reply) => {
    need(req, isStaff);
    const techs = await q<UserRow & { supervisor_name: string | null }>(
      `select u.*, s.name supervisor_name from users u left join users s on s.id = u.supervisor_id
        where u.trade_role is not null and u.status <> 'disabled' order by u.trade_role, u.name`);
    const csv = toCsv([
      ['name', 'trade_role', 'apprentice', 'email', 'lead_tech', 'supervising_tech'],
      ...techs.map((t) => [t.name, t.trade_role, t.is_apprentice ? 'yes' : 'no', t.email ?? '', t.is_lead_tech ? 'yes' : 'no', t.supervisor_name ?? '']),
    ]);
    reply.header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="titan-academy-roster-${sydneyToday()}.csv"`)
      .header('cache-control', 'private, no-store');
    return reply.send('﻿' + csv);
  });
}

