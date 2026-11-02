# Known issues in the legacy app

## Logic bugs
1. **XP farming on quizzes.** `quizResultScreen()` awards +50 XP every time it renders a
   pass. It does not check whether the quiz was already passed, so retaking a passed quiz
   awards XP again. Render functions also cause side effects (XP, badges, saving). Move all
   of that into explicit actions.
2. **The streak uses UTC dates.** `toISOString().slice(0,10)` means the day rolls over at
   11am in Sydney during daylight saving (10am otherwise). Use the `Australia/Sydney` date.
3. **Local and cloud progress conflict.** On sign-in, the cloud blob overwrites local
   progress. Progress made offline, or on a second device before the debounce fired, is
   lost. Use per-event writes, or at least merge (union keys, max scores, max XP).
4. **Progress is shared between users on one device.** localStorage key
   `titan_academy_v1` isn't per-user. If user B signs in on a shared tablet where B has no
   cloud row, B inherits A's local progress, which is then upserted to B's account. This
   matters for shared office iPads.
5. **The quiz result is computed in render**, using `quizAnswers` held in memory. A refresh
   mid-quiz loses the attempt. That's fine, but make the behaviour deliberate.
6. **Anyone can open the advanced paths.** `ADVANCED_PATHS` skips the access check. Decide
   whether that's intended. They are only linked from the admin menu.
7. **The `all_certs` badge needs every path, including the advanced ones**, which no
   non-admin can be assigned through the normal role defaults.
8. **The "Admin" screen is a hard-coded demo roster.** Remove it or replace it with the
   real dashboard.
9. **The reset-progress button only clears local data**, and the next save overwrites the
   cloud copy, so it effectively wipes cloud progress too. It should say so, or be
   admin-only.

## Security
- Quiz answers (`correct`) and the whole curriculum ship to every client, including paths
  the user can't access. Gate content server-side if that matters.
- The client upserts its own XP and certificates, so a learner can forge a certificate.
  Consider server-side validation if certificates carry weight (for example, linked to pay
  progression).
- The Supabase JS script loads from `cdn.jsdelivr.net/npm/@supabase/supabase-js@2` with no
  pinned version or SRI. Bundle it instead.
- Lesson HTML is injected with `innerHTML`. Sanitise it, especially if in-app editing
  arrives.

## UX and technical
- `user-scalable=no` in the viewport blocks pinch-zoom. That's an accessibility failure, so
  remove it.
- Inline `onclick` handlers everywhere. Full re-render on every keystroke in reference
  search (it hacks focus back afterwards).
- The 1.3 MB first load includes all content. Lazy-load per path.
- There's no deep linking: the URL never changes, so the back button and refresh lose your
  place. Use real routes such as `/path/:pathId/module/:moduleId/lesson/:n`.
- The lesson `audio` field exists but is unused everywhere.

## Content
- 962 lessons, median about 180 words. Many are **template-generated filler**. Roughly 20
  lessons each open with stock phrases like "The one idea to carry out of this lesson…",
  "This is what good looks like.", "The mistakes that cost time and…" and "Before the how,
  the why…". They restate the title without teaching anything specific.
- "the company" appears 169 times in the source (286 in `curriculum.json`, because the
  shared screenshot placeholder is copied into each lesson). It looks like "Proximity" was
  find-and-replaced out (for example "captured from the live the company tenant").
  Fix the wording.
- 399 lessons are `type: "screen"` but only show a placeholder box, with no real screenshots.
- The SCR/DSR, Accounting, Price Book and Install Tech paths contain the most
  Proximity-specific, useful content (50% GP pricebook rule, Good/Better/Best, 7am
  readiness, commission protection). Use these as the quality bar.
- Use `data/content-summary.csv` to review the outline with the business owner before
  rewriting content.
