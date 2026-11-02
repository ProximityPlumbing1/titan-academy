# BUILD INSTRUCTIONS (start here)

**These instructions override anything else in this package.** The other docs give the
detail: the curriculum (`docs/TRADE_TRAINING_PLAN.md`, `data/trade-paths.json`), live-class
behaviour (`docs/LIVE_SESSIONS.md`) and the full spec (`docs/REBUILD_BRIEF.md`). Where they
mention Supabase, use the Railway Postgres equivalent described here.

## The goal: version 1, in this order
1. **On Railway**, built and deployed the same way as Proximity's other apps.
2. **Every tech has their own login** and works at their own pace on their phone.
3. **A desktop admin area** for the owner and office.
4. **Run a class**: present from a desktop *or* a phone, with the slides on an **80-inch TV**,
   while every tech follows on their own phone (live quiz answers, role-play votes, automatic
   attendance).

Then: sign-offs, the 8-week schedule and due dates, the final assessment and certificates.

**Run with what we have.** Don't stop for open questions. Use the defaults in "Decisions
already made for you" below, leave `[CONFIRM]` and `[VERIFY]` items visibly marked in
content, and list them on an admin "Needs answers" page. Ask the owner only before anything
destructive, outward-facing or costly (see "Ask first").

---

## House conventions (copied from Proximity's live Railway apps)
Read live from the Railway account (workspace "Proximity Plumbing's Projects",
`a5cb2632-9251-4d4d-a075-384203083ff2`). Match these:

| Convention | sales-pro / command-centre | Do this for Titan Academy |
|---|---|---|
| Code | Monorepo `proximity-command-centre`; sales-pro lives at `apps/sales-pro` | **Dedicated private repo `ProximityPlumbing1/titan-academy`** (created by the owner, Nov 2026). The app lives at the **repo root** |
| Builder | Railpack, with watch patterns on the app folder | Railpack. No watch patterns needed (the whole repo is the app) |
| Database | A Railway Postgres service, using `DATABASE_URL` | Same: a new Postgres in the new project |
| Start | `npm run migrate && npm start` | Same |
| Health | `GET /health` | Same |
| Auth | Server sessions (`SESSION_SECRET`), Google (`GOOGLE_CLIENT_ID`) with a `STAFF_DOMAIN` | Same pattern (see Logins) |
| Email | Gmail via a service account (`GMAIL_SENDER`, `GOOGLE_SA_JSON`) | Same, for invite and reset emails |
| Region | command-centre runs in `asia-southeast1` (Singapore) | Use `asia-southeast1`, the closest to Sydney, with **1 replica** (live classes keep state in one process) |
| Domain | `*.proximityplumbing.com.au` custom domains | `academy.proximityplumbing.com.au` (ask first: it needs a DNS record) |
| Timezone | `TZ` variable | `TZ=Australia/Sydney` |

### Railway setup
1. Create the project **`titan-academy`** in the workspace above (the owner asked for this).
2. Add a **Postgres** service, and a **web** service from the repo with root directory
   `/` (repo root), Railpack, start `npm run migrate && npm start`, health check
   `/health`, region `asia-southeast1`, 1 replica.
3. Variables: `DATABASE_URL` (reference the Postgres service), `SESSION_SECRET` (generate a
   long random value), `PUBLIC_URL`, `STAFF_DOMAIN=proximityplumbing.com.au`, `TZ`,
   `NODE_ENV=production`, and `GMAIL_SENDER` + `GOOGLE_SA_JSON` + `GOOGLE_CLIENT_ID`. **Ask
   the owner before copying the Gmail and Google values** from sales-pro.
4. Generate a Railway domain first. Add the custom domain after the owner OKs it.
5. Use a `staging` environment as well as `production`, like command-centre.

### Stack
- **Server:** Node + TypeScript, Fastify (or Express), `ws` (or Socket.IO) for live classes on
  the same server, Postgres via `pg` with plain SQL migrations (`npm run migrate`), and
  sessions in Postgres.
- **Client:** Vite + React + TypeScript + Tailwind, served by the same server. A PWA so techs
  can add it to their home screen.
- **Tests:** Vitest for the logic. Playwright for the critical flows, including **one presenter,
  one TV view and 12 phone clients** in a single live class.

---

## 1. Logins (one per tech)
- **Roles:** `admin` (William, Aldwin), `office` (Sadie, Charlotte, Harriet, and others as
  needed), `trainer`, `assessor`, `lead_tech`, `tech`. These are flags on the user, so one
  person can have several.
- **Seed** the office team from `docs/REBUILD_BRIEF.md` (Office roles) and the 25 techs from
  `data/team-roster.csv`, with role, trade, training group and apprentice flag. The emails
  column is empty, so admins fill it in on the Users screen.
