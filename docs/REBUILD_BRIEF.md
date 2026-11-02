# Rebuild Brief: Titan Academy v2 (Trade Training)

## What the owner wants (the four requirements)
1. **Every tech has their own login** and can do the training at their own pace, on their
   own time, on their phone.
2. **The owner can use it on a desktop and present the same training on a big TV**, while
   the techs **follow along live on their phones**: same slide, answering quiz questions and
   voting in role-plays from their phones.
3. **An 8-week program** that goes through every module, with a live session each week for
   each group.
4. **A certificate at the end.**

Everything below serves those four. If something conflicts with them, they win.

## Content
The curriculum is in **`docs/TRADE_TRAINING_PLAN.md`** (human-readable) and
**`data/trade-paths.json`** (the source of truth, including `program.schedule`, the 8-week
week-by-week plan). There are five paths:

| Path id | Name | Who | Notes |
|---|---|---|---|
| `field` | Field Foundations | Install + Service (19) | 7 modules. Includes the customer promise and on-site complaints. |
| `selling` | Estimating & Selling Foundations | Service (7) | 5 modules: estimates, templates, hours and margin, presenting, 50% deposit and handover. |
| `install` | Install Tech | 12 | 12 modules, following Sadie's structure. |
| `service` | Service Tech | 7 | 10 modules. Service Techs **sell on the spot**. |
| `salestech` | Advanced Sales | 6 | 7 advanced modules, **no basics**: refresh and baseline, the bundling rule, bundle templates, bigger-ticket, commercial and strata, advanced objections, closing and pipeline. Sales Techs are the most experienced team, so they skip `field` and `selling`. |

Fixed business rules to apply everywhere:
- **Four options on every job: Essential / Standard / Premium / Elite, with Elite presented first.**
  (Essential = bare bones, fixes today's problem; Standard = solid, sensible; Premium = where most
  homes land; Elite = the best outcome.) Quizzes treat 'lead with Essential' as a wrong answer.
- **Pricing authority:** only Harriet (Sales Manager) or Sadie (Office Manager) can discount or
  adjust a price. Techs never can.
- **The bundling rule: never quote one job.** Better and Best bundle the related tasks and services found on site.
- **No bundle discounts.** Every line in a bundle is priced from the pricebook. Bundle templates
  are groups of pricebook lines with no discount or override lines, and quizzes should treat
  'offer a bundle discount' as a wrong answer.
- Planned work is **50% upfront on approval** (before scheduling or ordering materials), with
  the **balance on completion**.
- The customer promise is **fixed upfront price, no hidden costs, lifetime labour warranty,
  same-day return**.

The legacy office paths stay in `data/curriculum.json` for existing users. They're hidden
from tech accounts and are not part of v2.

## Recommended stack
**See `BUILD_INSTRUCTIONS.md`.** It overrides this section. In short: Node + TypeScript on
Railway, Railway Postgres, session auth, WebSockets for live classes, React + Vite + Tailwind,
built the same way as sales-pro and command-centre. Where this brief mentions Supabase
(Auth, Realtime, RLS, RPCs, Storage), build the equivalent in the Node server and Postgres.
Store media and sign-off photos in a Railway bucket or Postgres large objects (ask before
adding paid storage).

---

## Requirement 1: Individual logins and self-paced learning

### Accounts
- The admin imports `data/team-roster.csv` (or adds people one by one). The server sends each
  tech an **invite email** (a one-time invite link emailed by the server, or copied as a link or QR, see BUILD_INSTRUCTIONS). The tech taps the link,
  sets a password, and lands in the app already set up with their role, paths and group.
  No self-signup approval queue is needed for roster techs. Keep self-signup plus approval
  only for future hires.
- **Stay signed in** on the phone (long-lived refresh token). Prompt them to "Add to Home
  Screen" so it opens like an app.
