import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { PDFDocument, rgb, type PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode';
import { one, q, tx } from './db.js';
import { config } from './config.js';
import { HttpError, isStaff, need, type UserRow } from './auth.js';
import { modulesForRole, pathsForRole } from './content.js';
import { signoffItems, sydneyToday } from './program.js';

// ------------------------------------------------------------------ question pools

export interface FinalQuestion { module: string; q: string; options: string[]; correct: number; why: string }
export const FINAL_LENGTH = 25;
export const BASE_ATTEMPTS = 2; // the sitting plus one retake

const poolDir = path.join(process.cwd(), 'content', 'final');
const pools: Record<string, FinalQuestion[]> = {};
for (const role of ['install', 'service', 'salestech']) {
  const file = path.join(poolDir, `${role}.json`);
  pools[role] = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).questions : [];
}
export const poolFor = (role: string | null) => (role ? pools[role] ?? [] : []);

// Draws up to 25, spread across modules: shuffle, then round-robin by module.
export function drawFinal(role: string, rand: () => number = Math.random): FinalQuestion[] {
  const shuffle = <T>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const byModule = new Map<string, FinalQuestion[]>();
  for (const qq of shuffle([...poolFor(role)])) byModule.set(qq.module, [...(byModule.get(qq.module) ?? []), qq]);
  const out: FinalQuestion[] = [];
  const lists = shuffle([...byModule.values()]);
  while (out.length < FINAL_LENGTH && lists.some((l) => l.length)) for (const l of lists) if (l.length && out.length < FINAL_LENGTH) out.push(l.shift()!);
  return shuffle(out);
}

// ------------------------------------------------------------------ certificate rules

export function certificateTitle(u: Pick<UserRow, 'trade_role' | 'is_apprentice'>) {
  if (u.trade_role === 'install') return u.is_apprentice
    ? { title: 'Supervised Competency, Install', role: 'Install Technician (apprentice)' }
    : { title: 'Proximity Certified Install Technician', role: 'Install Technician' };
  if (u.trade_role === 'service') return { title: 'Proximity Certified Service Technician', role: 'Service Technician' };
  if (u.trade_role === 'salestech') return { title: 'Proximity Advanced Sales Certification', role: 'Sales Technician' };
  return null;
}

async function settingBool(key: string) {
  return (await one<{ value: unknown }>(`select value from settings where key = $1`, [key]))?.value === true;
}

export async function attemptsAllowed(userId: string) {
  return BASE_ATTEMPTS + ((await one<{ extra: number }>(`select extra from final_grants where user_id = $1`, [userId]))?.extra ?? 0);
}

export interface CertStatus {
  modules: { done: number; total: number; missing: string[] };
  signoffs: { approved: number; total: number };
  final: { passed: boolean; best: number | null; used: number; allowed: number };
  roleplay: boolean | null; // null = not required
  eligible: boolean;
}

export async function statusFor(users: UserRow[]): Promise<Map<string, CertStatus>> {
  const ids = users.map((u) => u.id);
  const out = new Map<string, CertStatus>();
  if (!ids.length) return out;
  const passed = new Map<string, Set<string>>();
  for (const r of await q<{ user_id: string; module_id: string }>(
    `select distinct user_id, module_id from quiz_attempts where passed and user_id = any($1)`, [ids]))
    (passed.get(r.user_id) ?? passed.set(r.user_id, new Set()).get(r.user_id)!).add(r.module_id);
  const approved = new Map<string, Set<string>>();
  for (const r of await q<{ user_id: string; k: string }>(
    `select user_id, module_id || ':' || item_index k from signoffs where status = 'approved' and user_id = any($1)`, [ids]))
    (approved.get(r.user_id) ?? approved.set(r.user_id, new Set()).get(r.user_id)!).add(r.k);
  const finals = new Map((await q<{ user_id: string; used: number; best: number | null; passed: boolean }>(
    `select user_id, count(*) filter (where submitted_at is not null)::int used, max(score)::int best, coalesce(bool_or(passed), false) passed
       from final_attempts where user_id = any($1) group by 1`, [ids])).map((r) => [r.user_id, r]));
  const grants = new Map((await q<{ user_id: string; extra: number }>(`select user_id, extra from final_grants where user_id = any($1)`, [ids])).map((r) => [r.user_id, r.extra]));
  const rp = new Set((await q<{ user_id: string }>(`select user_id from roleplay_passes where user_id = any($1)`, [ids])).map((r) => r.user_id));
  for (const u of users) {
    const mods = modulesForRole(u.trade_role);
    const p = passed.get(u.id) ?? new Set();
    const missing = mods.filter((m) => !p.has(m));
    const items = mods.flatMap((m) => signoffItems(m).map((_, i) => `${m}:${i}`));
    const a = approved.get(u.id) ?? new Set();
    const f = finals.get(u.id);
    const roleplay = u.trade_role === 'salestech' ? rp.has(u.id) : null;
    const final = { passed: !!f?.passed, best: f?.best ?? null, used: f?.used ?? 0, allowed: BASE_ATTEMPTS + (grants.get(u.id) ?? 0) };
    const signoffs = { approved: items.filter((k) => a.has(k)).length, total: items.length };
    out.set(u.id, {
      modules: { done: mods.length - missing.length, total: mods.length, missing }, signoffs, final, roleplay,
      eligible: !!mods.length && !missing.length && signoffs.approved === signoffs.total && final.passed && roleplay !== false,
    });
  }
  return out;
}

