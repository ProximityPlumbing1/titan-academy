# CLAUDE.md — Titan Academy rebuild

You are rebuilding **Titan Academy**, Proximity Plumbing's internal ServiceTitan training
app (Sydney, Australia). The old version is a single 1.3 MB `legacy/index.html` that ran
on Netlify. The new version deploys on **Railway**.

**v2 focus: training the field team (Install, Service and Sales Techs).** Every tech has their own
login and learns at their own pace. The owner presents live on a TV while techs follow on their
phones. It runs as an 8-week program and ends in a certificate.

## Read first, in this order
0. **`BUILD_INSTRUCTIONS.md`: start here. It overrides everything else** (Railway Postgres, house
   conventions, version 1 scope, the defaults for open questions, and what to ask first)
1. `docs/REBUILD_BRIEF.md`: the full spec
2. `docs/TRADE_TRAINING_PLAN.md`: the curriculum (source of truth: `data/trade-paths.json`)
3. `docs/LIVE_SESSIONS.md`: running a class on the TV with techs following on phones
4. `docs/CURRENT_APP.md`: how the old app behaved (progression rules worth keeping)
5. `docs/KNOWN_ISSUES.md`: what not to repeat
6. `docs/RAILWAY_DEPLOY.md`: how this ships
7. `docs/SUPABASE.md`: **legacy only**. Its table designs carry over to Railway Postgres

## Hard rules
- **Build on Railway like Proximity's other apps**: Railway Postgres (`DATABASE_URL`), your
  own session auth, Railpack, `npm run migrate && npm start`, `/health`. Don't change the old
  Supabase project or any other app's database. Ask before anything in BUILD_INSTRUCTIONS
  "Ask the owner first".
- New tech paths start fresh. Importing legacy Supabase progress is optional, read-only, and
  needs the owner's OK.
- **Content comes from `data/*.json`.** Don't scrape `legacy/index.html` again. The JSON was
  extracted programmatically and is complete.
- **Never invent company facts** (pay, prices, rosters, policies, regulations). Anything
  marked `[CONFIRM]` or `[VERIFY]` stays visibly marked until the owner answers it. List
  these for the owner rather than guessing.
- The current office team is in `docs/REBUILD_BRIEF.md` (Office roles). Anyone not listed there or
  in `data/team-roster.csv` has left. Never name former staff anywhere. The legacy admin check
  still recognised John, who has left. In the new app, **the admins are William and Aldwin**.
- **Sales Techs only sell. The Install Manager owns delivery, customer happiness and payment.**
  The Install Manager manages the Service Techs too. No one is in that role yet: Charlotte
  (Operations Manager) is interim. Sign-offs are routed to Charlotte, lead techs, Harriet or Kim, with William as backup.
  Service Techs captain the planned jobs they sell. See
  `REBUILD_BRIEF.md`, "Interim field management".
- `data/team-roster.csv` is the current field team. Staff names never appear in lesson
  content, quizzes or anything customer-facing.
- **Proximity's own October 2026 sales sessions** (`legacy/sales-sessions-oct-2026/`) are
  primary source material. Reuse their lines, numbers and structure. Keep their source notes:
  most industry figures in them are US data showing correlation, not guarantees.
- **External trainers** (`docs/EXTERNAL_TRAINERS.md`): teach their *principles* in our own
  words and credit them. Never copy proprietary scripts, workbooks or paid material.
- **TV slides** follow the visual style of the October decks: 16:9, dark navy, italic serif
  headlines, Inter body, cyan eyebrow labels, gold accents, 'Say it like this' callouts, and
  discussion-question slides.
- Lesson content gets owner approval on one sample module per path before you write the rest.
- **Use Australian English** in the UI and copy (colour, organise, centre).
- **Secrets go in Railway variables only** (`SESSION_SECRET`, `DATABASE_URL`, Gmail and Google
  credentials). Never commit them and never send them to the browser.
- **Phone-first for techs, desktop-first for the owner and admin screens, plus a TV view.** Test
  at 375 px, 1440 px, and 1920×1080 plus 3840×2160 (an 80-inch TV, readable from 3–5 m).
- Visual identity matches William's website (proximityplumbing.com.au; owner's decision, Nov 2026):
  light pages, white cards with soft shadows, Proximity cyan `#00aded`, dark titles `#33353d`,
  Inter extra-bold headings with one Fraunces italic emphasised word, gold `#d4a94a` for
  certificates and achievements, circular progress rings. The TV keeps a dark navy (`#1a2332`)
  version via `.theme-dark`. Tokens live in `web/src/styles.css`.

## Working style
- Show a plan before each phase. Ask before a large architectural change.
- Commit in small logical steps.
- Before calling a phase done, run the app and check it in a browser (Playwright).
