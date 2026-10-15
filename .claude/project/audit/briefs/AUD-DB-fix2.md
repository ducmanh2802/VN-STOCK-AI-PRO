# TASK BRIEF - AUD-DB (fix attempt 2 of 3, same session)

GOAL: Fix F4 in `docs/audit/2026-10-15/opencode-db-persistence.md`, then reply with the section 7 block
as plain text.

CONTEXT:
- The citation checker passes F1, F2, F3 and F5. F4 fails: its Evidence says "`src/db.schema.ts` is currently
  being modified..." but `src/db/business/schema.ts` line 7 reads, verbatim:
  ```
   * `src/db/schema.ts` is currently being modified concurrently by the PLATFORM lane
  ```
  Also the Findings table row for F4 says `src/db/business.schema.ts:7-10`; the file is `src/db/business/schema.ts`.
- Correct the F4 Evidence (copy the line exactly) and the F4 table row. Change nothing else.

ALLOWED FILES:
- docs/audit/2026-10-15/opencode-db-persistence.md

DO NOT TOUCH: every other file.

ACCEPTANCE CRITERIA:
1. The citation checker passes for all 5 findings.
2. Your last message is plain text starting with `STATUS:` (do not output it with a tool).

BASELINE: tsc 563 errors (documentation only). LIMITS: attempt 2 of 3.

REPORT: AGENTS.md section 7 block as plain text in your last message. TYPECHECK: "not run (documentation-only task)".
