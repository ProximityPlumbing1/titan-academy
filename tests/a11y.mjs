// Accessibility audit: runs axe-core (WCAG 2.1 A and AA) on every main screen at phone, desktop and TV sizes.
// Usage: E2E_BASE=http://localhost:3100 npm run audit:a11y   (test database: logs in as the e2e test users)
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const BASE = process.env.E2E_BASE || 'http://localhost:3100';
const ADMIN = [process.env.E2E_ADMIN_EMAIL || 'admin@proximityplumbing.com.au', process.env.E2E_ADMIN_PASSWORD || 'longpassword1'];
const TECH = ['e2e+1@example.com', 'e2e-test-pass'];

const PHONE = { width: 375, height: 812 };
const DESKTOP = { width: 1440, height: 900 };
const pages = [
  { who: null, size: PHONE, path: '/login', wait: 'Sign in' },
  { who: null, size: PHONE, path: '/verify/TA-0000-0000-NONE', wait: 'Certificate not found' },
  { who: TECH, size: PHONE, path: '/', wait: 'Field Foundations' },
  { who: TECH, size: PHONE, path: '/module/f1', wait: 'Key points' },
  { who: TECH, size: PHONE, path: '/module/f1/lesson/3', wait: 'Lesson 3 of' },
  { who: TECH, size: PHONE, path: '/module/f2/quiz', wait: 'Question 1 of' },
  { who: TECH, size: PHONE, path: '/final', wait: 'Final assessment' },
  { who: TECH, size: PHONE, path: '/certificate', wait: 'Your certificate' },
  { who: TECH, size: PHONE, path: '/join', wait: 'Join a class' },
  { who: ADMIN, size: DESKTOP, path: '/admin', wait: 'Dashboard' },
  { who: ADMIN, size: DESKTOP, path: '/admin/users', wait: 'People' },
  { who: ADMIN, size: DESKTOP, path: '/admin/program', wait: '8-week program' },
  { who: ADMIN, size: DESKTOP, path: '/admin/classes', wait: 'Classes' },
  { who: ADMIN, size: DESKTOP, path: '/admin/signoffs', wait: 'Sign-offs' },
  { who: ADMIN, size: DESKTOP, path: '/admin/certificates', wait: 'Final assessment & certificates' },
  { who: ADMIN, size: DESKTOP, path: '/admin/scoreboard', wait: 'Sales scoreboard' },
  { who: ADMIN, size: DESKTOP, path: '/admin/content', wait: 'Content' },
  { who: ADMIN, size: DESKTOP, path: '/admin/content/x3', wait: 'Written lessons' },
  { who: ADMIN, size: DESKTOP, path: '/admin/needs-answers', wait: 'Needs answers' },
  { who: ADMIN, size: PHONE, path: '/review', wait: 'Review sign-offs' },
];

const browser = await chromium.launch();
const contexts = new Map();
async function ctxFor(who, size) {
  const k = `${who?.[0] ?? 'anon'}:${size.width}`;
  if (contexts.has(k)) return contexts.get(k);
  const ctx = await browser.newContext({ viewport: size, reducedMotion: 'reduce', bypassCSP: true }); // lets the audit inject axe
  if (who) {
    const r = await ctx.request.post(`${BASE}/api/auth/login`, { data: { email: who[0], password: who[1] }, headers: { 'x-titan': '1' } });
    if (!r.ok()) throw new Error(`login failed for ${who[0]}`);
  }
  contexts.set(k, ctx);
  return ctx;
}

let total = 0;
for (const p of pages) {
  const ctx = await ctxFor(p.who, p.size);
  const page = await ctx.newPage();
  await page.goto(`${BASE}${p.path}`);
  await page.getByText(p.wait).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(300);
  await page.addScriptTag({ content: axeSource });
  const res = await page.evaluate(async () => (window).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
  const v = res.violations;
  total += v.length;
  console.log(`${v.length ? '✗' : '✓'} ${p.path} (${p.size.width}px)${v.length ? `: ${v.length} issue${v.length > 1 ? 's' : ''}` : ''}`);
  for (const x of v) {
    console.log(`    [${x.impact}] ${x.id}: ${x.help}`);
    for (const n of x.nodes.slice(0, 3)) console.log(`        ${n.target.join(' ')}  ${(n.failureSummary || '').split('\n').slice(1, 2).join(' ').trim().slice(0, 140)}`);
  }
  await page.close();
}
await browser.close();
console.log(total ? `\n${total} accessibility issue type(s) found.` : '\nNo accessibility issues found.');
process.exit(total ? 1 : 0);
