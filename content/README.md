# Content

- `quizzes.json`: 5 quiz questions for every module, plus role-play simulations for some.
  Draft until the owner reviews them.
- `lessons/<moduleId>.md`: the written lessons a tech reads on their phone, one file per module.

## Writing a lesson file

```markdown
<!-- status: sample (awaiting owner approval) -->

## <lesson title, exactly as in data/trade-paths.json, in the same order>

Plain paragraphs. **Bold** for the one thing to remember.

- Bullet points
1. Numbered steps

> **On the job:** A short Sydney scenario in the second person.

> **Say it like this:** "A line the tech can use word for word."
```

- One `## ` heading per lesson. The unit test fails if a title doesn't match the curriculum,
  if a lesson is empty, or if a field tech's name appears.
- The status comment controls the badges. `approved`: owner-approved (green in admin). `draft`:
  written in the approved style but not yet read line by line by the owner (amber in admin;
  techs see it normally). Anything starting with `sample` also shows techs an "awaiting owner
  approval" note. The owner approved the five samples (f1, e1, i2, s2, x3) on 2 Nov 2026.
- The first `On the job` callout in a module also becomes a discussion slide in live classes.
- Keep `[CONFIRM: …]` and `[VERIFY: …]` markers until the owner answers them. They appear on
  the admin "Needs answers" page.
- Never invent company facts. Use Australian English. Credit external trainers' principles and
  never copy their material. Keep the October sessions' source notes.
