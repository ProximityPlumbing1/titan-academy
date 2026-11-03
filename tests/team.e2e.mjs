// End-to-end test: roster CSV import (preview, errors, apply, download) and the tech profile page with password change.
// Usage: E2E_BASE=http://localhost:3100 npm run e2e:team   (test database only: it adds a test person, then disables them)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.E2E_BASE || 'http://localhost:3100';
const ADMIN = [process.env.E2E_ADMIN_EMAIL || 'admin@proximityplumbing.com.au', process.env.E2E_ADMIN_PASSWORD || 'longpassword1'];
const SHOTS = process.env.E2E_SHOTS || '';
const shot = async (page, name) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
const assert = (cond, msg) => { if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`); console.log(`  ✓ ${msg}`); };

async function main() {
  const browser = await chromium.launch();
  const errors = [];
  const watch = (p) => { p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/status of 400/.test(m.text()) && errors.push(m.text())); }; // 400s are the deliberate bad inputs
  const ctxFor = async (email, password, viewport) => {
    const ctx = await browser.newContext({ viewport, acceptDownloads: true });
    const r = await ctx.request.post(`${BASE}/api/auth/login`, { data: { email, password }, headers: { 'x-titan': '1' } });
    if (!r.ok()) throw new Error(`login failed for ${email}: ${r.status()}`);
    return ctx;
  };
  const admin = await ctxFor(ADMIN[0], ADMIN[1], { width: 1440, height: 900 });
  const A = (method, url, data) => admin.request.fetch(`${BASE}${url}`, { method, data, headers: { 'x-titan': '1' } });

  console.log('Roster import…');
  const run = Date.now().toString(36).slice(-5).toUpperCase();
  const newName = `Testperson ${run}`;
  const users = (await (await A('GET', '/api/admin/users')).json()).users;
  const sup = users.find((u) => u.email === 'e2e+5@example.com');
  const csv = [
    'name,trade_role,apprentice,email,supervising_tech',
    `${newName},install,yes,test-${run.toLowerCase()}@example.com,${sup.name}`,
    `Bad Row ${run},plumber,no,,`,
  ].join('\n');
  const a = await admin.newPage(); watch(a);
  await a.goto(`${BASE}/admin/users`);
  await a.getByRole('button', { name: 'Import roster (CSV)' }).click();
  await a.getByLabel('Roster CSV').fill(csv);
  await a.getByRole('button', { name: 'Check the file' }).click();
  await a.getByText(/Unknown trade_role "plumber"/).waitFor();
  assert(await a.getByRole('button', { name: /Apply/ }).isDisabled(), 'a file with an error row cannot be applied');
  assert(await a.getByText(/Not in this file/).isVisible(), 'people missing from the file are listed, not removed');
  await shot(a, 'roster-preview-error');
  await a.getByLabel('Roster CSV').fill(csv.split('\n').slice(0, 2).join('\n'));
  await a.getByRole('button', { name: 'Check the file' }).click();
  await a.getByRole('button', { name: 'Apply 1 change' }).click();
  await a.getByText(/1 added/).waitFor();
  assert(true, 'applied: 1 added');
  await a.getByRole('button', { name: 'Close', exact: true }).last().click();
  const after = (await (await A('GET', '/api/admin/users')).json()).users.find((u) => u.name === newName);
  assert(after && after.tradeRole === 'install' && after.isApprentice && after.supervisorId === sup.id && after.status === 'invited',
    'the new person is an invited install apprentice with their supervisor set');
  const again = await (await A('POST', '/api/admin/roster/preview', { csv: csv.split('\n').slice(0, 2).join('\n') })).json();
  assert(again.rows[0].action === 'same', 'importing the same file again changes nothing');
  const [dl] = await Promise.all([a.waitForEvent('download'), a.getByRole('button', { name: 'Download roster (CSV)' }).click()]);
  const out = fs.readFileSync(await dl.path(), 'utf8');
  assert(out.includes(`${newName},install,yes`) && out.includes(sup.name), 'the roster download includes them, in the import format');
  await A('PATCH', `/api/admin/users/${after.id}`, { disabled: true });

  console.log('Profile…');
  const tech = await ctxFor('e2e+1@example.com', 'e2e-test-pass', { width: 375, height: 812 });
  const p = await tech.newPage(); watch(p);
  await p.goto(`${BASE}/`);
  await p.getByRole('link', { name: 'Profile' }).click();
  await p.getByText('Your profile').waitFor();
  assert(await p.getByRole('heading', { name: 'Field Foundations' }).isVisible(), 'profile lists progress by path');
  assert(await p.getByText('Sign-off history').isVisible(), 'profile shows the sign-off history');
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert(!overflow, 'no sideways scrolling at 375px');
  await shot(p, 'profile');

  console.log('Password change…');
  const other = await ctxFor('e2e+1@example.com', 'e2e-test-pass', { width: 375, height: 812 }); // a second device
  await p.getByRole('button', { name: 'Change my password' }).click();
  await p.getByLabel('Current password').fill('wrong-password');
  await p.getByLabel('New password').fill('e2e-new-pass-1');
  await p.getByRole('button', { name: 'Save new password' }).click();
  await p.getByText('Your current password is not right.').waitFor();
  assert(true, 'a wrong current password is refused');
  await p.getByLabel('Current password').fill('e2e-test-pass');
  await p.getByRole('button', { name: 'Save new password' }).click();
  await p.getByText(/Password changed/).waitFor();
  const me = await (await other.request.get(`${BASE}/api/auth/me`)).json();
  assert(me.user === null, 'the other device was signed out');
  const still = await (await tech.request.get(`${BASE}/api/auth/me`)).json();
  assert(still.user?.email === 'e2e+1@example.com', 'this device stays signed in');
  const back = await tech.request.post(`${BASE}/api/auth/password`, { data: { current: 'e2e-new-pass-1', next: 'e2e-test-pass' }, headers: { 'x-titan': '1' } });
  assert(back.ok(), 'password set back for the other tests');

  assert(!errors.length, `no browser errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await browser.close();
  console.log('\nAll team checks passed.');
}

main().catch((e) => { console.error(e); process.exit(1); });
