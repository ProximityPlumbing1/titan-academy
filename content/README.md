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
- The status comment controls the badge: anything starting with `sample` shows as "awaiting
  owner approval" to techs and admins. Change it to `approved` once the owner signs off.
- The first `On the job` callout in a module also becomes a discussion slide in live classes.
- Keep `[CONFIRM: …]` and `[VERIFY: …]` markers until the owner answers them. They appear on
  the admin "Needs answers" page.
- Never invent company facts. Use Australian English. Credit external trainers' principles and
  never copy their material. Keep the October sessions' source notes.