function newNumber(seq: number) {
  const year = sydneyToday().slice(0, 4);
  const suffix = Array.from(crypto.randomBytes(4), (b) => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[b % 31]).join('');
  return `TA-${year}-${String(seq).padStart(4, '0')}-${suffix}`;
}

async function issue(u: UserRow, by: string | null) {
  const t = certificateTitle(u);
  if (!t) throw new HttpError(400, 'Only techs on a training path get certificates.');
  return tx(async (c) => {
    if ((await c.query(`select 1 from certificates where user_id = $1 and revoked_at is null`, [u.id])).rowCount) return null;
    const seq = Number((await c.query(`select nextval('certificate_seq') n`)).rows[0].n);
    const r = await c.query(
      `insert into certificates (number, user_id, title, role_label, name, completed_on, issued_by) values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [newNumber(seq), u.id, t.title, t.role, u.name, sydneyToday(), by]);
    return r.rows[0];
  });
}

// Issues the certificate the moment the last requirement is met. Safe to call any time.
export async function maybeIssue(userIds: string[]) {
  if (!userIds.length) return;
  const users = await q<UserRow>(
    `select * from users where id = any($1) and trade_role is not null and status <> 'disabled'
        and not exists (select 1 from certificates c where c.user_id = users.id and c.revoked_at is null)`, [userIds]);
  const st = await statusFor(users);
  for (const u of users) if (st.get(u.id)?.eligible) {
    try { await issue(u, null); } catch (e) { console.error('certificate issue failed', u.id, e); }
  }
}

// ------------------------------------------------------------------ PDF

const fontFile = (pkg: string, file: string) => fs.readFileSync(path.join(process.cwd(), 'node_modules', '@fontsource', pkg, 'files', file));
const FONTS = {
  regular: fontFile('inter', 'inter-latin-400-normal.woff'),
  semi: fontFile('inter', 'inter-latin-600-normal.woff'),
  bold: fontFile('inter', 'inter-latin-800-normal.woff'),
  serif: fontFile('fraunces', 'fraunces-latin-500-italic.woff'),
};
const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const C = { cyan: hex('#00aded'), link: hex('#0083b8'), title: hex('#33353d'), body: hex('#4a4c55'), muted: hex('#77787f'), line: hex('#e5e5e5'), gold: hex('#d4a94a'), soft: hex('#ecf9fe'), navy: hex('#1a2332') };

export function verifyUrl(number: string) {
  return `${config.publicUrl.replace(/\/$/, '')}/verify/${encodeURIComponent(number)}`;
}

export async function certificatePdf(cert: { number: string; title: string; role_label: string; name: string; completed_on: string; revoked_at: string | null }) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`${cert.title}: ${cert.name}`);
  doc.setAuthor('Proximity Plumbing · Titan Academy');
  const f = {
    regular: await doc.embedFont(FONTS.regular, { subset: true }), semi: await doc.embedFont(FONTS.semi, { subset: true }),
    bold: await doc.embedFont(FONTS.bold, { subset: true }), serif: await doc.embedFont(FONTS.serif, { subset: true }),
  };
  const W = 841.89, H = 595.28;
  const page = doc.addPage([W, H]);
  const centre = (text: string, font: PDFFont, size: number, y: number, color = C.title, spacing = 0) => {
    const w = font.widthOfTextAtSize(text, size) + spacing * (text.length - 1);
    page.drawText(text, { x: (W - w) / 2, y, size, font, color, ...(spacing ? { characterSpacing: spacing } as any : {}) });
  };
  const fit = (text: string, font: PDFFont, max: number, width: number) => { let s = max; while (s > 14 && font.widthOfTextAtSize(text, s) > width) s -= 1; return s; };

  // Frame: pale cyan band at the top, cyan hairline border, gold corner accents.
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: 0, y: H - 10, width: W, height: 10, color: C.cyan });
  page.drawRectangle({ x: 24, y: 24, width: W - 48, height: H - 58, borderColor: C.line, borderWidth: 1 });
  for (const [x, y] of [[24, 24], [W - 24, 24], [24, H - 34], [W - 24, H - 34]]) page.drawCircle({ x, y, size: 3, color: C.gold });

  // Header
  page.drawText('PROXIMITY PLUMBING', { x: 52, y: H - 72, size: 10, font: f.bold, color: C.link, characterSpacing: 2.2 } as any);
  page.drawText('Titan', { x: 52, y: H - 92, size: 15, font: f.bold, color: C.title });
  page.drawText('Academy', { x: 52 + f.bold.widthOfTextAtSize('Titan ', 15), y: H - 92, size: 15, font: f.serif, color: C.link });
  const numLabel = `Certificate no. ${cert.number}`;
  page.drawText(numLabel, { x: W - 52 - f.regular.widthOfTextAtSize(numLabel, 9.5), y: H - 72, size: 9.5, font: f.regular, color: C.muted });

  // Body
  centre('CERTIFICATE OF COMPLETION', f.bold, 12, H - 150, C.link);
  const tSize = fit(cert.title, f.bold, 30, W - 180);
  centre(cert.title, f.bold, tSize, H - 192, C.title);
  centre('This certifies that', f.regular, 12.5, H - 236, C.muted);
  const nSize = fit(cert.name, f.serif, 46, W - 220);
  centre(cert.name, f.serif, nSize, H - 292, C.title);
  page.drawLine({ start: { x: W / 2 - 170, y: H - 306 }, end: { x: W / 2 + 170, y: H - 306 }, thickness: 1, color: C.cyan });
  centre(`${cert.role_label}`, f.semi, 12.5, H - 330, C.body);
  const done = 'has completed the Titan Academy 8-week program: every module, every field sign-off and the final assessment.';
  centre(done, f.regular, 11, H - 356, C.body);
  if (cert.title.startsWith('Supervised')) centre('Supervised competency. Reissued as full certification once licensed.', f.regular, 9.5, H - 374, C.muted);

  // Footer: signature, date, seal, QR
  const baseY = 92;
  const sig = await one<{ mime: string; bytes: Buffer }>(`select mime, bytes from assets where key = 'signature'`);
  if (sig) {
    const img = sig.mime === 'image/png' ? await doc.embedPng(sig.bytes) : await doc.embedJpg(sig.bytes);
    const scale = Math.min(170 / img.width, 52 / img.height);
    page.drawImage(img, { x: 70, y: baseY + 4, width: img.width * scale, height: img.height * scale });
  } else {
    page.drawText('William', { x: 74, y: baseY + 12, size: 26, font: f.serif, color: C.navy });
  }
  page.drawLine({ start: { x: 70, y: baseY }, end: { x: 270, y: baseY }, thickness: 0.8, color: C.title });
  page.drawText('William, Owner', { x: 70, y: baseY - 16, size: 10.5, font: f.semi, color: C.title });
  page.drawText('Proximity Plumbing', { x: 70, y: baseY - 30, size: 9.5, font: f.regular, color: C.muted });

  const date = new Date(`${cert.completed_on}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  centre(date, f.semi, 11.5, baseY, C.title);
  centre('Date completed', f.regular, 9.5, baseY - 16, C.muted);
  // Gold seal
  const sx = W / 2, sy = baseY + 62;
  page.drawCircle({ x: sx, y: sy, size: 30, borderColor: C.gold, borderWidth: 3 });
  page.drawCircle({ x: sx, y: sy, size: 24, color: hex('#fbf4e4') });
  const seal = 'CERTIFIED';
  page.drawText(seal, { x: sx - f.bold.widthOfTextAtSize(seal, 7.5) / 2 - 3.5, y: sy - 3, size: 7.5, font: f.bold, color: hex('#9a7420'), characterSpacing: 1 } as any);

  const qr = await QRCode.toBuffer(verifyUrl(cert.number), { type: 'png', margin: 0, width: 300, errorCorrectionLevel: 'M', color: { dark: '#1a2332', light: '#ffffff' } });
  const qrImg = await doc.embedPng(qr);
  page.drawImage(qrImg, { x: W - 70 - 74, y: baseY - 12, width: 74, height: 74 });
  const v = 'Scan to verify';
  page.drawText(v, { x: W - 70 - 37 - f.regular.widthOfTextAtSize(v, 8.5) / 2, y: baseY - 26, size: 8.5, font: f.regular, color: C.muted });

  if (cert.revoked_at) {
    page.drawText('REVOKED', { x: W / 2 - 150, y: H / 2 - 40, size: 90, font: f.bold, color: hex('#d7341a'), opacity: 0.25, rotate: { type: 'degrees', angle: 18 } as any } as any);
  }
  return Buffer.from(await doc.save());
}

// ------------------------------------------------------------------ routes

const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isAdmin = (u: UserRow) => u.is_admin;
const canMarkRoleplay = (u: UserRow) => u.is_admin || u.is_sales_manager || u.signoff_all;

export async function registerCertificates(app: FastifyInstance) {
  // ---- learner: final assessment
  app.get('/api/me/final', async (req) => {
    const u = need(req);
    const open = await settingBool('final_open');
    const st = (await statusFor([u])).get(u.id)!;
    const pending = await one<{ id: string }>(`select id from final_attempts where user_id = $1 and submitted_at is null order by started_at desc limit 1`, [u.id]);
    return {
      open, role: u.trade_role, length: Math.min(FINAL_LENGTH, poolFor(u.trade_role).length), poolSize: poolFor(u.trade_role).length,
      final: st.final, inProgress: !!pending, roleplay: st.roleplay,
    };
  });

  app.post('/api/me/final/start', async (req) => {
    const u = need(req);
    if (!u.trade_role) throw new HttpError(400, 'The final assessment is for techs on a training path.');
    if (!(await settingBool('final_open'))) throw new HttpError(403, 'The final assessment opens in the week 8 session.');
    if (!poolFor(u.trade_role).length) throw new HttpError(503, 'The final assessment questions are not ready yet.');
    const st = (await statusFor([u])).get(u.id)!;
    if (st.final.passed) throw new HttpError(409, 'You have already passed the final assessment.');
    let attempt = await one<{ id: string; questions: FinalQuestion[] }>(
      `select id, questions from final_attempts where user_id = $1 and submitted_at is null order by started_at desc limit 1`, [u.id]);
    if (!attempt) {
      if (st.final.used >= st.final.allowed) throw new HttpError(403, 'You have used your attempts. Talk to William about another one.');
      attempt = await one(`insert into final_attempts (user_id, role, questions) values ($1, $2, $3) returning id, questions`,
        [u.id, u.trade_role, JSON.stringify(drawFinal(u.trade_role))]);
    }
    return { attemptId: attempt!.id, questions: attempt!.questions.map((x) => ({ q: x.q, options: x.options })) };
  });

  app.post('/api/me/final/:id/submit', async (req) => {
    const u = need(req);
    const a = await one<{ id: string; questions: FinalQuestion[]; submitted_at: string | null }>(
      `select id, questions, submitted_at from final_attempts where id = $1 and user_id = $2`, [(req.params as any).id, u.id]);
    if (!a) throw new HttpError(404, 'Attempt not found.');
    if (a.submitted_at) throw new HttpError(409, 'This attempt has already been submitted.');
    const raw = Array.isArray((req.body as any)?.answers) ? (req.body as any).answers : [];
    const answers = a.questions.map((_, i) => (Number.isInteger(raw[i]) ? raw[i] : -1));
    const right = a.questions.filter((x, i) => answers[i] === x.correct).length;
    const score = Math.round((right / a.questions.length) * 100);
    const passed = score >= 80;
    await q(`update final_attempts set answers = $2, score = $3, passed = $4, submitted_at = now() where id = $1`, [a.id, answers, score, passed]);
    if (passed) await maybeIssue([u.id]);
    // Topics to revise, without giving away the answers (the retake draws a fresh mix).
    const missed = [...new Set(a.questions.filter((x, i) => answers[i] !== x.correct).map((x) => x.module))];
    const titles = Object.fromEntries(pathsForRole(u.trade_role).flatMap((p) => p.modules.map((m) => [m.id, m.title])));
    return { score, passed, right, total: a.questions.length, revise: missed.map((m) => titles[m] ?? m) };
  });

  // ---- learner: my certificate
  app.get('/api/me/certificate', async (req) => {
    const u = need(req);
    const cert = await one(`select number, title, role_label, name, completed_on::text, issued_at, seen_at from certificates where user_id = $1 and revoked_at is null`, [u.id]);
    const st = cert ? null : (await statusFor([u])).get(u.id) ?? null;
    return { certificate: cert, verifyUrl: cert ? verifyUrl(cert.number) : null, status: st };
  });

  app.post('/api/me/certificate/seen', async (req) => {
    const u = need(req);
    await q(`update certificates set seen_at = now() where user_id = $1 and revoked_at is null and seen_at is null`, [u.id]);
    return { ok: true };
  });

  app.get('/api/certificates/:number/pdf', async (req, reply) => {
    const u = need(req);
    const c = await one(`select *, completed_on::text from certificates where number = $1`, [(req.params as any).number]);
    if (!c || (c.user_id !== u.id && !isStaff(u))) throw new HttpError(404, 'Certificate not found.');
    const pdf = await certificatePdf(c);
    const file = `${c.name.replace(/[^A-Za-z0-9]+/g, '-')}-${c.number}.pdf`;
    reply.header('content-type', 'application/pdf').header('content-disposition', `attachment; filename="${file}"`).header('cache-control', 'private, no-store');
    return reply.send(pdf);
  });

  // ---- public verification (name, title, date, valid or revoked only)
  app.get('/api/verify/:number', async (req) => {
    const n = str((req.params as any).number, 40);
    const c = await one(`select number, name, title, role_label, completed_on::text, revoked_at from certificates where number = $1`, [n]);
    if (!c) return { found: false };
    return { found: true, valid: !c.revoked_at, number: c.number, name: c.name, title: c.title, role: c.role_label, completedOn: c.completed_on };
  });

  // ---- admin
  app.get('/api/admin/certificates', async (req) => {
    need(req, isStaff);
    const techs = await q<UserRow>(`select * from users where trade_role is not null and status <> 'disabled' order by trade_role, name`);
    const st = await statusFor(techs);
    const certs = new Map((await q(`select *, completed_on::text from certificates where revoked_at is null`)).map((c: any) => [c.user_id, c]));
    const revoked = await q(`select c.number, c.name, c.title, c.revoked_at, c.revoke_reason from certificates c where revoked_at is not null order by revoked_at desc limit 50`);
    const sig = await one<{ updated_at: string }>(`select updated_at from assets where key = 'signature'`);
    return {
      finalOpen: await settingBool('final_open'), signatureUpdatedAt: sig?.updated_at ?? null,
      pools: { install: pools.install.length, service: pools.service.length, salestech: pools.salestech.length },
      techs: techs.map((t) => ({
        id: t.id, name: t.name, tradeRole: t.trade_role, isApprentice: t.is_apprentice, status: t.status,
        progress: st.get(t.id), certificate: certs.get(t.id) ?? null,
      })),
      revoked,
    };
  });

  app.post('/api/admin/final/open', async (req) => {
    need(req, isAdmin);
    const open = (req.body as any)?.open === true;
    await q(`insert into settings (key, value, updated_at) values ('final_open', $1, now()) on conflict (key) do update set value = $1, updated_at = now()`, [JSON.stringify(open)]);
    return { open };
  });

  app.post('/api/admin/final/:userId/extra', async (req) => {
    need(req, isAdmin);
    await q(`insert into final_grants (user_id, extra) values ($1, 1) on conflict (user_id) do update set extra = final_grants.extra + 1`, [(req.params as any).userId]);
    return { ok: true };
  });

  app.post('/api/admin/roleplay/:userId', async (req) => {
    const me = need(req, canMarkRoleplay);
    const uid = (req.params as any).userId;
    const t = await one<UserRow>(`select * from users where id = $1`, [uid]);
    if (!t || t.trade_role !== 'salestech') throw new HttpError(400, 'The live role-play round is for Sales Techs.');
    if ((req.body as any)?.passed === true) {
      await q(`insert into roleplay_passes (user_id, passed_by) values ($1, $2) on conflict (user_id) do nothing`, [uid, me.id]);
      await maybeIssue([uid]);
    } else await q(`delete from roleplay_passes where user_id = $1`, [uid]);
    return { ok: true };
  });

  // Issues now if eligible (normally automatic), or reissues after revoking.
  app.post('/api/admin/certificates/:userId/issue', async (req) => {
    const me = need(req, isAdmin);
    const t = await one<UserRow>(`select * from users where id = $1`, [(req.params as any).userId]);
    if (!t) throw new HttpError(404, 'Person not found.');
    const st = (await statusFor([t])).get(t.id)!;
    if (!st.eligible) throw new HttpError(400, 'Not everything is complete yet.');
    const c = await issue(t, me.id);
    if (!c) throw new HttpError(409, 'They already have a valid certificate. Revoke it first to reissue.');
    return { certificate: c };
  });

  app.post('/api/admin/certificates/:number/revoke', async (req) => {
    const me = need(req, isAdmin);
    const reason = str((req.body as any)?.reason, 300);
    if (!reason) throw new HttpError(400, 'Give a reason (for example "Reissuing as full certification").');
    const r = await q(`update certificates set revoked_at = now(), revoked_by = $2, revoke_reason = $3 where number = $1 and revoked_at is null returning user_id`,
      [(req.params as any).number, me.id, reason]);
    if (!r.length) throw new HttpError(404, 'Certificate not found.');
    return { ok: true };
  });

  app.post('/api/admin/signature', { bodyLimit: 2 * 1024 * 1024 }, async (req) => {
    const me = need(req, isAdmin);
    const m = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(str((req.body as any)?.image, 2_000_000));
    if (!m) throw new HttpError(400, 'Upload a PNG or JPEG image of the signature.');
    const bytes = Buffer.from(m[2], 'base64');
    if (bytes.length > 600 * 1024) throw new HttpError(400, 'That image is too large. Keep it under 600 KB.');
    const magic = bytes.subarray(0, 4).toString('hex');
    if (!(m[1] === 'image/png' ? magic === '89504e47' : magic.startsWith('ffd8'))) throw new HttpError(400, 'That file is not a valid image.');
    await q(`insert into assets (key, mime, bytes, updated_by) values ('signature', $1, $2, $3)
             on conflict (key) do update set mime = $1, bytes = $2, updated_by = $3, updated_at = now()`, [m[1], bytes, me.id]);
    return { ok: true };
  });

  app.get('/api/admin/signature', async (req, reply) => {
    need(req, isStaff);
    const s = await one<{ mime: string; bytes: Buffer }>(`select mime, bytes from assets where key = 'signature'`);
    if (!s) throw new HttpError(404, 'No signature uploaded.');
    reply.header('content-type', s.mime).header('cache-control', 'private, no-store');
    return reply.send(s.bytes);
  });

  app.get('/api/admin/certificates/sample.pdf', async (req, reply) => {
    need(req, isStaff);
    const pdf = await certificatePdf({ number: 'TA-SAMPLE-0000', title: 'Proximity Certified Install Technician', role_label: 'Install Technician', name: 'Sample Name', completed_on: sydneyToday(), revoked_at: null });
    reply.header('content-type', 'application/pdf').header('content-disposition', 'inline; filename="sample-certificate.pdf"');
    return reply.send(pdf);
  });
}
