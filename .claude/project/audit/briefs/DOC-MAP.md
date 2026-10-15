# TASK BRIEF - DOC-MAP

GOAL: Write ONE new file, `docs/audit/2026-10-15/PROJECT_MAP_DRAFT.md`: an onboarding map of this repo that
lets a new engineer or AI agent orient in 5 minutes. Build it ONLY from the input documents listed below.
Change nothing else.

CONTEXT:
- You already run in the repository root. Read the inputs with the read tool. Do not run bash.
- Inputs (read all of them first):
  1. `.claude/project/audit/2026-10-15-claude-areas.json` — field `map` of each of 4 areas
     (frontend-shell, frontend-pages, server-api, market-data): purpose, entry_points, key_files, data_flow,
     wiring, tests, health, gotchas. It is large: read it in parts (offset/limit).
  2. `docs/audit/2026-10-15/opencode-trading-risk-core.md`
  3. `docs/audit/2026-10-15/opencode-strategy-portfolio.md`
  4. `docs/audit/2026-10-15/opencode-repo-health.md`
  5. `docs/audit/2026-10-15/opencode-db-persistence.md`
  6. `docs/audit/2026-10-15/opencode-analysis.md`
  7. `docs/audit/2026-10-15/opencode-fundamentals-assets.md`
  8. `docs/audit/2026-10-15/opencode-macro-learning-business.md`
  9. `package.json` (only the "scripts" block) and `AGENTS.md` section 2 (protected paths).
- Use only facts that appear in these inputs. Do not invent files, routes or numbers. When two inputs disagree,
  say so instead of choosing. Do NOT copy bug lists: the map describes structure; defects live in STATUS.md.

OUTPUT FORMAT (write in small steps: one section per write/edit):
```
# VN-STOCK-AI-PRO — Project map (draft, 2026-10-15, HEAD 55d3ff8)
## What this is
(3-5 lines: product goal, stack, how it runs: `tsx server.ts` with Vite middleware in dev, `dist/server.cjs` in prod)
## Commands
| Command | What it does | Safe for agents? |
## Architecture at a glance
(ASCII diagram: UI pages/components -> hooks/store -> /api routes in server.ts -> services -> lib engines -> DB / market providers)
## Subsystems
### <area name>  (one per area, 11 areas)
- Purpose:
- Entry points:
- Key files: | Path | Role |
- Wiring:
- Tests:
- Health (as of 2026-10-15):
- Source: <which input document(s)>
## Cross-cutting gotchas
(commit a277613 deleted 241 files and reverted 62; protected paths; anything repeated across areas)
```

ALLOWED FILES:
- docs/audit/2026-10-15/PROJECT_MAP_DRAFT.md

DO NOT TOUCH: every other file.

ACCEPTANCE CRITERIA:
1. The file has every heading of the OUTPUT FORMAT and one `###` subsection for each of the 11 areas.
2. Every key-file path in the file exists in the repo or is explicitly marked GONE (the orchestrator checks this).
3. No defect lists; each subsection names its source document(s).

VERIFY: the orchestrator checks the paths and reads the draft.

BASELINE: tsc 563 errors (documentation only).

LIMITS: at most 3 attempts per failure. No commits, installs, network or database access.

REPORT: end with the AGENTS.md section 7 block as ordinary text in your LAST message, first line
`STATUS: PASS | PARTIAL | BLOCKED | FAILED`. TYPECHECK: "not run (documentation-only task)". Do not use bash,
echo, cat or the write tool to output the report, and never write outside the repo. Once the file is complete,
stop calling tools and reply with the block.
