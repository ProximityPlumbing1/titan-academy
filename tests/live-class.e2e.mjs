// End-to-end live class test: 1 presenter (desktop), 1 TV view, 12 tech phones.
// Usage: E2E_BASE=http://localhost:3100 E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... npm run e2e
// Creates throwaway test passwords for 12 techs, so only run it against a test database.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.E2E_BASE || 'http://localhost:3100';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@proximityplumbing.com.au';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'longpassword1';
const SHOTS = process.env.E2E_SHOTS || '';
const PHONES = 12;
const F1_ANSWERS = [2, 1, 0, 3, 1];

const shot = async (page, name) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
const assert = (cond, msg) => { if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`); console.log(`  ✓ ${msg}`); };

async function call(sid, p, body, method) {
  const r = await fetch(BASE + p, {
    method: method ?? (body ? 'POST' : 'GET'),
    headers: { 'x-titan': '1', ...(body ? { 'content-type': 'application/json' } : {}), ...(sid ? { cookie: `ta_sid=${sid}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${p}: ${r.status} ${data.error}`);
  const sidMatch = /ta_sid=([^;]+)/.exec((r.headers.getSetCookie?.() ?? []).join(';'));
  return { data, sid: sidMatch?.[1] };
}

const cookieFor = (sid) => [{ name: 'ta_sid', value: sid, url: BASE }];

async function main() {
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  console.log('Setting up accounts…');
  const { sid: adminSid } = await call(null, '/api/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  const users = (await call(adminSid, '/api/admin/users')).data.users
    .filter((u) => (u.tradeRole === 'install' || u.tradeRole === 'service') && u.status !== 'disabled')
    .slice(0, PHONES);
  const techSids = [];
  for (const [i, u] of users.entries()) {
    const link = (await call(adminSid, `/api/admin/users/${u.id}/link`, {})).data;
    const token = link.url.split('/').pop();
    const info = (await call(null, `/api/auth/link/${token}`)).data;
    const r = await call(null, `/api/auth/link/${token}`, { password: 'e2e-test-pass', email: info.needsEmail ? `e2e+${i}@example.com` : undefined });
    techSids.push(r.sid);
  }
  assert(techSids.length === PHONES, `${PHONES} tech logins ready`);

  const cls = (await call(adminSid, '/api/admin/classes', { title: 'E2E · Week 1: The Proximity Standard', groupId: 'field', moduleIds: ['f1', 'f4'] })).data.class;
  const browser = await chromium.launch();
  try {
    // Presenter (desktop)
    const presCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await presCtx.addCookies(cookieFor(adminSid));
    const pres = await presCtx.newPage();
    await pres.goto(`${BASE}/present/${cls.id}`);
    await pres.getByRole('button', { name: 'Go live' }).click();
    await pres.getByRole('button', { name: 'Open TV view' }).first().waitFor();
    const code = (await call(adminSid, `/api/admin/classes/${cls.id}`)).data.class.join_code;
    assert(/^\d{4}$/.test(code), `class is live with code ${code}`);

    // TV (1080p, no login)
    const tvCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const tv = await tvCtx.newPage();
    await tv.goto(`${BASE}/tv/${code}`);
    await tv.getByText(code, { exact: true }).first().waitFor();
    assert(true, 'TV view shows the join code without logging in');

    // 12 phones
    const phones = [];
    for (let i = 0; i < PHONES; i++) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      await ctx.addCookies(cookieFor(techSids[i]));
      const page = await ctx.newPage();
      await page.goto(`${BASE}/live/${code}`);
      phones.push({ ctx, page });
    }
    await Promise.all(phones.map((p) => p.page.getByText("You're in.").waitFor()));
    assert(true, `${PHONES} phones joined and show the welcome screen`);
    await pres.getByText(`In the room (${PHONES})`).waitFor();
    assert(true, `presenter sees all ${PHONES} people in the room`);
    await shot(tv, 'tv-1080-welcome');
    await shot(pres, 'presenter-desktop-welcome');

    // Slide sync latency: next slide
    let t0 = Date.now();
    await pres.keyboard.press('ArrowRight');
    await Promise.all(phones.map((p) => p.page.getByText(/Module 1 of 7/).waitFor()));
    const nextLatency = Date.now() - t0;
    assert(nextLatency < 1000, `slide change reached all phones in ${nextLatency} ms (< 1000 ms)`);
    await shot(phones[0].page, 'phone-title');
    await pres.keyboard.press('ArrowRight');
    await pres.keyboard.press('ArrowRight');
    await tv.waitForTimeout(400);
    await shot(tv, 'tv-1080-point');

    // Quiz: go to each f1 question, phones answer, reveal
    const options = await pres.locator('select option').allTextContents();
    for (let qn = 1; qn <= 5; qn++) {
      const idx = options.findIndex((o) => o.includes(`Q${qn}:`) );
      t0 = Date.now();
      await pres.locator('select').selectOption(String(idx));
      await Promise.all(phones.map((p) => p.page.getByText(`Question ${qn}/5`).waitFor()));
      if (qn === 1) assert(Date.now() - t0 < 1000, `jump to question reached all phones in ${Date.now() - t0} ms`);
      await Promise.all(phones.map(async (p, i) => {
        const right = F1_ANSWERS[qn - 1];
        const choice = i < 6 || qn > 2 ? right : (right + 1) % 4;
        await p.page.locator('main, div').getByRole('button').nth(choice).click();
      }));
      await tv.getByText(`${PHONES} of ${PHONES} answered`).waitFor();
      if (qn === 1) {
        assert(true, 'TV shows live answer count (12 of 12 answered)');
        await shot(tv, 'tv-1080-question');
        await shot(pres, 'presenter-desktop-question');
        await shot(phones[0].page, 'phone-question-answered');
      }
      await pres.keyboard.press('r');
      await Promise.all(phones.map((p) => p.page.getByText(/You got it\.|The answer was/).waitFor()));
      if (qn === 1) {
        assert(true, 'reveal reached every phone with their own result');
        await shot(tv, 'tv-1080-reveal');
        await shot(phones[0].page, 'phone-reveal-right');
        await shot(phones[7].page, 'phone-reveal-wrong');
      }
    }

    // A phone drops out and rejoins: lands on the current slide
    await phones[3].page.close();
    phones[3].page = await phones[3].ctx.newPage();
    await phones[3].page.goto(`${BASE}/live/${code}`);
    await phones[3].page.getByText('Question 5/5').waitFor();
    await phones[3].page.getByText(/You got it\./).waitFor();
    assert(true, 'a phone that rejoins lands on the current slide with its answer kept');

    // 4K TV render check
    const tv4k = await (await browser.newContext({ viewport: { width: 3840, height: 2160 } })).newPage();
    await tv4k.goto(`${BASE}/tv/${code}`);
    await tv4k.getByText('Answers revealed').waitFor();
    await shot(tv4k, 'tv-4k-reveal');
    assert(true, 'TV view renders at 3840×2160');

    // Presenter on a phone (remote layout)
    const remoteCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await remoteCtx.addCookies(cookieFor(adminSid));
    const remote = await remoteCtx.newPage();
    await remote.goto(`${BASE}/present/${cls.id}`);
    await remote.getByRole('button', { name: 'Next →' }).last().waitFor();
    await shot(remote, 'presenter-phone-remote');
    t0 = Date.now();
    await remote.getByRole('button', { name: 'Next →' }).last().tap();
    await phones[0].page.getByText(/On the job this week|Remember|Module 2 of 7/).waitFor();
    assert(Date.now() - t0 < 1500, `presenter phone remote advanced the slides (${Date.now() - t0} ms)`);

    // End class from the desktop presenter
    await pres.getByRole('button', { name: 'End class' }).first().click();
    await pres.getByRole('dialog').or(pres.locator('.fade-in')).getByRole('button', { name: 'End class' }).last().click();
    await pres.getByText('Class finished').waitFor();
    await Promise.all(phones.map((p) => p.page.getByText('Class finished').waitFor()));
    assert(true, 'ending the class reaches the presenter and every phone');
    await shot(pres, 'presenter-summary');
    const ended = (await call(adminSid, `/api/admin/classes/${cls.id}`)).data.class;
    assert(ended.status === 'ended' && ended.summary.attended === PHONES, `summary saved: ${ended.summary.attended} attended`);
    const f1 = ended.summary.modules.find((m) => m.moduleId === 'f1');
    assert(f1.averageScore === 80, `f1 average score is 80% (6 × 100% and 6 × 60%), got ${f1.averageScore}`);
    assert(f1.needRetake.length === 6, '6 techs flagged to retake f1');

    // Progress shows on the admin dashboard
    const dash = (await call(adminSid, '/api/admin/dashboard')).data;
    const passed = dash.techs.filter((t) => t.modules.f1 === 'done').length;
    assert(passed >= 6, `admin dashboard shows f1 done for ${passed} techs`);
    const adminPage = await presCtx.newPage();
    await adminPage.goto(`${BASE}/admin`);
    await adminPage.getByText('Install Techs').waitFor();
    await shot(adminPage, 'admin-dashboard');
    await adminPage.goto(`${BASE}/admin/users`);
    await adminPage.getByRole('button', { name: /Invite link/ }).first().click();
    await adminPage.getByText('Copy message').waitFor();
    await shot(adminPage, 'admin-invite-link');
    console.log('\nAll live-class checks passed.');
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
