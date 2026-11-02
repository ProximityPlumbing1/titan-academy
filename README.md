# Titan Academy — Rebuild Handoff Package

This folder is the old **Titan Academy** app (ServiceTitan onboarding and training for
Proximity Plumbing), which ran as a single `index.html` on Netlify, plus a new plan to
rebuild it on **Railway** as the training platform for **Install, Service and Sales Techs**:
individual logins, self-paced on phones, live sessions presented on the TV with techs following
on their phones, an 8-week program, and a certificate at the end.

## How to use this with Claude Code

1. Create a new empty folder or GitHub repo and unzip this package into it.
2. Open Claude Code in that folder.
3. Paste this prompt:

> Read `BUILD_INSTRUCTIONS.md` and `CLAUDE.md`, then the docs they point to. Build Titan
> Academy version 1 on Railway: a login for each tech, a desktop admin area, and running a
> class from my phone or desktop onto the 80-inch TV with techs following on their phones.
> Run with the defaults in BUILD_INSTRUCTIONS and ask me only about the items under
> "Ask the owner first".

You don't need to answer the open questions first. They're defaulted in `BUILD_INSTRUCTIONS.md`
and listed on the app's "Needs answers" page.

## What's inside

| Path | What it is |
|---|---|
| `BUILD_INSTRUCTIONS.md` | **Start here.** Version 1 scope, Railway setup matching your other apps, defaults for open questions, and what Claude Code must ask before doing. |
| `CLAUDE.md` | Standing instructions for Claude Code. It reads this automatically. |
| `docs/REBUILD_BRIEF.md` | **The spec.** Trade-training focus, new features (field sign-offs, trainer mode, onboarding schedules), phases and acceptance criteria. |
| `docs/TRADE_TRAINING_PLAN.md` | **The curriculum** for Field Foundations, Install Tech, Service Tech and Sales Tech: modules, lessons, key points, simulations, sign-offs, how to run the program, and open questions. |
| `docs/LIVE_SESSIONS.md` | How presenting on the TV with techs following on their phones works: screens, joining, live quiz, role-play voting, exam mode, sync. |
| `docs/EXTERNAL_TRAINERS.md` | Which outside trainers to call (Service MVP, Nexstar, Sandler…), which of their ideas the curriculum borrows (credited), and what to ask before signing. |
| `legacy/sales-sessions-oct-2026/` | Your October 2026 sales sessions ('Selling the Big Job' and 'The Customer Who Can't Afford It'). Source material for Advanced Sales, and the visual style for TV slides. |
| `docs/CURRENT_APP.md` | How the old app works: screens, progression rules, XP, badges, certificates, admin. |
| `docs/SUPABASE.md` | The **legacy** Supabase backend, plus the data model to rebuild in Railway Postgres. |
| `docs/RAILWAY_DEPLOY.md` | How to deploy on Railway, plus the Google sign-in redirect setting that has to change. |
| `docs/KNOWN_ISSUES.md` | Bugs and weak spots in the old app that the rebuild should fix. |
| `data/trade-paths.json` | The trade curriculum as data (the source of truth for the plan above). |
| `data/trade-outline.csv` | The trade curriculum as a spreadsheet, one row per module, for review in Excel or Sheets. |
| `data/team-roster.csv` | The current field team (25 techs) with roles and paths. Fill in emails, groups and assessors. **Private staff data: use a private repo only.** |
| `data/curriculum.json` | All **legacy** course content pulled out as clean JSON: 11 paths, 106 modules, 962 lessons, 516 quiz questions, 2 simulations. |
| `data/reference.json` | 12 quick-reference help articles. |
| `data/badges.json` | 9 achievement badges. |
| `data/content-summary.csv` | One row per module. Open it in Excel or Sheets to review the course outline. |
| `legacy/index.html` | The original file, untouched. |
| `legacy/app.js`, `legacy/styles.css`, `legacy/body-markup.html` | The same file split into parts so it's easier to read. |
| `.env.example` | The environment variables the new app needs. |

## Not included (find these if you can)

The old site loaded these files, but they weren't in the uploaded HTML. Grab them from
the Netlify deploy if they still exist (Netlify → Deploys → download a deploy):
`/manifest.json`, `/sw.js`, `/icon-180.png` and any other icons.

If you can't get them, Claude Code can make new ones.
