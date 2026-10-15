# TASK BRIEF - AUD-DB (fix attempt 1 of 3, same session)

GOAL: Write the actual audit into `docs/audit/2026-10-15/opencode-db-persistence.md`, following the
OUTPUT FORMAT of the original AUD-DB brief, then reply with the AGENTS.md section 7 block as plain text.

CONTEXT (the orchestrator's review of your previous run):
- Your file contains ONLY the 4-line STATUS block (230 bytes). It has none of the required headings
  (## Map, ### Purpose, ### Entry points, ### Key files, ### Wiring, ### Tests, ### Health, ### Gotchas,
  ## Findings, ## Not checked / unsure) and no findings. Reporting PASS for that was false.
- The STATUS block belongs in your reply, NOT in the file. Remove it from the file.
- Write the file in several small steps so no single write is too long:
  1. write the file with the `# db-persistence — OpenCode audit (2026-10-15)` title and the whole `## Map` section;
  2. append `## Findings` with its table;
  3. add the finding sections one or two at a time with the edit tool;
  4. append `## Not checked / unsure`.
- Area scope and focus are unchanged: src/db/**, src/lib/db/**, drizzle/**, drizzle.config.ts, scripts/**
  (read only); schema vs. migration consistency, repositories and who uses them, PGlite tests, the
  migration runner, anything that writes to a database at import time, missing modules.
- Evidence must be copied verbatim from the file at the cited line (a checker verifies it). At most 15 findings.

ALLOWED FILES:
- docs/audit/2026-10-15/opencode-db-persistence.md

DO NOT TOUCH: every other file.

ACCEPTANCE CRITERIA:
1. The file has every required heading and no STATUS block inside it.
2. The citation checker passes for every finding.
3. Your last message is plain text starting with `STATUS:` (do not output it with a tool).

VERIFY: the orchestrator runs the citation checker.

BASELINE: tsc 563 errors (documentation only).

LIMITS: attempt 1 of 3.

REPORT: AGENTS.md section 7 block as plain text in your last message. TYPECHECK: "not run (documentation-only task)".
