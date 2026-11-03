// End-to-end test: 8-week program set-up and a field sign-off from request to approval.
// Usage: E2E_BASE=http://localhost:3100 npm run e2e:program
// Run it only against a TEST database: it ends any running program and changes test users' flags.
// Needs the 12 test techs created by tests/live-class.e2e.mjs (e2e+N@example.com / e2e-test-pass).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.E2E_BASE || 'http://localhost:3100';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@proximityplumbing.com.au';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'longpassword1';
const SHOTS = process.env.E2E_SHOTS || '';
const JOB = `E2E-${Date.now() % 1000000}`;
const shot = async (page, name) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
const assert = (cond, msg) => { if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`); console.log(`  ✓ ${msg}`); };

// A small solid-colour PNG, written to a temp file for the photo picker.
function png(file) {
  const w = 64, h = 48;
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set([0, 173, 237], y * (w * 3 + 1) + 1 + x * 3);
  fs.writeFileSync(file, Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

async function main() {
  const browser = await chromium.launch();
  const errors = [];
  const watch = (p) => { p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => m.type() === 'error' && errors.push(m.text())); };
  const ctxFor = async (email, password, viewport) => {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const r = await ctx.request.post(`${BASE}/api/auth/login`, { data: { email, password }, headers: { 'x-titan': '1' } });
    if (!r.ok()) throw new Error(`login failed for ${email}: ${r.status()}`);
    return ctx;
  };
  const admin = await ctxFor(ADMIN_EMAIL, ADMIN_PASSWORD, { width: 1440, height: 900 });
  const api = (method, url, data) => admin.request.fetch(`${BASE}${url}`, { method, data, headers: { 'x-titan': '1' } });

  console.log('Setting up…');
  const users = (await (await api('GET', '/api/admin/users')).json()).users;
  // Approved sign-offs can't be undone, so each run uses a test tech who still has a module with two untouched items.
  const trade = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'trade-paths.json'), 'utf8'));
  let TECH_EMAIL = null, mod = null;
  for (const n of [1, 8, 9, 10, 11, 3, 4, 5, 6, 7]) {
    const c = await browser.newContext();
    if (!(await c.request.post(`${BASE}/api/auth/login`, { data: { email: `e2e+${n}@example.com`, password: 'e2e-test-pass' }, headers: { 'x-titan': '1' } })).ok()) { await c.close(); continue; }
    for (const m of trade.paths.filter((p) => ['field', 'install'].includes(p.id)).flatMap((p) => p.modules)) {
      const d = await (await c.request.get(`${BASE}/api/modules/${m.id}`)).json();
      if ((m.signoff ?? []).length - d.signoffs.filter((x) => x.status === 'approved').length >= 2) { mod = m.id; break; }
    }
    await c.close();
    if (mod) { TECH_EMAIL = `e2e+${n}@example.com`; break; }
  }
  if (!mod) throw new Error('No test tech has two untouched sign-offs left. Reset the test database.');
  const tech = users.find((u) => u.email === TECH_EMAIL);
  const lead = users.find((u) => u.email === 'e2e+2@example.com');
  assert(tech && lead, 'test techs exist');
  await api('PATCH', `/api/admin/users/${lead.id}`, { isLeadTech: true });
  await api('PATCH', `/api/admin/users/${tech.id}`, { isLeadTech: false });
  const prog = await (await api('GET', '/api/admin/program')).json();
  if (prog.program) await api('POST', '/api/admin/program/end', {});
  // Clear this tech's f1 sign-offs from earlier runs.
  for (const st of ['waiting', 'approved', 'returned']) {
    const list = (await (await api('GET', `/api/review/signoffs?status=${st}`)).json()).signoffs;
    for (const s of list.filter((x) => x.user_id === tech.id)) {
      const t = await browser.newContext();
      await t.request.post(`${BASE}/api/auth/login`, { data: { email: TECH_EMAIL, password: 'e2e-test-pass' }, headers: { 'x-titan': '1' } });
      await t.request.delete(`${BASE}/api/signoffs/${s.id}`, { headers: { 'x-titan': '1' } });
      await t.close();
    }
  }

  console.log('Program…');
  const a = await admin.newPage(); watch(a);
  await a.goto(`${BASE}/admin/program`);
  await a.getByText('Set up the program').waitFor();
  const start = new Date(Date.now() - 8 * 86400000);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // Monday of last week
  const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
  await a.getByLabel('Start date (week 1)').fill(startStr);
  await a.getByLabel('Install + Service (weeks 1–2) day').selectOption('2');
  await shot(a, 'program-create');
  await a.getByRole('button', { name: /Create the program/ }).click();
  await a.getByText('This week', { exact: true }).waitFor();
  assert(await a.getByText('week 2 of 8 now').isVisible(), 'program is in week 2');
  const rows = await a.getByRole('button', { name: 'Move' }).count();
  assert(rows >= 20, `classes created (${rows} still to run)`);
  await shot(a, 'program-weeks');
  await a.getByRole('button', { name: 'Move' }).last().click();
  await a.getByLabel('Time (Sydney)').fill('09:30');
  await a.getByRole('button', { name: 'Save' }).click();
  await a.getByText(/9:30/).last().waitFor();
  assert(true, 'moved a class to 9:30');

  console.log('Tech requests a sign-off…');
  const t = await ctxFor(TECH_EMAIL, 'e2e-test-pass', { width: 375, height: 812 });
  assert(mod, `using ${TECH_EMAIL}, module ${mod}, for the sign-off test`);
  const tp = await t.newPage(); watch(tp);
  await tp.goto(`${BASE}/`);
  await tp.getByText('Week 2 of 8').waitFor();
  assert(await tp.getByText(/Overdue:/).isVisible(), 'phone shows overdue week 1 modules');
  await shot(tp, 'phone-home-this-week');
  await tp.goto(`${BASE}/module/${mod}`);
  await tp.getByRole('button', { name: 'Request sign-off' }).first().click();
  await tp.getByLabel('ServiceTitan job number').fill(JOB);
  const img = path.join(process.env.TMPDIR || '/tmp', `e2e-photo-${process.pid}.png`);
  png(img);
  await tp.locator('input[type=file]').setInputFiles(img);
  await tp.getByAltText('Photo 1').waitFor();
  await shot(tp, 'phone-request');
  await tp.getByRole('button', { name: 'Send for sign-off' }).click();
  await tp.getByText(/Waiting for sign-off/).waitFor();
  assert(true, 'request sent, item shows as waiting');
  // A second item, to be sent back.
  await tp.getByRole('button', { name: 'Request sign-off' }).first().click();
  await tp.getByLabel('Note (optional)').fill('Did this on the Ryde job with the customer');
  await tp.getByRole('button', { name: 'Send for sign-off' }).click();
  await tp.getByText(/Waiting for sign-off/).nth(1).waitFor();

  console.log('Lead tech reviews on their phone…');
  const l = await ctxFor('e2e+2@example.com', 'e2e-test-pass', { width: 375, height: 812 });
  const lp = await l.newPage(); watch(lp);
  await lp.goto(`${BASE}/`);
  await lp.getByText(/Sign-offs? waiting for you/).waitFor();
  assert(true, 'lead tech sees "waiting for you" on their home screen');
  await lp.getByText(/Sign-offs? waiting for you/).click();
  await lp.getByText(JOB).waitFor();
  assert(await lp.getByAltText('Evidence').first().isVisible(), 'evidence photo shows for the reviewer');
  await shot(lp, 'phone-review');
  const card = lp.locator('div').filter({ hasText: JOB }).filter({ has: lp.getByRole('button', { name: /Sign off/ }) }).last();
  await card.getByRole('button', { name: /Sign off/ }).click();
  await lp.getByText(JOB).waitFor({ state: 'detached' });
  assert(true, 'lead tech signed it off');
  await lp.getByRole('button', { name: 'Send back' }).first().click();
  await lp.getByPlaceholder(/What do they need/).fill('Show me on the next job, with photos of the finished install.');
  await lp.getByRole('button', { name: 'Send back with note' }).click();
  await lp.getByText('Nothing waiting. Nice.').waitFor();
  assert(true, 'lead tech sent one back with a note');

  console.log('Tech sees the results…');
  await tp.reload();
  await tp.getByText(/Signed off/).first().waitFor();
  assert(await tp.getByText(/Sent back: Show me on the next job/).isVisible(), 'tech sees the send-back note');
  assert(await tp.getByRole('button', { name: 'Send again' }).isVisible(), 'tech can send it again');
  await shot(tp, 'phone-module-signoffs');

  console.log('Admin…');
  await a.goto(`${BASE}/admin/signoffs`);
  await a.getByRole('button', { name: 'Signed off' }).click();
  await a.getByText(JOB).waitFor();
  assert(true, 'admin sees the approved sign-off');
  await shot(a, 'admin-signoffs');
  await a.goto(`${BASE}/admin`);
  await a.getByText(/week 2 of 8/).waitFor();
  assert(await a.getByText(/Behind: \d+ modules? overdue/).first().isVisible(), 'dashboard flags techs who are behind');
  await shot(a, 'admin-dashboard-program');

  // Another tech (not a reviewer) can't approve.
  const o = await ctxFor('e2e+3@example.com', 'e2e-test-pass', { width: 375, height: 812 });
  const or = await o.request.get(`${BASE}/api/review/signoffs`);
  assert(or.status() === 403, 'a tech who is not a reviewer cannot open the queue');

  await api('PATCH', `/api/admin/users/${lead.id}`, { isLeadTech: false });
  fs.rmSync(img, { force: true });
  assert(!errors.length, `no browser errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await browser.close();
  console.log('\nAll program and sign-off checks passed.');
}

main().catch((e) => { console.error(e); process.exit(1); });