- **Inviting a tech**, from the admin Users screen, three ways:
  - **Email invite**: a link valid for 7 days, sent by Gmail.
  - **Copy link**: for SMS or WhatsApp. Works even if email isn't set up or the tech has no email.
  - **Show QR**: the tech scans it from the admin's screen.

  The tech opens the link, sets a password, and lands on their own home screen.
- **Stay signed in** on phones (90-day rolling session). Prompt them to "Add to Home Screen".
- **Forgot password** by email link; admins can also generate a reset link. Admins can
  deactivate a user, which signs them out everywhere but keeps their history.
- **Google sign-in** is optional for anyone with a `proximityplumbing.com.au` account.
- Hash passwords with argon2 or bcrypt. Rate-limit login. Use one-time, hashed invite and
  reset tokens.
- Techs see only their own data. Office and admin see everyone.

## 2. Desktop admin (designed for 1440 px, works on a laptop)
Sidebar layout. Screens, in build order:
1. **Dashboard**: techs (rows) by modules (columns) heat-map, grouped by Install, Service and
   Sales. Shows "needs attention" (behind, missed class, sign-off waiting more than 7 days,
   inactive more than 7 days), today's and next classes, and certificates issued.
2. **Users**: list and filter, invite (email, link or QR), resend, reset password, edit roles
   and flags (assessor, lead tech, trainer), deactivate. Roster CSV import.
3. **Classes**: create a class (group, modules, date and time), see upcoming and past classes
   with attendance and scores, and a **Start class** button.
4. **Program**: create the 8-week run from a start date (default Mon 1 Feb 2027) using
   `program.schedule`. Set each group's weekly day and time. Move single classes.
5. **Content**: browse every path, module, lesson, quiz and slide; preview a slide deck at TV
   size. The **Needs answers** list shows every `[CONFIRM]` and `[VERIFY]`.
6. **Sign-offs**: the queue routed by each module's `assessor`, with approve or send back
   (and a note). Evidence (photos, video, ServiceTitan job number) is attached by the tech.
