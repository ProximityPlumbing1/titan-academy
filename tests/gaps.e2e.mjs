// End-to-end test: test-out, apprentice supervisors, CSV export, the Sales scoreboard and the week 8 certified wall.
// Usage: E2E_BASE=http://localhost:3100 npm run e2e:gaps
// Run it only against a TEST database. Needs the test techs from tests/live-class.e2e.mjs and a program
// created by tests/program-signoffs.e2e.mjs (for the week 8 class). It sets a test password for one Sales Tech.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.E2E_BASE || 'http://localhost:3100';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@proximityplumbing.com.au';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'longpassword1';
const SHOTS = process.env.E2E_SHOTS || '';
const shot = async (page, name) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
const assert = (cond, msg) => { if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`); console.log(`  ✓ ${msg}`); };
const read = (f) => JSON.parse(fs.readFileSync(path.join(process.cwd(), f), 'utf8'));

async function main() {
  const quizzes = read('content/quizzes.json').modules;
  const trade = read('data/trade-paths.json');
  const browser = await chromium.launch();
  const errors = [];
  const watch = (p) => { p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => m.type() === 'error' && errors.push(m.text())); };
  const ctxFor = async (email, password, viewport) => {
    const ctx = await browser.newContext({ viewport, acceptDownloads: true });
    const r = await ctx.request.post(`${BASE}/api/auth/login`, { data: { email, password }, headers: { 'x-titan': '1' } });
    if (!r.ok()) throw new Error(`login failed for ${email}: ${r.status()}`);
    return ctx;
  };
  const call = (ctx, method, url, data) => ctx.request.fetch(`${BASE}${url}`, { method, data, headers: { 'x-titan': '1' } });
  const admin = await ctxFor(ADMIN_EMAIL, ADMIN_PASSWORD, { width: 1440, height: 900 });
  const users = (await (await call(admin, 'GET', '/api/admin/users')).json()).users;

  console.log('Test-out…');
  // Find a test tech and an install module they haven't completed.
  const modules = trade.paths.find((p) => p.id === 'install').modules;
  let tech = null, mod = null;
  for (let n = 4; n <= 11 && !mod; n++) {
    const c = await ctxFor(`e2e+${n}@example.com`, 'e2e-test-pass', { width: 375, height: 812 });
    for (const m of modules) {
      const d = await (await call(c, 'GET', `/api/modules/${m.id}`)).json();
      if (d.status !== 'done' && d.doneLessons.length === 0) { tech = c; mod = m; break; }
    }
    if (!mod) await c.close();
  }
  assert(mod, `using ${mod.id} for the test-out check`);
  const q = quizzes[mod.id].questions;
  const fourOfFive = q.map((x, i) => (i === 0 ? (x.correct + 1) % x.options.length : x.correct));
  let r = await (await call(tech, 'POST', `/api/modules/${mod.id}/quiz`, { answers: fourOfFive })).json();
  assert(r.passed && !r.testedOut && r.lessonsLeft === mod.lessons.length, `80% passes the quiz but leaves ${r.lessonsLeft} lessons to read`);
  let d = await (await call(tech, 'GET', `/api/modules/${mod.id}`)).json();
  assert(d.status !== 'done', 'module is not complete until the lessons are read');
  const p = await tech.newPage(); watch(p);
  await p.goto(`${BASE}/module/${mod.id}/quiz`);
  for (const x of q) {
    await p.getByRole('button', { name: x.options[x.correct] }).first().click();
    await p.getByRole('button', { name: x === q.at(-1) ? 'Finish' : 'Next', exact: true }).click();
  }
  await p.getByText(/You tested out/).waitFor();
  await shot(p, 'testout-result');
  d = await (await call(tech, 'GET', `/api/modules/${mod.id}`)).json();
  assert(d.status === 'done' && d.doneLessons.length === mod.lessons.length, '100% tests out: lessons ticked and the module complete');

  console.log('Apprentice supervisor…');
  const apprentice = users.find((u) => u.email === 'e2e+0@example.com');
  const supervisor = users.find((u) => u.email === 'e2e+5@example.com');
  const lead = users.find((u) => u.email === 'e2e+6@example.com');
  assert(apprentice?.isApprentice, 'test apprentice exists');
  await call(admin, 'PATCH', `/api/admin/users/${lead.id}`, { isLeadTech: true });
  const a = await admin.newPage(); watch(a);
  await a.goto(`${BASE}/admin/users`);
  await a.getByRole('row').filter({ hasText: apprentice.name }).getByRole('button', { name: 'Edit' }).click();
  await a.getByRole('combobox', { name: /Supervising tech/ }).or(a.locator('select').filter({ hasText: 'Not set yet' })).first().selectOption(supervisor.id);
  await shot(a, 'supervisor-picker');
  await a.getByRole('button', { name: 'Save' }).click();
  await a.getByRole('row').filter({ hasText: apprentice.name }).getByText(`Apprentice · ${supervisor.name.split(' ')[0]}`).waitFor();
  assert(true, 'admin set the apprentice\'s supervisor');
  const app = await ctxFor('e2e+0@example.com', 'e2e-test-pass', { width: 375, height: 812 });
  let item = null;
  for (const m of trade.paths.filter((x) => ['field', 'install'].includes(x.id)).flatMap((x) => x.modules)) {
    const md = await (await call(app, 'GET', `/api/modules/${m.id}`)).json();
    const free = (m.signoff ?? []).findIndex((_, i) => !md.signoffs.some((s) => s.item_index === i));
    if (free >= 0) { item = { m: m.id, i: free }; break; }
  }
  r = await call(app, 'POST', `/api/modules/${item.m}/signoffs/${item.i}`, { jobRef: `E2E-APP-${Date.now() % 100000}` });
  assert(r.ok(), 'apprentice requested a sign-off');
  const sup = await ctxFor('e2e+5@example.com', 'e2e-test-pass', { width: 375, height: 812 });
  const me = (await (await call(sup, 'GET', '/api/auth/me')).json()).user;
  assert(me.reviewsSignoffs, 'the supervisor is now treated as a reviewer');
  const supQueue = (await (await call(sup, 'GET', '/api/review/signoffs')).json()).signoffs;
  const mine = supQueue.find((s) => s.user_id === apprentice.id && s.module_id === item.m && s.item_index === item.i);
  assert(mine?.canReview, 'the supervisor can sign off the apprentice');
  const leadCtx = await ctxFor('e2e+6@example.com', 'e2e-test-pass', { width: 375, height: 812 });
  const leadQueue = (await (await call(leadCtx, 'GET', '/api/review/signoffs')).json()).signoffs;
  assert(!leadQueue.some((s) => s.id === mine.id), 'another lead tech no longer gets the apprentice\'s sign-offs');
  r = await call(sup, 'POST', `/api/review/signoffs/${mine.id}`, { action: 'approve' });
  assert(r.ok(), 'the supervisor approved it');
  await call(admin, 'PATCH', `/api/admin/users/${lead.id}`, { isLeadTech: false });

  console.log('CSV export…');
  await a.goto(`${BASE}/admin`);
  const [dl] = await Promise.all([a.waitForEvent('download'), a.getByRole('button', { name: 'Export progress (CSV)' }).click()]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  const lines = csv.trim().split(/\r?\n/);
  assert(lines[0].includes('Name,Role,Apprentice') && lines.length > 100, `progress CSV has ${lines.length - 1} rows`);
  assert(csv.includes(`${mod.id},`), 'CSV includes the tested-out module');
  const so = await call(admin, 'GET', '/api/admin/export/signoffs.csv');
  assert(so.ok() && (await so.text()).includes('ServiceTitan job'), 'sign-offs CSV downloads');
  const anon = await browser.newContext();
  assert((await anon.request.get(`${BASE}/api/admin/export/progress.csv`)).status() === 401, 'exports need a login');

  console.log('Sales scoreboard…');
  const sales = users.find((u) => u.tradeRole === 'salestech');
  await a.goto(`${BASE}/admin/scoreboard`);
  const card = a.getByRole('region', { name: sales.name });
  await card.getByRole('button', { name: 'Enter numbers' }).click();
  await card.getByLabel('Week').selectOption('0');
  await card.getByLabel('Average ticket').fill('2400');
  await card.getByLabel('Close rate').fill('41');
  await card.getByRole('button', { name: 'Save baseline' }).click();
  await card.getByText('Saved').waitFor();
  await card.getByLabel('Week').selectOption('1');
  await card.getByLabel('Average ticket').fill('2650');
  await card.getByLabel('Close rate').fill('44.5');
  await card.getByRole('button', { name: 'Save week 1' }).click();
  await card.getByText('+$250').first().waitFor();
  assert(await card.getByText('+3.5 pts').first().isVisible(), 'scoreboard shows change from baseline (+$250, +3.5 pts)');
  await shot(a, 'scoreboard');
  const bad = await call(admin, 'PUT', `/api/admin/scoreboard/${sales.id}/1`, { close_rate: 140 });
  assert(bad.status() === 400, 'a close rate over 100% is rejected');
  // The Sales Tech sees their two numbers on their phone.
  const link = await (await call(admin, 'POST', `/api/admin/users/${sales.id}/link`, {})).json();
  const token = link.url.split('/').pop();
  const info = await (await anon.request.get(`${BASE}/api/auth/link/${token}`)).json();
  await anon.request.post(`${BASE}/api/auth/link/${token}`, { data: { password: 'e2e-test-pass', email: info.needsEmail ? 'e2e+sales@example.com' : undefined }, headers: { 'x-titan': '1' } });
  const salesEmail = info.needsEmail ? 'e2e+sales@example.com' : sales.email;
  const st = await ctxFor(salesEmail, 'e2e-test-pass', { width: 375, height: 812 });
  const sp = await st.newPage(); watch(sp);
  await sp.goto(`${BASE}/`);
  await sp.getByText('Your two numbers', { exact: true }).waitFor();
  assert(await sp.getByText('+$250').isVisible(), 'Sales Tech sees their two numbers on their phone');
  await shot(sp, 'phone-my-numbers');

  console.log('Week 8 certified wall…');
  const prog = await (await call(admin, 'GET', '/api/admin/program')).json();
  const w8 = prog.classes?.find((c) => c.module_ids.includes('final') && c.status !== 'ended');
  if (!w8) console.log('  (skipped: no week 8 class; run e2e:program first)');
  else {
    const { code } = await (await call(admin, 'POST', `/api/admin/classes/${w8.id}/start`, {})).json();
    const state = await (await call(admin, 'GET', `/api/live/${code}/state?role=present`)).json();
    const idx = state.init.deck.findIndex((s) => s.kind === 'certified');
    await call(admin, 'POST', `/api/live/${code}/control`, { action: 'goto', index: idx });
    const certified = (await (await anon.request.get(`${BASE}/api/live/${code}/certified`)).json()).certified;
    const tv = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage(); watch(tv);
    await tv.goto(`${BASE}/tv/${code}`);
    await tv.getByText('Certified', { exact: true }).waitFor();
    if (certified.length) await tv.getByText(certified[0].name).waitFor();
    assert(true, `TV shows the certified wall (${certified.length} so far)`);
    await shot(tv, 'tv-certified');
    await call(admin, 'POST', `/api/live/${code}/control`, { action: 'end' });
  }

  assert(!errors.length, `no browser errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await browser.close();
  console.log('\nAll small-gap checks passed.');
}

main().catch((e) => { console.error(e); process.exit(1); });
