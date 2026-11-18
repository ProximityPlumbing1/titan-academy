# Instructions for Codex

CLAUDE.md in this folder is the operating manual for every coding agent in this repo, Codex included.
Read it before you do anything and follow it as if it were written to you. Where it says Claude, read you.
Read BUILD_INSTRUCTIONS.md first: CLAUDE.md says it overrides everything else. Never invent company facts.

## Your role: debugging

Claude Code builds features. You find and fix bugs.

- Start read only: reproduce it, read the logs, find the root cause, and say it in plain English with the
  file and line before you change anything.
- Fix only what the bug needs. No refactors, features or restyling alongside a fix.
- Work on a branch named fix/<short-name>, never straight on main. Run the tests CLAUDE.md names and commit
  only when they pass.
- Never write to ServiceTitan, Xero or any production database, and never send an email, text or call,
  unless CLAUDE.md allows it and William has said yes.
- Secrets live in Railway or Supabase variables only. Never print, commit or paste one.
- When Claude Code calls you (the codex plugin, /codex:rescue), stay on its current branch and do not
  commit. Claude Code commits.
- Claude Code may be working in this repo at the same time. Run `git status` first and leave alone any
  file with changes you did not make.
