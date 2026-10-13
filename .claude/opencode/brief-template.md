# TASK BRIEF - <TASK-ID>

GOAL: <one bounded, observable outcome>

CONTEXT:
- <facts the agent needs: files, functions, root cause with file:line evidence>

ALLOWED FILES (exact repo-relative paths; the only files you may create or edit):
- <path>

DO NOT TOUCH: every other file, in particular the AGENTS.md section 2 protected paths and every
file with uncommitted user work.

ACCEPTANCE CRITERIA:
1. <criterion the orchestrator can check from the diff or a command>

VERIFY (the orchestrator runs these; you may run only `npx tsc --noEmit`):
- npx tsc --noEmit -> no new errors versus BASELINE
- npx vitest run <test files> -> <expected result>

BASELINE: tsc <N> errors. Known failing tests: <list, or none>.

LIMITS: at most 3 fix attempts per failure, then STATUS: BLOCKED with the last error output.
No commits, installs, migrations, network or database access. Do not delete or rename files.

REPORT: end with the AGENTS.md section 7 block. Its first line must be
`STATUS: PASS | PARTIAL | BLOCKED | FAILED`.
