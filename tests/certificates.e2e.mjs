// End-to-end test: a tech finishes everything, sits the final on their phone and is certified automatically.
// Usage: E2E_BASE=http://localhost:3100 npm run e2e:certificates
// Run it only against a TEST database: it passes quizzes and approves sign-offs for a test tech,
// opens the final assessment, and issues then revokes a certificate.
// Needs the test techs created by tests/live-class.e2e.mjs (e2e+N@example.com / e2e-test-pass).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.E2E_BASE || 'http://localhost:3100';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@proximityplumbing.com.au';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'longpassword1';
const TECH = 'e2e+4@example.com';
const SHOTS = process.env.E2E_SHOTS || '';
const shot = async (page, name) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
const assert = (cond, msg) => { if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`); console.log(`  ✓ ${msg}`); };
const read = (f) => JSON.parse(fs.readFileSync(path.join(process.cwd(), f), 'utf8'));

async function main() {
  const quizzes = read('content/quizzes.json').modules;
  const trade = read('data/trade-paths.json');
  const pool = read('content/final/install.json').questions;
  const browser = await chromium.launch();
  const errors = [];
  const watch = (p) => { p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => m.type() === 'error' && errors.push(m.text())); };
  const ctxFor = async (email, password, viewport) => {
    const ctx = await browser.newContext({ viewport, acceptDownloads: true });
    const r = await ctx.request.post(`${BASE}/api/auth/login`, { data: { email, password }, headers: { 'x-titan': '1' } });
    if (!r.ok()) throw new Error(`login failed for ${email}: ${r.status()}`);
    return ctx;
  };
  const admin = await ctxFor(ADMIN_EMAIL, ADMIN_PASSWORD, { width: 1440, height: 900 });
  const tech = await ctxFor(TECH, 'e2e-test-pass', { width: 375, height: 812 });
  const A = (method, url, data) => admin.request.fetch(`${BASE}${url}`, { method, data, headers: { 'x-titan': '1' } });
  const T = (method, url, data) => tech.request.fetch(`${BASE}${url}`, { method, data, headers: { 'x-titan': '1' } });

  console.log('Setting up…');
  const me = (await (await T('GET', '/api/auth/me')).json()).user;
  assert(me.tradeRole === 'install' && !me.isApprentice, 'test tech is a (non-apprentice) Install Tech');
  const certs = await (await A('GET', '/api/admin/certificates')).json();
  const existing = certs.techs.find((t) => t.id === me.id)?.certificate;
  if (existing) await A('POST', `/api/admin/certificates/${encodeURIComponent(existing.number)}/revoke`, { reason: 'e2e reset' });
  await A('POST', '/api/admin/final/open', { open: false });
  const modules = trade.paths.filter((p) => ['field', 'install'].includes(p.id)).flatMap((p) => p.modules);
  for (const m of modules) await T('POST', `/api/modules/${m.id}/quiz`, { answers: quizzes[m.id].questions.map((x) => x.correct) });
  let st = (await (await T('GET', '/api/me/certificate')).json()).status;
  assert(st.modules.done === st.modules.total, `all ${st.modules.total} module quizzes passed`);
  for (const m of modules) for (let i = 0; i < (m.signoff ?? []).length; i++) await T('POST', `/api/modules/${m.id}/signoffs/${i}`, { jobRef: `E2E-${m.id}-${i}` });
  const waiting = (await (await A('GET', '/api/review/signoffs?status=waiting')).json()).signoffs.filter((s) => s.user_id === me.id);
  for (const s of waiting) await A('POST', `/api/review/signoffs/${s.id}`, { action: 'approve' });
  st = (await (await T('GET', '/api/me/certificate')).json()).status;
  assert(st.signoffs.approved === st.signoffs.total, `all ${st.signoffs.total} sign-offs approved`);
  assert(!st.final.passed, 'final not passed yet, so no certificate');
  // Give the test tech fresh attempts.
  for (let i = 0; i < 3; i++) await A('POST', `/api/admin/final/${me.id}/extra`, {});

  console.log('Final assessment…');
  const p = await tech.newPage(); watch(p);
  await p.goto(`${BASE}/final`);
  await p.getByText('Opens in the week 8 session').waitFor();
  assert(true, 'final is closed until the admin opens it');
  const a = await admin.newPage(); watch(a);
  await a.goto(`${BASE}/admin/certificates`);
  await a.getByRole('button', { name: 'Open the final assessment' }).click();
  await a.getByRole('button', { name: 'Close the final assessment' }).waitFor();
  assert(true, 'admin opened the final');
  await p.goto(`${BASE}/`);
  await p.getByText('The final assessment is open').waitFor();
  assert(true, 'phone shows the "final is open" banner');
  await p.getByText('The final assessment is open').click();
  await p.getByRole('button', { name: /Start the final assessment|Carry on/ }).click();
  const byText = new Map(pool.map((x) => [x.q, x]));
  const total = Number((await p.getByText(/question 1 of \d+/).textContent()).match(/of (\d+)/)[1]);
  assert(total === Math.min(25, pool.length), `${total} questions drawn`);
  for (let i = 0; i < total; i++) {
    const qText = (await p.locator('h1').textContent()).trim();
    const qq = byText.get(qText);
    if (!qq) throw new Error(`question not in pool: ${qText}`);
    if (i === 0) await shot(p, 'final-question');
    await p.getByRole('button', { name: qq.options[qq.correct], exact: false }).first().click();
    await p.getByRole('button', { name: i < total - 1 ? 'Next' : 'Finish and mark', exact: true }).click();
  }
  await p.getByText('You passed the final').waitFor();
  assert(await p.getByText('100%').isVisible(), 'scored 100% with the right answers');

  console.log('Certificate…');
  await p.goto(`${BASE}/`);
  await p.getByText(/you’re certified!/i).waitFor();
  assert(true, 'certificate issued automatically, banner on the home screen');
  await p.getByText(/you’re certified!/i).click();
  await p.getByText('Proximity Certified Install Technician').waitFor();
  await p.waitForTimeout(400);
  await shot(p, 'certificate-celebration');
  const number = (await p.getByText(/Certificate no\./).textContent()).match(/TA-\d{4}-\d{4}-[A-Z0-9]{4}/)[0];
  const [download] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Download certificate (PDF)' }).click()]);
  const pdfPath = await download.path();
  const pdf = fs.readFileSync(pdfPath);
  assert(pdf.subarray(0, 5).toString() === '%PDF-' && pdf.length > 10000, `PDF downloads (${Math.round(pdf.length / 1024)} KB)`);
  if (SHOTS) fs.copyFileSync(pdfPath, path.join(SHOTS, 'certificate.pdf'));

  const anon = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const v = await anon.newPage(); watch(v);
  await v.goto(`${BASE}/verify/${number}`);
  await v.getByText('Valid certificate').waitFor();
  assert(true, 'public verification page shows it as valid without logging in');
  await shot(v, 'verify-valid');
  const other = await (await anon.request.get(`${BASE}/api/certificates/${number}/pdf`)).status();
  assert(other === 401, 'the PDF itself is not public');

  console.log('Admin…');
  await a.reload();
  await a.getByText(number).waitFor();
  await shot(a, 'admin-certificates');
  await a.getByRole('button', { name: 'Revoke' }).first().click();
  await a.getByPlaceholder(/Reason/).fill('e2e test');
  await a.getByRole('button', { name: 'Revoke', exact: true }).last().click();
  await a.getByText('Revoked', { exact: true }).waitFor();
  await v.reload();
  await v.getByText('Not valid: revoked').waitFor();
  assert(true, 'revoked certificate shows as not valid');
  await A('POST', '/api/admin/final/open', { open: false });

  assert(!errors.length, `no browser errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await browser.close();
  console.log('\nAll final assessment and certificate checks passed.');
}

main().catch((e) => { console.error(e); process.exit(1); });