7. **Certificates**: issued, pending (with what's missing), revoke and reissue.
8. **Sales scoreboard**: baseline and weekly average ticket and close rate per Sales Tech
   (manual entry or CSV for now).
9. **CSV export** of everything.

## 3. Running a class (phone or desktop presenter → 80-inch TV → techs' phones)
Full behaviour: `docs/LIVE_SESSIONS.md`. Version 1 must do the following.
- **Three views:**
  - **Presenter**: `/present/:id`, on a desktop **or a phone**. The phone layout is a
    one-handed remote: big Next and Back, slide title, notes, live answer count, who's joined,
    Reveal and End.
  - **TV**: `/tv/:code`, with no login. Open it on the TV's own browser, a Chromecast or
    mini-PC, or a laptop on HDMI.
  - **Phone follower**: `/live/:code`, for signed-in techs.
- **80-inch TV design:**
  - Assume 1920×1080 or 3840×2160, viewed from 3–5 m.
  - Scale type with the viewport: headline about 6–7 vh, body at least 3.2 vh, so nothing is
    smaller than roughly 30 px at 1080p.
  - At most about 25 words per slide. High contrast, dark theme, and a safe-area margin of
    5% (TVs overscan).
  - Show the join code and QR **large** on the first slide and small in the corner after that.
  - Visual style: copy the October 2026 decks in `legacy/sales-sessions-oct-2026/`.
  - Keyboard (arrows, space), clicker and phone-remote control all work.
- **Joining:** techs tap the "Live now: Join" banner on their home screen, scan the QR, or
  type the 4-digit code. The presenter sees who's connected, and can tick in anyone with a
  flat phone.
- **Slides** are generated automatically from each module:
  - title and objective
  - one slide per key point
  - "On the job"
  - 5 quiz questions
  - role-play steps (if the module has a sim)
  - Discuss questions
  - this week's sign-offs
  - recap

  The presenter can skip slides.
- **Live quiz:** phones show big answer buttons and the TV shows a countdown and "9 of 12
  answered". On Reveal, the TV shows an anonymous bar chart, the right answer and why; each
  phone shows the tech's own result.
- **Role-play:** phones vote on each step; the reveal shows the vote and the feedback.
- **Sync:** a WebSocket room per class. The presenter sends `{slide, phase}`, the server stores
  it in Postgres and broadcasts it. Late joiners and phones that drop out reconnect to the
  current slide. Fall back to polling every 5 seconds if the socket drops. Target under
  1 second from the presenter's tap to the phones.
- **End class:** records attendance, credits the covered modules' lessons to attendees, saves
  each tech's live quiz and role-play results as their attempt (80% passes), and shows the
  presenter a summary.
- **Rehearsal checklist before the first real class:** the owner's laptop or phone, the actual
  TV, and 3–4 real phones, run through one whole module.

## 4. Learner app (phone first, 375 px)
- **Home:** "This week" with due dates, a Join banner when their group is live, a progress
  ring, and pending sign-offs.
- **Path → module → lessons → quiz → role-play → sign-offs**, unlocked in order. Working
  ahead is allowed. Test-out (≥90%) is available for experienced techs.
- **Profile:** progress, XP and level, badges, and certificates (PDF download).
- **Offline:** lessons cache once opened, and progress queues and syncs later.

## 5. Content for version 1
- Load all paths, modules, key points, sign-offs, sims, bundles and the schedule from
  `data/trade-paths.json` at build time (keep it as the source of truth).
- **Write the missing content as drafts** in `content/` (repo root):
  - lesson text: 150–400 words, Australian English, from the key points plus the legacy
    `reuses`
  - 5 scenario quiz questions per module, each with a "why"
  - sims with 4–6 steps
  - a final-assessment pool of 25+ questions per role
  - "On the job" examples

  The **Advanced Sales** content comes mostly from the two October 2026 decks: reuse their
  lines and numbers.
- **Classes can run before every lesson is written:** slides come from key points, so a class
  works as soon as a module has key points and a quiz.
- Show the owner **one finished module per path** before writing the rest at full length. Don't
  wait idle for approval: keep building the app in the meantime.
- Never invent company facts. Keep `[CONFIRM]` and `[VERIFY]` visible in drafts.

## 6. After the four goals
Sign-off routing and evidence, the 8-week program with due dates, the weekly digest email
to William and Charlotte, reminders, the final assessment, and certificates (A4 landscape
PDF with a QR code to `/verify/<number>`). Details are in `docs/REBUILD_BRIEF.md`.

---

## Decisions already made for you (don't ask again)
- **Database:** Railway Postgres, not the legacy Supabase. Don't change the old Supabase project.
  Importing legacy progress is optional, needs the owner's OK, and is read-only. The new tech
  paths start fresh, and most legacy users have left.
- **Admins:** William and Aldwin. (John has left.)
- **Interim manager:** Charlotte for both Install and Service Techs until an Install Manager
  is hired (that role will cover Service too).
- **Sign-offs before lead techs are named:** Charlotte or William can sign anything off.
  Lead-tech and assessor flags are set in Users later.
- **Warranty wording:** show `[Approved warranty wording — CONFIRM]` wherever it's needed,
  and list it under Needs answers.
- **Profit:** 20% (about 50% labour and materials, 30% running the business, 20% profit).
- **Options:** Essential / Standard / Premium / Elite, Elite first. Every line comes from the
  pricebook, with no bundle discounts. Only Harriet or Sadie can change a price.
- **Start date:** admin-configurable, defaulting to Mon 1 Feb 2027. Class times are set by the
  admin.
- **Tech emails:** entered by admins in the app. Copy-link and QR invites work without them.

## Ask the owner first
- Creating the custom domain (needs a DNS change).
- Copying secrets (Gmail and Google credentials) from other Railway projects.
- Branches: `main` deploys to **production** and `staging` deploys to the **staging** environment.
  Work on feature branches and merge to `staging` freely. Ask the owner before merging to `main`
  until they say otherwise.
- Sending any real invite emails to staff.
- Anything that touches the legacy Supabase project or other apps' databases.
- Spending money (paid Railway resources beyond a small web service plus Postgres, or paid
  APIs).

## Definition of done for version 1
- [ ] `titan-academy` is deployed on Railway (staging and production), `/health` is green, and
      migrations run on deploy.
- [ ] Admins (William, Aldwin) can sign in on a desktop and see the dashboard, users and classes.
- [ ] All 25 techs and the office team are loaded. An invite by link or QR works end to end on
      a real phone, and the tech stays signed in.
- [ ] A tech can do a lesson and quiz on their phone, and progress shows on the admin dashboard.
- [ ] A class runs with the presenter on a phone **and** separately on a desktop, the TV view
      on a 1080p and a 4K screen, and at least 12 phones. Slides sync in under 1 second, quiz
      answers show live, a dropped phone rejoins on the current slide, and End class credits
      attendance and scores.
- [ ] The Playwright live-class test passes in CI.
- [ ] Every `[CONFIRM]` and `[VERIFY]` appears on the Needs answers page.
- [ ] A short `RUNBOOK.md` in the app folder covers how to invite a tech, start a class, put
      it on the TV, and reset a password.
