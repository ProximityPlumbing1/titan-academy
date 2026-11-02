# Live Sessions: Presenting on the TV, Following on Phones

The owner (or another trainer) runs a weekly session for a group. The training shows on a
big TV, and every tech in the room follows on their own phone: the same slide, answering
quiz questions and voting on role-plays. Afterwards, attendance and progress are recorded
automatically.

## The three screens
| Screen | Device | Route | What it shows |
|---|---|---|---|
| **Presenter console** | Owner's laptop, desktop or phone (phone = one-handed remote) | `/present/:sessionId` | Current and next slide, presenter notes, controls, a live answer count with names, attendance (who's connected), the timer, and End session. |
| **TV view** | The big TV (second screen from the laptop, or the TV's own browser) | `/tv/:code` | Audience view only: big slides, join code and QR, quiz countdown, anonymous results. No controls and no names on quiz results. |
| **Phone (follower)** | Each tech's phone, signed in as themselves | `/live/:code` | The current slide as a phone-readable card, answer buttons on quiz slides, vote buttons on role-plays, and a "Live" indicator. |

- **One laptop + TV**: the console has an "Open TV view" button (`window.open`). The owner
  drags that window onto the TV and presses F11.
- **TV with a browser** (smart TV, Chromecast tab, a cheap mini-PC): open `/tv/:code`.
  The TV view needs no login. The code only grants the read-only audience view.
- **Phone as a remote** (nice to have): the owner can also open the presenter console on
  their own phone, so they can walk around the room.

## Joining
1. On the presenter console, the owner opens today's session (pre-created by the 8-week
   schedule for that group) and clicks **Go live**.
2. The TV shows "Join on your phone" with a short code (e.g. `4827`) and a QR to `/live/4827`.
3. On each tech's phone, the home screen shows a **"Live now: Join"** banner for their
   group's session. One tap joins. Scanning the QR or typing the code also works.
4. The console shows who's connected (tracked by the live-class WebSocket server). The owner can tick
   people in manually if their phone is flat; they're marked attended but do the quiz later.

## Visual reference
Match the October 2026 decks in `legacy/sales-sessions-oct-2026/` (open them in a browser):
16:9, dark navy background, large italic serif headlines, Inter body text, cyan uppercase
eyebrow labels, gold accent lines, big-number stat slides with a source line, 'Say it like
this' quote callouts, and numbered discussion-question slides. Arrow keys move between slides.

## The slide deck (generated from each module)
A session covers one to three modules (see `program.schedule`). The deck is the modules'
slides in order, with a divider between modules:
1. **Module title** and objective
2. **One slide per key point** (`key_points`), with the lesson's photo or video if there is one
3. **"On the job"**: a short scenario from a Sydney home
4. **Quiz**: one question per slide
5. **Role-play** (if the module has a sim): one step per slide
6. **This week's sign-offs**: what the assessor will be checking on the job
7. **Recap**: three takeaways and what's due this week
7b. **Discuss**: 3–5 discussion questions (the October decks have a 'DISCUSS' slide after each
    chapter). Phones show the questions, and the presenter can open a quick poll on any of them.
8. **Deal review** (Advanced Sales workshops): a timed discussion slide. Each tech presents one
   won and one lost quote from that week, with the owner sharing ServiceTitan on the laptop.
   Phones can vote on 'what would you change?' options the presenter types in live.

Presenter notes per slide come from the lesson text. The presenter can hide or skip slides.
Slides are data (JSON or Markdown in `content/`), not images, so the TV and the phone render
the same slide differently: the TV in large type, the phone as a readable card.

## Quiz slides
- **Open**: the TV shows the question, options A–D and a 30-second countdown (adjustable,
  or untimed). The phone shows big A–D buttons. A tech can change their answer until it closes.
- **Live count**: the TV shows "9 of 12 answered", with no names. The console shows who hasn't answered.
- **Reveal**: the TV shows a bar chart of answers, the correct answer highlighted, and the
  `why`. Each phone shows "You were right / The answer was B" and the `why`.
- Answers are stored per tech. At the end, each tech's live score for each module counts as
  their quiz attempt (≥80% passes; otherwise they retake it on their phone later).

## Role-play slides
- The TV shows the persona and what they say. Phones vote on the response options.
- Reveal: the vote split, the strongest response and the feedback (`fb`).
- This is a good moment for the owner to get two techs to act it out.
- Each tech's own votes count as their simulation attempt (≥80% of steps chosen well passes).

## Role-play rounds (Advanced Sales)
In the Sales workshops, role-play is the main event (about 40 minutes). The presenter can
run the same sim several times with a different tech acting it out each round, while
everyone else votes on their phone. In week 8 the **live role-play round** is part of Sales
certification: the owner marks each tech pass or not-yet on the presenter console.

## Final assessment (week 8): exam mode
- The TV only shows the join code, then "Assessment in progress: 18 of 25 finished".
  Questions are **not** shown on the TV.
- Each tech gets 25 questions drawn from their own role's pool, in random order, at their own
  pace, with a time limit (e.g. 40 minutes). One retake is allowed later.
- When a tech passes and everything else is complete, their certificate is issued
  immediately. The owner can then show the "Certified" screen on the TV, listing everyone
  certified so far.

## Ending the session
**End session** runs one server-side function that:
- records attendance (Presence joins plus manual ticks)
- marks the covered modules' lessons as done for each attendee
- saves each attendee's live quiz and role-play results as attempts
- shows the owner a summary: attended, average score, who needs a retake, and absentees.

Absentees aren't credited. They do those modules self-paced, and the dashboard flags them.

## How the sync works
- **WebSockets on the Titan Academy Node server** (the `ws` library or Socket.IO), one room per
  class. Run 1 replica: if it ever scales out, add Postgres LISTEN/NOTIFY or Redis to fan out.
  - The presenter sends `{slide, phase: "show" | "question_open" | "question_closed" | "reveal"}`.
    The server checks that the sender is the presenter, saves it to the class row in Postgres,
    and broadcasts it to the room.
  - **Presence**: the server tracks connected sockets per class for the presenter's "who's
    joined" list and records attendance.
- **Late joiners and reconnects** read the saved state and land on the current slide. If the
  socket drops, the phone polls `GET /api/live/:code/state` every 5 seconds until it reconnects.
- **Answers** go to `POST /api/live/:id/answer` (or a socket message). The server accepts them
  only from techs who joined and only while that question is open. Live answer counts are
  pushed to the presenter and TV, with no names on the TV.
- **The TV view** joins by code with no login and receives slide state and anonymous counts only.
- **Expected scale:** up to about 30 phones per class. Room Wi-Fi or 4G is enough. Phones are
  sent slide data, not video, and media is pre-cached when a phone joins.

## Data
Postgres tables (adapt the designs in `SUPABASE.md`, with `auth.users` becoming the app's own
`users` table): programs, classes (live sessions), attendance, answers.

## Test before week 1
- An automated Playwright test with a presenter, a TV view and 12 simulated phones.
- **A real rehearsal**: the actual TV, the owner's laptop and 3–4 real phones, run through a
  whole module start to finish.
