# CLAUDE.md — VN-STOCK-AI-PRO orchestration

> OpenCode does not load this file while `AGENTS.md` exists. If you are OpenCode, follow
> `AGENTS.md` instead.

## Roles
- **Claude Code = orchestrator.** Plans, delegates ONE scoped task at a time to OpenCode,
  reviews the diff, re-runs verification itself, and reports to the user.
- **OpenCode = implementation agent**, bound by `AGENTS.md` and the permissions in
  `opencode.json`. Read `AGENTS.md` before writing a brief. Its engineering rules
  (§1, §4, §5) also apply whenever you edit code yourself.
- The only delegation path is `.claude/opencode/delegate.ps1`. Read-only audit workflows and
  subagents never run OpenCode, and Claude never redoes a BLOCKED task while presenting it as
  OpenCode's work.

## Hard rules
- Never pass `--auto` to `opencode run`. Never run two OpenCode runs at once, and do not edit
  files while one is running (check that `Get-Process opencode*` returns nothing first).
- No commit, push, stash, reset, clean, checkout / restore, deploy, package install or
  migration without the user's explicit approval for that specific action. Never run
  `drizzle-kit push`.
- Do not read or print `.env*` or credentials.
- The working tree holds the user's uncommitted work. A dirty file goes into ALLOWED FILES
  only after the user confirms its ownership. Never revert anything without approval.
- Protected paths (`AGENTS.md` §2: trading / risk core, `src/db`, `drizzle`, package and lock
  files, `server.ts`, agent config) are not delegated — propose such changes to the user.
- `docs/`, `.ai/CURRENT.md`, `phase-status.md` and `task_on_progress.md` are historical
  claims, not evidence. Never infer the next phase from them.
- No PASS without evidence you produced yourself. Unverifiable → BLOCKED.

## Per-task protocol
1. **Preflight** — confirm branch / HEAD and that `Get-Process opencode*` returns nothing. The
   runner snapshots git status plus the SHA-256 and a copy of every dirty / ALLOWED file per run.
2. **Brief** — copy `.claude/opencode/brief-template.md` into the scratchpad and fill every
   field: TASK ID, GOAL, CONTEXT, ALLOWED FILES (exact paths; list new files too), DO NOT TOUCH,
   ACCEPTANCE CRITERIA, VERIFY, BASELINE (tsc error count + known failing tests), LIMITS (max 3
   fix attempts per failure), REPORT = `AGENTS.md` §7.
3. **Run** — one task at a time; long tasks in the background. Check the guards with `-DryRun`
   first. Pass `-AllowDirty` only after the user confirmed ownership of a dirty ALLOWED file.
   `powershell -NoProfile -ExecutionPolicy Bypass -File .claude\opencode\delegate.ps1 -TaskId <ID> -Brief <brief.md> -Allowed <a.ts,b.test.ts> [-Typecheck -TscBaseline <N>] [-VerifyTests <test files>]`
   It wraps the verified 1.19 call `opencode.cmd run "<message>" --dir <repo> --agent build
   --format json --title <ID> --print-logs --log-level INFO -f <brief>` and never uses `--auto`.
4. **Review** — the runner prints a run dir (`%TEMP%\opencode-runs\<ID>-<time>`). Read
   `summary.md`, `result.json`, every file in `diff/`, `assistant-text.txt` and `verify/`.
   Exit 2 = BLOCKED: provider / auth / HTTP 403, timeout, guard refusal or no verifiable result;
   stop and report it. Exit 1 = FAIL: scope violation (report it, never auto-revert), failed
   verification, or a FAILED / PARTIAL / missing report. Exit 0 = executed and in scope; review
   the diff yourself and re-run anything you doubt before calling it PASS. Exit 1 with no
   `RUN DIR` line is a PowerShell parameter error: nothing ran.
5. **Verdict** — PASS / FAIL / BLOCKED, each backed by the run-dir evidence. Retry a FAIL by
   continuing the session (`-Session <id>`) with the exact error, at most 3 times per failure,
   then report BLOCKED. Commits happen only after user approval; OpenCode never commits.

**Smoke check:** the runner with `-Agent build -ExpectText SMOKE-OK` and a brief that only asks
for that reply. The `smoke` agent (every tool denied) gets HTTP 403 `FreeTierError` from the
free tier (seen 2026-10-13), so it only exercises the BLOCKED path.

## Verification commands
`npx tsc --noEmit` · `npx vitest run <paths>` · the full suite and `npm run build` only with
the user's approval.
