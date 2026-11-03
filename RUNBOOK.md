# Titan Academy: Runbook

Live at **https://titan-academy-production.up.railway.app** (a custom domain is coming).

## 1. First-time admin setup (William, once)
1. Open the site and tap **First-time admin setup** (or go to `/setup`).
2. Enter the **setup code** (given to William separately), your email and a password of at
   least 10 characters.
3. You land in the admin area. The setup page switches itself off for good.
4. Aldwin is already set up as an admin: create his invite link (step 2) and send it to him.

## 2. Give a tech their login
1. **Admin → People & logins.** All 25 techs and the office team are already listed.
2. Next to the person, tap **Invite link**. You can then:
   - let them **scan the QR code** from your screen, or
   - tap **Copy message** and paste it into SMS or WhatsApp.
3. They open the link, enter their email (if it isn't on file) and choose a password. They
   stay signed in on that phone for 90 days of inactivity.
4. Tell them to add it to their home screen so it opens like an app:
   - **iPhone:** in Safari, tap Share, then **Add to Home Screen**.
   - **Android:** in Chrome, tap ⋮, then **Add to Home screen**.
5. A link works once and expires after 7 days. Making a new link cancels the old one.

**Forgotten password:** People & logins → **Reset link**, then send it the same way.
**Someone leaves:** People & logins → **Disable**. This signs them out everywhere and keeps
their history.

## 3. Run a class on the TV
1. **Admin → Classes → New class.** Pick a week from the 8-week plan to fill in the title,
   group and modules, or choose them yourself. Then tap **Create class**.
2. Tap **Go live**. You get a 4-digit **join code**.
3. **Put it on the TV**, either way:
   - **Laptop plugged into the TV:** tap **Open TV view**, drag the window onto the TV, and
     press F11 (or double-click the TV view) for full screen.
   - **The TV's own browser** (smart TV, Chromecast, mini-PC): open
     `titan-academy-production.up.railway.app/tv/CODE`. No login is needed.
4. **Techs join on their phones:** a **Live now: Join** banner appears on their home screen.
   They can also scan the QR code on the TV, or tap *Join a class with a code*.
5. **Presenting:**
   - **Next / Back:** the buttons, the arrow keys, the space bar, or a presentation clicker.
   - **Questions:** phones show answer buttons and the TV shows how many have answered.
     Press **Reveal answer** (or **R**) to show the results and the explanation.
   - **Present from your phone:** sign in on your phone, then open Classes → **Back to
     class**. Your phone becomes a remote with big Next and Back buttons.
   - **Someone without a phone:** tap **+ Tick someone in**.
6. Tap **End class** when you finish. This records attendance, credits the module to everyone
   who attended, and saves each tech's quiz score (80% passes). Anyone under 80% is listed to
   retake the quiz on their phone.

**Rehearse once before the first real class:** your laptop, the actual TV, and 3–4 phones.
Run through one whole module.

## 4. Reading the dashboard
- **Green:** module done (quiz passed, or attended for modules without a quiz).
- **Amber:** started.
- **Grey:** not started.
- **Needs attention** lists anyone who hasn't signed up, has been inactive for 7+ days, or
  has failed a quiz twice.

## 5. Needs answers
**Admin → Needs answers** lists every `[CONFIRM]` and `[VERIFY]` in the training, such as
the warranty wording and lead techs. They show as "to be confirmed" on the TV until they're
answered in `data/trade-paths.json`.

## 6. What's in version 1, and what's next
**In now:**
- a login for every tech
- the desktop admin area
- live TV classes with phones (quiz, role-play, attendance, scores)
- self-paced key points and quizzes on phones
- the progress dashboard

**Content so far:**
- every module has its key points, lesson list and sign-offs
- **quizzes are drafted for Field Foundations (f1–f7) and Sales x1–x2**, so the week 1
  classes are ready
- other modules still run as classes from their key points; their quizzes come next

**Coming next:**
- written lessons
- the remaining quizzes
- sign-offs on the job
- the 8-week program with due dates
- certificates
- email invites (until then, use Copy link or the QR code)

---

## For developers
- **Stack:** Node 22 + Fastify + WebSockets, Postgres, React + Vite + Tailwind, all in one
  service.
- **Run locally:**
  1. Start Postgres and set `DATABASE_URL`.
  2. `npm install && npm run build && npm run migrate && npm start`.
  3. For development: `npm run dev:server` and `npm run dev:web`.
- **Tests:** `npm test` runs the unit tests. `npm run e2e` runs the live class with one
  presenter, a TV and 12 phones. **Only run it against a test database:** it sets test
  passwords for 12 techs.
- **Railway:** pushes to `main` deploy automatically. The service runs
  `npm run migrate && npm start`, and the health check is `/health`.
- **Variables:** `DATABASE_URL`, `SESSION_SECRET`, `PUBLIC_URL`, `ADMIN_SETUP_CODE`,
  `OWNER_EMAIL`, `TZ`, `NODE_ENV`.
- **Content:**
  - `data/trade-paths.json` holds the curriculum.
  - `content/quizzes.json` holds the quizzes and role-plays (drafts).
  - Slides are generated from both.

## 8-week program and sign-offs
- **Start the program:** Admin → 8-week program. Pick the start date and each group's day and time (Sydney time), then create. That makes all 23 classes; move any single class with Move. Ending a program removes classes that haven't happened and keeps everyone's progress.
- **Who gets sign-off requests:** set on each person in People & logins under "Receives sign-off requests". Lead techs get technical items for their own trade. When the Install Manager is hired, tick Install Manager (and Can sign off anything) on them and untick it on Charlotte.
- **Reviewing:** reviewers see "Sign-offs waiting for you" on their phone home screen, or use Admin → Sign-offs. Sending one back needs a note saying what to do.
- **Test:** `E2E_BASE=http://localhost:3000 npm run e2e:program` (test database only: it ends any running program and changes test users' flags).

## Final assessment and certificates
- **Before week 8:** Admin → Final & certificates → upload William's signature (a PNG with a transparent background works best) and press "Preview a sample certificate".
- **In the week 8 session:** press "Open the final assessment". Techs see a banner on their phone. Each gets 25 questions from their role's pool; 80% passes; they get two sittings. Use "+1 attempt" for anyone who needs another. Close it after the session.
- **Sales Techs:** tick "Role-play" for each one who passes the live role-play round (William, Harriet or anyone who can sign off anything).
- **Certificates issue themselves** the moment a tech has every module quiz, every sign-off, the final (and the role-play round for Sales). "Issue now" is there in case one is ever missed.
- **Revoke and reissue:** revoke with a reason (for example when an apprentice becomes licensed), update their details (untick Apprentice), then press Issue now. The old number shows as not valid on the verification page.
- **Question pools** are drafts in `content/final/<role>.json`. Changing them doesn't affect sittings already started.
- **Test:** `E2E_BASE=http://localhost:3000 npm run e2e:certificates` (test database only).

## Test-out, supervisors, exports and the Sales scoreboard
- **Module complete** means the quiz is passed (80%+) and every lesson is read. Lessons are read on the phone, credited by attending the live class, or ticked off by **testing out**: 90%+ on the module quiz.
- **Apprentices:** People & logins → edit the apprentice → Supervising tech. Their sign-offs then go to that tech only (William and Charlotte can still sign anything). With no supervisor set, they follow the normal routing.
- **Exports:** Dashboard → Export progress (CSV) gives one row per tech per module; Export sign-offs (CSV) lists every request.
- **Sales scoreboard:** Admin → Sales scoreboard. Harriet (or an admin) enters each Sales Tech's baseline (their last 90 days) and weekly numbers from ServiceTitan. Sales Techs see their two numbers on their phone.
- **Week 8 TV:** the final-assessment class has a "Certified" slide that fills with names as people certify.
- **Test:** `E2E_BASE=http://localhost:3000 npm run e2e:gaps` (test database only; run `e2e:program` first so a week 8 class exists).

## Offline, installing and quality checks
- **No signal on site:** lessons a tech has opened still load; lessons finished offline are queued on the phone and sent when signal returns. Quizzes and sign-off requests need signal: the app says so and keeps what they entered.
- **Shared devices:** signing out wipes the offline copy, and a different person signing in on the same device clears the previous person's copy first.
- **Install on a phone:** iPhone: Safari → Share → Add to Home Screen. Android: Chrome → menu → Install app.
- **Speed:** built files are compressed at build time (`scripts/compress.mjs`, Brotli and gzip) and API responses on the fly.
- **Checks before a release:** `npm test`, then against a test database `npm run e2e`, `e2e:program`, `e2e:certificates`, `e2e:gaps`, `e2e:offline` and `audit:a11y` (WCAG 2.1 AA with axe). Lighthouse mobile on 3 Nov 2026: performance 94–98, accessibility 100, best practices 100.

## Roster import and profiles
- **Roster:** People & logins → Download roster (CSV), edit it in a spreadsheet, then Import roster (CSV). Columns: name, trade_role (install, service or salestech), apprentice, email, lead_tech, supervising_tech. You see every change before it's saved; nobody is removed (people missing from the file are listed so you can disable anyone who has left).
- **Profile:** techs tap Profile on their phone for progress by path, quiz results, sign-off history, final attempts, their certificate and Change password (which signs out their other devices).
- **Test:** `E2E_BASE=http://localhost:3000 npm run e2e:team` (test database only).
