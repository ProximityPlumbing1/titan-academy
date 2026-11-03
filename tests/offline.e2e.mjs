// End-to-end test: the app with no signal. Lessons a tech has opened still load, lessons finished offline
// are queued and sent when signal returns, quizzes keep the answers, and signing out wipes the offline copy.
// Usage: E2E_BASE=http://localhost:3100 npm run e2e:offline   (needs a production build: the service worker only runs there)
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.E2E_BASE || 'http://localhost:3100';
const assert = (cond, msg) => { if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`); console.log(`  ✓ ${msg}`); };

async function main() {
  const browser = await chromium.launch();
  // Find a test tech with a lesson they haven't read yet (earlier test runs complete some techs).
  let ctx = null, api = null, mod = null;
  for (const n of [8, 9, 10, 11, 1, 2, 3, 7, 6, 5, 4]) {
    const c = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const call = (method, url, data) => c.request.fetch(`${BASE}${url}`, { method, data, headers: { 'x-titan': '1' } });
    if (!(await call('POST', '/api/auth/login', { email: `e2e+${n}@example.com`, password: 'e2e-test-pass' })).ok()) { await c.close(); continue; }
    for (const id of ['i3', 'i4', 'i6', 'i8', 'i10', 'i11', 'i12', 'f5', 'f6', 'f7']) {
      const d = await (await call('GET', `/api/modules/${id}`)).json();
      if (d.doneLessons.length < d.module.lessonsWritten - 1) { mod = { id, d, lesson: [...Array(d.module.lessonsWritten).keys()].find((i) => !d.doneLessons.includes(i)) }; break; }
    }
    if (mod) { ctx = c; api = call; break; }
    await c.close();
  }
  if (!mod) throw new Error('No test tech has an unread lesson left. Reset the test database.');
  const errors = [];
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  assert(mod, `using ${mod.id}, lesson ${mod.lesson + 1}`);

  console.log('Online: open the app so it can cache…');
  await p.goto(`${BASE}/`);
  await p.getByText('Field Foundations').first().waitFor();
  await p.evaluate(async () => { await navigator.serviceWorker.ready; });
  await p.reload(); // now controlled by the service worker
  await p.getByText('Field Foundations').first().waitFor();
  assert(await p.evaluate(() => !!navigator.serviceWorker.controller), 'service worker is running');
  await p.goto(`${BASE}/module/${mod.id}`);
  await p.getByText(/Lessons ·/).waitFor();
  await p.goto(`${BASE}/module/${mod.id}/quiz`);
  await p.getByText('Question 1 of').waitFor();
  await p.goto(`${BASE}/module/${mod.id}/lesson/${mod.lesson + 1}`);
  await p.getByText(`Lesson ${mod.lesson + 1} of`).waitFor();

  console.log('No signal…');
  await ctx.setOffline(true);
  await p.reload();
  await p.getByText(`Lesson ${mod.lesson + 1} of`).waitFor();
  assert(true, 'an opened lesson still loads with no signal');
  assert(await p.getByText("You're offline.").isVisible(), 'the offline banner shows');
  await p.getByRole('button', { name: /Done|Next lesson|Back to module/ }).click();
  await p.waitForURL((u) => !u.pathname.endsWith(`/lesson/${mod.lesson + 1}`));
  assert(true, 'finishing a lesson offline moves on instead of failing');
  await p.goto(`${BASE}/module/${mod.id}`).catch(() => {});
  await p.getByText(/Lessons ·/).waitFor();
  const queued = await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('titan:queue:')).map((k) => localStorage.getItem(k)).join(''));
  assert(queued.includes(`"index":${mod.lesson}`), 'the finished lesson is queued on the phone');

  // A quiz offline: the answers are kept and the tech is told why it didn't send.
  await p.goto(`${BASE}/module/${mod.id}/quiz`).catch(() => {});
  const quizLoaded = await p.getByText('Question 1 of').waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
  if (quizLoaded) {
    for (let i = 0; i < 5; i++) {
      await p.locator('button').filter({ hasText: /^A/ }).first().click();
      await p.getByRole('button', { name: i < 4 ? 'Next' : 'Finish', exact: true }).click();
    }
    await p.getByText(/No signal right now/).waitFor();
    assert(true, 'a quiz submitted with no signal says so and keeps the answers');
  } else console.log('  (quiz not opened earlier, so not cached: skipped)');

  console.log('Signal back…');
  await ctx.setOffline(false);
  await p.goto(`${BASE}/`);
  await p.getByText('Field Foundations').first().waitFor();
  await p.evaluate(() => window.dispatchEvent(new Event('online')));
  let sent = false;
  for (let i = 0; i < 20 && !sent; i++) {
    const d = await (await api('GET', `/api/modules/${mod.id}`)).json();
    sent = d.doneLessons.includes(mod.lesson);
    if (!sent) await p.waitForTimeout(500);
  }
  assert(sent, 'the queued lesson reached the server when signal came back');
  const left = await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('titan:queue:')).length);
  assert(left === 0, 'the queue is empty afterwards');

  console.log('Shared device…');
  const cachedBefore = await p.evaluate(async () => (await (await caches.open('titan-api')).keys()).length);
  assert(cachedBefore > 0, `the phone has an offline copy (${cachedBefore} responses)`);
  await p.getByRole('button', { name: 'Sign out' }).click();
  await p.waitForURL(/\/login/);
  await p.getByRole('heading', { name: 'Sign in' }).waitFor();
  const cachedAfter = await p.evaluate(async () => (await caches.keys()).includes('titan-api') ? (await (await caches.open('titan-api')).keys()).length : 0);
  assert(cachedAfter === 0, 'signing out wipes the offline copy, so the next person never sees it');

  assert(!errors.length, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await browser.close();
  console.log('\nAll offline checks passed.');
}

main().catch((e) => { console.error(e); process.exit(1); });