- **Forgotten password / magic link** on the sign-in screen. The admin can **resend invite**
  or **send a sign-in link** from the Users screen.
- Google sign-in stays available for anyone with a `proximityplumbing.com.au` account.
- [CONFIRM] Do techs have company email addresses? If not, personal emails are fine.
  SMS one-time codes are an option later (needs an SMS provider and costs per message).

### Self-paced
- **Home screen**: "This week" (that week's modules from the schedule, with due dates), the
  next live session for their group (with a **Join** button when it's live), overall progress
  ring, and pending sign-offs.
- **Unlocking**: modules unlock in order, so a module opens when the previous one has its
  lessons and quiz done. Sign-offs don't block progression. **Working ahead is allowed.** Being behind
  isn't blocked; it's flagged. A live session always opens its modules for attendees, even
  if they're behind.
- **Test-out**: existing techs can take a module challenge quiz (≥90%) to skip its lessons.
  Sign-offs still apply.
- Works on poor signal: lessons cache once opened, and progress queues offline and syncs later.

## Requirement 2: Desktop, big TV, and phones following live
Full spec: **`docs/LIVE_SESSIONS.md`**. In short:
- The owner opens a session on the **desktop** (presenter console) and opens the **TV
  view** on the big screen. The TV shows a join code and QR. Techs tap **Join** on their phones.
- The presenter moves through slides that are generated from the module (objective, key
  points, media, "on the job" example, quiz, role-play, this week's sign-offs). **Every phone
  follows instantly.**
- **Quiz slides**: each tech answers on their phone. The TV shows a countdown and the number
  answered, then reveals the anonymous results, the right answer and why.
- **Role-play slides**: phones vote on each step. The TV reveals the vote and the feedback.
- **When the session ends**: attendance is recorded automatically, attendees are credited
  with the lessons, and each tech's live quiz score counts as their quiz attempt.
- **Desktop layout**: the whole app works properly at desktop width (sidebar nav, wide
  tables), not just as a phone column. Admin screens (dashboard, users, schedule, sign-offs)
  are designed desktop-first.

## Requirement 3: The 8-week program
- **Cohort**: the admin creates a program run with a **start date** (suggested Mon 1 Feb 2027
  [CONFIRM]). It's built from `program.schedule` in `trade-paths.json`: 8 weeks, with the
  groups Install + Service (weeks 1–2), Install, Service, Advanced Sales (90-minute weekly
  workshops) and Everyone (week 8).
- **Sessions**: the admin sets the day and time for each group's weekly session. The app
  creates all ~20 sessions with their modules pre-loaded. Each one can be moved
  individually (rain day, public holiday).
- **Due dates**: each module is due at the end of the week it's presented.
- **Owner dashboard** (desktop): a grid of techs (rows) by modules (columns). Each cell is
  not started / in progress / done / waiting for sign-off. It also shows overdue items,
  attendance per session, quiz scores and last active date. "Needs attention" filter: behind
  on due dates, missed a session, failed a quiz twice, or a sign-off pending more than 14
  days. CSV export.
- **Sales scoreboard** (Advanced Sales only): in week 1 the owner records each sales tech's
  baseline from ServiceTitan. The headline numbers are **average ticket and close rate** (the
  two the Sales Manager and Dispatch Pro use), plus items per quote, financed share of big jobs
  (40% benchmark), Care Plan offers and open estimate value. The tech's own **commitment card**
  (today's number, and their target for week 8) is shown next to it. This is entered by hand or uploaded as a CSV from a
  ServiceTitan report, and updated weekly. The owner dashboard shows each tech's trend against
  their baseline, and the week 8 session can show it on the TV. A ServiceTitan API sync can
  come later.
- **Field sign-offs**: assessors (admin, or users flagged `is_assessor`) sign items on
  their phone in under 30 seconds, with an optional note and photo. Apprentices' sign-offs
  must be by their named supervising tech or an admin.

## Requirement 4: The certificate
Rules are in `program.certification` in `trade-paths.json`.
- **Title**: "Proximity Certified Install Technician", "Proximity Certified Service
  Technician" or "Proximity Advanced Sales Certification". Apprentices get
  "Supervised Competency, Install", reissued as full certification once they're licensed.
- **Requires**: Field Foundations, plus Estimating & Selling (Service and Sales only), plus
  every role module complete (lessons, quiz ≥80%, simulation, **all sign-offs**), plus the
  **final assessment ≥80%** (25 scenario questions from their whole program, sat on their
  phone in the week 8 session, with one retake).
- **Issued automatically** the moment the last requirement is met. It appears on the tech's
  profile with a celebration screen. In the week 8 session, the TV can show everyone who
  certified.
- **Design**: A4 landscape, print-ready PDF, with Proximity branding. It shows the name, role,
  date, a unique certificate number, William's signature (an uploaded image) and a **QR code
  to a public verification page** (`/verify/<number>`, which shows name, role, date and
  valid/revoked only).
- If someone isn't finished by week 8, they get a 2-week extension, and the certificate is
  issued when the last sign-off lands.
- The admin can revoke or reissue a certificate.

---

## Writing the lesson content
For each module in `trade-paths.json`:
1. Start from `key_points`. They're the substance, and every one must be taught.
2. Reuse good legacy material listed in `reuses` (from `curriculum.json`). Cut the filler
   (see `KNOWN_ISSUES.md`).
3. Write 150–400 words per lesson in Australian English, addressed to the tech ("you"), with
   an "On the job" example from a Sydney home.
4. Each module also needs its **presentation deck** (see `LIVE_SESSIONS.md`), styled like the
   October 2026 decks in `legacy/sales-sessions-oct-2026/`. Key points
   become slides, so write them to work both read alone and presented on a TV.
5. **Never invent company facts.** `[CONFIRM]` and `[VERIFY]` items stay visibly marked, and
   an admin "Needs answers" view lists them.
6. Quiz: 5 scenario-based questions per module, each with a `why`. The final assessment
   draws from a separate pool, so it isn't the same questions again.
7. Draft one full module per path (with its deck) and get owner approval before writing the rest.

## Phases
The program can't start until phases 1–4 are done and the content is approved, so plan
backwards from the start date.
1. **Foundation**: scaffold, Railway (Node server plus SPA), session auth with invites,
   roster import, progress model, and the core learner screens on phone and desktop.
2. **Content**: all 42 modules, quizzes, 10 simulations, decks and the final-assessment
   pool. Owner reviews a sample first.
3. **Live sessions**: presenter console, TV view, phone follow mode, live quiz and role-play
   voting, attendance and crediting. **Rehearse with 3–4 phones on the real TV before week 1.**
4. **Program and certification**: cohort and schedule, due dates, owner dashboard,
   sign-offs, final assessment, certificate PDF and verification page.
5. **Harden**: fix `KNOWN_ISSUES.md`, PWA/offline, accessibility, RLS audit.

**Later:** push reminders before sessions, ServiceTitan KPIs next to training progress, an
in-app content editor.

## Office roles (for who's-who content, assessors and admin access)
Current office team as of Nov 2026. **Anyone not listed here has left.** Never name former
staff in content.

| Person | Position | In the app |
|---|---|---|
| William | Owner | Admin, trainer, backup assessor for everything, approves certificates |
| Aldwin | Administration | **App admin, replacing John** (confirmed) |
| Charlotte | Operations Manager; **interim Install and Service Manager** (confirmed) | Owns operations, customer happiness and payment collection on installs; accepts handovers; signs off job-related install items; dashboard, weekly digest, monthly 1:1s |
| Carla | Finance Manager | Named in payment escalation (f6) |
| Sadie Sands | Office Manager; can adjust pricing | Admin (suggested) |
| Harriet Burns | Sales Manager; follows up quotes, can approve price changes | Trainer and assessor for Sales and service selling; owns the sales scoreboard |
| Alex Letowski | Commercial Manager (sales and operations) | Reviews commercial proposals (x8); possible Commercial track later |
| Isabella "Bella" Marfé | Business Partnerships Manager (strata) | Reviews strata proposals (x8) |
| Kim Storch | Residential Dispatcher (service and install) | Accepts install handovers (e5, x2) |
| Ruby Douglass | Commercial Dispatcher | Named in who's-who |
| Abigail Rose, Elle Smith | Customer Service | Take over on-site complaints (f4) |
| Chloe Reece | Customer Service; chases debt, makes happy calls | Named in payment and review lessons (f6) |
| *(recruiting)* | **Install Manager** (manages Install **and** Service Techs) | Will own all operations, customer happiness and payment collection, and manage both trades. Charlotte covers this until they're hired |

**Who owns a sold job:** Sales Techs **only sell**. Their job ends with a complete handover
(Sales module x2). The **Install Manager** (Charlotte, interim) owns delivery, customer
happiness and payment collection. **Service Techs captain the planned jobs they sell.**

## Interim field management (requirement)
Nobody manages the Service or Install Techs day to day, so the app has to spread the
management load and make gaps visible. Details are in `program.interim_management` in
`trade-paths.json`.
- **Sign-off routing**: each module has an `assessor` (who signs it off): Charlotte (interim
  Install Manager), a lead installer, a lead service tech, Harriet, Kim, or William as backup.
  When a tech is ready, the request goes to that person's phone. Charlotte signs off
  job-related install items from evidence (job photos and video, end-of-day briefs, happy-call
  feedback), so the tech attaches the ServiceTitan job number and evidence to the request.
  When the permanent Install Manager starts, their account replaces Charlotte's in routing
  with one setting.
- **Lead techs**: add `is_lead_tech` (with trade) to learner settings. Lead techs can sign off
  technical items for their trade.
- **Weekly digest** (email, plus a dashboard card) to William and Charlotte: who's behind,
  missed sessions, sign-off requests waiting more than 7 days, inactive techs, certificates issued.
- **Nudges**: to techs before due dates, and to assessors when a request has waited more than 3 days.
- **Escalation**: if a sign-off request waits more than 7 days, it's offered to William.

## Legacy data and the current team
- Existing users keep their legacy progress and certificates (same `titan_progress` blob).
  The new paths start fresh.
- **Roster**: `data/team-roster.csv` has 25 techs (6 Sales, 7 Service, 12 Install including
  apprentices Carter See and Eric Wright). The emails column is blank; ask the owner. The
  file is private staff data, so keep the repo private.
- **Former staff**: list the existing `users` rows (`app = 'titan'`) that don't match the
  roster and show the list to the owner. Only after confirmation, set `status = 'disabled'`.
  Never delete. Leave office staff accounts alone.

## Acceptance criteria for launch
- All 25 techs receive an invite, set a password, and see their own role path, "This week"
  and due dates. No tech can see another tech's progress.
- On a desktop the full app is usable at 1440 px. On a phone it's usable at 375 px.
- **Live session test**: the presenter on a desktop, the TV view on a second screen, and at
  least 12 phones joined. Slide changes reach the phones in under 1 second. Quiz answers
  appear on the TV live. A phone that drops off and rejoins lands on the current slide.
  Ending the session records attendance and credits lessons and quiz scores correctly.
- The owner can create the 8-week program from a start date, move a session, and see the
  dashboard grid update as techs progress.
- An assessor signs off an item on their phone in under 30 seconds.
- A tech who completes everything and passes the final assessment gets their certificate
  automatically. The PDF prints cleanly on A4 and the QR verification page works.
- Google sign-in and invite links work on the Railway domain.
- Lighthouse mobile: Performance ≥ 90, Accessibility ≥ 95, installable as a PWA.
