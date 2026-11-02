# How the current app works (legacy/index.html)

This document was written by reading the legacy source. Line numbers refer to
`legacy/index.html`.

## Structure
- A single HTML file. Its CSS covers lines 18–434. A login gate plus an empty
  `<div id="app">` follows. One `<script>` covers lines 475–3455. Supabase JS v2 loads
  from the jsDelivr CDN.
- The app is a **string-rendered SPA**. `render()` sets `#app.innerHTML` from
  `SCREENS[state.view]()`. Navigation uses a `navStack` array (`go`, `goBack`, `navTo`).
  Event handlers are inline `onclick` attributes.
- The layout is a mobile "phone" column, max-width 460px. The default theme is dark, with a
  light theme toggle saved to `localStorage.titan_theme`.

## Content model (see `data/curriculum.json`)
```
Path   { id, name, who, days, color, summary, modules[] }
Module { id, title, objective, est (minutes), lessons[], quiz{questions[]}, sim? }
Lesson { id, title, type: "article" | "screen", est, body (HTML string), audio (unused) }
Question { q, opts[], correct (index), why }
Sim    { kind:"ai", persona, role, intro, steps[ { them, choices[ { t, good, fb } ] } ] }
Reference { id, title, cat, roles[], icon, updated, body (HTML) }
Badge  { id, name, desc, emoji }
```

| Path id | Display name | Modules | Lessons | Quiz Qs | Sims |
|---|---|---|---|---|---|
| owner | Owner | 10 | 100 | 50 | 0 |
| manager | Managers | 10 | 100 | 50 | 0 |
| accounts | Accounts | 10 | 100 | 50 | 0 |
| marketing | Marketing | 10 | 100 | 50 | 0 |
| sales | Service Tech | 10 | 100 | 40 | 1 |
| tech | Install Tech | 10 | 100 | 41 | 1 |
| support | Support VA | 10 | 100 | 50 | 0 |
| scr | SCR / DSR | 10 | 100 | 50 | 0 |
| stacct | Accounting (advanced) | 11 | 66 | 55 | 0 |
| streports | Reports (advanced) | 8 | 48 | 40 | 0 |
| stpricebook | Price Book (advanced) | 8 | 48 | 40 | 0 |

Note that path id `sales` displays as "Service Tech". Keep the ids, because progress keys
depend on them.

The HTML in lesson bodies uses a `SS` constant for a screenshot placeholder, plus `<h3>`,
`<p>`, `<ul>`, `<b>` and some custom classes. Render it safely: the content is trusted
internally, but sanitise it anyway.

## Screens
`home, mypath, path, module, lesson, quiz, quizresult, sim, simresult, reference,
refarticle, profile, admin, users`, plus a printable certificate window (`printCert`).
A hamburger menu opens an overlay with links to Home, My Path, Reference and Profile. Admins
also see Users, Admin, and shortcuts to the three advanced paths.

- **Home:** greeting, overall progress ring with animated count-up stats, path tiles.
  Locked paths show "🔒 Locked — not part of your role".
- **Path:** list of modules with progress rings. Locked modules show "Finish module N to
  unlock".
- **Module:** objective, lesson list, quiz button, simulation button if the module has one.
- **Lesson:** body plus a Complete button that moves to the next lesson or back to the
  module. There is a read mode (`lessonMode`).
- **Quiz:** one question at a time. The result screen shows a score ring, pass/fail, and
  explanations (`why`).
- **Simulation:** a persona says something, the learner picks a response, and feedback
  (`fb`) follows. 80% of the "good" picks are needed to pass.
- **Reference:** searchable, filterable by category, and filtered by role.
- **Profile:** XP, level, streak, badges, certificates, theme toggle, reset progress.
- **Users (admin):** lists `users` rows where `app = "titan"`, sorted pending → approved
  → disabled. Shows each user's progress stats (computed from their `titan_progress`) and
  time spent. Admins can approve a user with access checkboxes, edit access, or
  disable/enable them. CSV export is available.
- **Admin:** an older demo roster screen with hard-coded seats. It is probably obsolete;
  the Users screen replaces it.

## Progression rules (keep these exactly)
- **Progress keys**, stored in `data.progress`:
  - lesson done: `"{pathId}.{moduleId}.{lessonId}": 1`
  - module completion flag: `"mod.{pathId}.{moduleId}": 1`
- **Quizzes:** `data.quizzes["{pathId}.{moduleId}"] = { score: best, passed: everPassed }`.
  The pass mark is **80%**.
- **Simulations:** `data.sims["{pathId}.{moduleId}"] = score`. The pass mark is **80%**.
- **Module complete:** all lessons done, quiz passed, and the simulation passed if the
  module has one.
- **Module unlock:** module 0 is always open. Module N needs module N−1 complete. Admins
  bypass all locks.
- **Path certified:** every module is complete. Then `data.certs[pathId] = "YYYY-MM-DD"`.
- **XP:** lesson +20, quiz pass +50, simulation pass +80, module +60, certification +200.
  Level = `floor(xp / 300) + 1`.
- **Streak:** a consecutive-day counter using `lastDay`, compared as a UTC date string.
- **Badges:** first_lesson, first_quiz, perfect_quiz (100%), first_sim, first_module,
  streak3, first_cert, explorer (5 reference articles opened), all_certs.
- **Progress %:** each lesson, quiz and simulation counts as one unit.

Full progress state shape (`titan_progress.progress` and `localStorage.titan_academy_v1`):
```json
{ "progress": {}, "quizzes": {}, "sims": {}, "xp": 0, "badges": [], "refOpened": [],
  "lastDay": null, "streak": 0, "certs": {} }
```

## Auth and access flow
1. **Sign in:** `supabase.auth.signInWithPassword` or Google OAuth (`hd=proximityplumbing.com.au`,
   `redirectTo = location.origin`).
2. **Sign up:** `auth.signUp`, with `full_name` and `requested_role` in user metadata. If a
   session comes back, call RPC `titan_register(p_name, p_requested_role)` and sign out.
   The user sees "an admin will approve you".
3. **After auth:** call RPC `is_titan_admin()`.
   - If it returns true, the user gets `ACCOUNT = { access: "all", admin: true }`.
   - Otherwise, select from `users` where `app = 'titan'` and `email` matches:
     - no row → call `titan_register` with the metadata, then show "awaiting approval"
     - `status = 'pending'` → show "awaiting approval"
     - `status = 'disabled'` → show "disabled"
     - otherwise, access = `titan_access` (array of path ids). If `role = 'admin'`, access is all.
4. Load `titan_progress` for the user. If a cloud copy exists, it overwrites local.
5. **Heartbeat:** `titan_heartbeat(p_seconds:0)` on entry, then `p_seconds:60` every 60 s
   while the tab is visible.
6. **Saving:** every change writes localStorage, then upserts the whole blob to
   `titan_progress` (debounced 1.5 s, `onConflict: user_id`).

**Signup roles and the default path access the admin approval screen pre-ticks**
(`defaultAccessFor`):

| Signup role | Default paths |
|---|---|
| owner, managers | all 8 core paths |
| accounts | accounts |
| scrdsr, supportoffice | scr, support |
| installtech, servicetech | tech, sales |
| marketingpro | scr, marketing |

The advanced paths (`stacct`, `streports`, `stpricebook`) are listed in `ADVANCED_PATHS`,
and `openPath` lets anyone open them regardless of access. They are only linked from the
admin menu.

## PWA layer
The app links `/manifest.json`, `/icon-180.png` and registers `/sw.js` (update check
hourly, reload on controller change). It captures `beforeinstallprompt`. These files
weren't part of the upload.
