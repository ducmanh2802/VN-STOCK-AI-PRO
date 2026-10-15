# Audit inputs (2026-10-15, HEAD 55d3ff8 + uncommitted working tree)
Produced by Claude with real commands; OpenCode audit tasks read these instead of re-running them.
- tsc-current.txt — full output of `npx tsc --noEmit` (563 errors).
- a277613-changes.txt — `git show a277613 --name-status` (A/D/M per file). a277613 deleted 241 files and reverted 62.
- a277613-deleted-status.txt — every file a277613 deleted: GONE = still missing on disk, BACK = present again.
- route-qa.md — runtime check of every UI route on a production build.
