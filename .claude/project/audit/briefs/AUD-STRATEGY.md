# TASK BRIEF - AUD-STRATEGY

GOAL: Write ONE new file, `docs/audit/2026-10-15/opencode-strategy-portfolio.md`: a read-only audit of the "strategy-portfolio" area of this repo (a map of
the area plus evidenced defects), using exactly the OUTPUT FORMAT below. Change nothing else.

CONTEXT:
- Area scope: src/lib/strategy/**, src/lib/decision/**, src/lib/portfolio/**, src/lib/rebalancing-decision/**, src/services/strategy/**, src/services/scenario/**, src/services/portfolio/**, src/types/recommendation.ts, src/lib/analysis/strategy/**
- Focus: recommendation/strategy contracts the UI uses (RecommendationEngine.rank, generateAllHorizons, HORIZON_LABELS shape); missing modules (StrategyContextAggregator, rebalancing-decision types.ts, VietnamLotRule); fail-open constraint checks; determinism (no Date.now/Math.random in engines)
- You already run in the repository root. Read code with the read, grep, glob and list tools.
  Bash is limited to single commands such as `git log --oneline -5 -- <path>`, `git show a277613~1:<path>`,
  `git diff -- <path>` and `git status`. Never prefix `cd`, and never use pipes, `;`, `&&`, `2>&1` or
  redirection: those are denied.
- Do NOT run tsc. Its full current output is in `docs/audit/2026-10-15/inputs/tsc-current.txt` (563 errors).
  Other inputs in that folder (read its README.md): the a277613 file list, which deleted files are still
  GONE, and a runtime check of the UI routes.
- History: commit a277613 (2026-10-14) deleted 241 files and rewrote 62 files back to older versions, so
  many callers now use exports, files or shapes that no longer exist. To see a file before the damage:
  `git show a277613~1:<path>`.
- Project goal: a real Vietnam stock trading product (HOSE/HNX/UPCoM). A defect includes: a runtime crash,
  a caller using an export/file/shape that does not exist, financial logic that fails open (NaN, 0 or []
  placeholders, synthetic or default market data shown as real), a missing risk check, wrong numbers.
- docs/, .ai/, phase-status.md and *_CERTIFICATION.md files are old claims, not evidence. Only the code is.

ALLOWED FILES (exact repo-relative paths; the only files you may create or edit):
- docs/audit/2026-10-15/opencode-strategy-portfolio.md

DO NOT TOUCH: every other file, in particular the AGENTS.md section 2 protected paths and every file with
uncommitted user work. This is a read-only audit: do not fix anything you find.

OUTPUT FORMAT. Write the file in small steps so no single write is too long: (1) write the title and the
whole Map section, (2) append the Findings table, (3) add the finding sections one or two at a time,
(4) append "Not checked / unsure". The section 7 STATUS block goes in your reply, never in this file.
```
# strategy-portfolio — OpenCode audit (2026-10-15)
## Map
### Purpose
### Entry points
### Key files
| Path | Role |
### Wiring
(which server routes, UI pages or other modules import this area)
### Tests
### Health
(works / partially broken / broken, with evidence: tsc error count for these paths, missing files)
### Gotchas
## Findings
| # | Severity | Category | Location | Title |
### F1 — <title>
- Severity: critical | high | medium | low
- Location: `path/to/file.ts:LINE`
- Evidence:
  ```ts
  <the exact line(s) copied from that file at that line, unchanged>
  ```
- Why it is a defect: <one or two sentences>
- Minimal fix: <one or two sentences; say if it needs a protected path>
## Not checked / unsure
```
Severity: critical = order/risk path fails open or a security hole on a write route; high = a route,
page or API broken at runtime, or wrong financial numbers; medium = a logic edge case or a type error
that hides a real bug; low = dead code or cosmetics. At most 20 findings, most severe first.
Rating rules (a previous audit got these wrong):
- Before rating, check the wiring: code that no server route, UI page or other live module reaches
  cannot be critical or high; say "unreachable" in the finding.
- A test file that cannot load because it imports a missing module is at most medium.
- "Protected" means exactly the AGENTS.md section 2 list. Do not call any other path protected.
- Go beyond broken imports: look for wrong calculations, fail-open defaults, hard-coded or fabricated
  numbers presented as real, and contracts where the caller and callee disagree. Aim for 10-20 findings.

ACCEPTANCE CRITERIA:
1. `docs/audit/2026-10-15/opencode-strategy-portfolio.md` exists, has every heading of the OUTPUT FORMAT, and no other file changed.
2. Every finding has a Location `path:line` that exists, and its Evidence block is copied verbatim
   from that file within 10 lines of that line. The orchestrator checks this with a script; a quote
   that is not in the file fails the task.
3. Anything you could not confirm by reading the code goes under "Not checked / unsure", not Findings.

VERIFY (the orchestrator runs these; you may run only `npx tsc --noEmit`, and this task does not need it):
- citation checker over `docs/audit/2026-10-15/opencode-strategy-portfolio.md`; spot re-reading of findings by the orchestrator.

BASELINE: tsc 563 errors (unchanged by this task). Known failing tests: not relevant (no code changes).

LIMITS: at most 3 attempts per failure, then STATUS: BLOCKED with the last error output.
No commits, installs, migrations, network or database access. Do not delete or rename files.

REPORT: end with the AGENTS.md section 7 block. Its first line must be
`STATUS: PASS | PARTIAL | BLOCKED | FAILED`. TYPECHECK: write "not run (documentation-only task)".
The report is ordinary text in your LAST message. Do NOT use bash, echo, cat, printf or the write tool
to output it, and never write outside the repo (e.g. /tmp): those calls are blocked, and a blocked or
rejected tool call can end your run before anyone sees the report. Once the file is complete, stop
calling tools and reply with the block.
