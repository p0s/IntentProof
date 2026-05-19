# AGENTS.md

## Direction
- Before planning or editing, read `SPEC.md`; it is canonical.
- Read `STATUS.md` before backlog work. Update it when backlog changes.
- Do not contradict `SPEC.md` unless the task changes product direction; update `SPEC.md` first.
- Use hard cutover for product changes. Remove replaced paths instead of leaving stale parallel UI.
- State verifiable success criteria before writing code.
- Make surgical diffs. Every changed line must trace to the request.
- Prefer deleting code over adding code when that fully solves the problem.

## Verification
- Prefer running code over guessing. Read full errors/logs/stack traces before editing.
- Run relevant build/test/fix loops before commits.
- When practical run lint, typecheck, tests, build, and audit; otherwise run the narrowest relevant check and explain why.
- Prefer tests, scripts, screenshots, and type checks over reasoning from diffs.
- For UI changes, verify visually with before/after screenshots when practical.
- After two failed corrections on the same issue, stop and summarize what was learned before continuing.

## Git and privacy
- Keep commits focused and descriptive; subject under 72 characters, body explains why when useful.
- Do not add `Co-Authored-By` unless explicitly requested.
- Never commit `.env`, private keys, tokens, mnemonics, generated wallets, local DBs, keystores, logs containing secrets, local paths, personal author names, or sensitive screenshots.
- Never expose server secrets through browser/Vite public variables.
- Hosted write APIs must be server-only, admin-token protected, allowlisted, idempotent where possible, and testnet-only.

## Tools
- Prefer `gh`, `rg`, `fd`, `jq`, `git`, `curl`, and project CLIs over MCPs when possible.
- Use subagents/worktrees for broad exploration that would otherwise flood the main context.

## Project learnings
- Keep this file short. Add concrete rules only when a real mistake shows they are needed.
- Prune rules that no longer prevent real mistakes.
