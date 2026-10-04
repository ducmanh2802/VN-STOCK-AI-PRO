# CODEGPT — PHASE 28–29 REMEDIATION + SELECTIVE INTEGRATION

## ROLE

You are the Core Quant Integration Agent for:

```text
VN-STOCK-AI-PRO
```

Phase 28 and Phase 29 have completed lane-local certification and a read-only integration audit.

The integration audit found:

```text
PHASE 28:
CERTIFIED lane-local
0 files committed to mainline

PHASE 29:
CERTIFIED lane-local
0 files committed to mainline
```

The audit also found one substantive Phase 29 contract gap:

> `missing expiryDate` currently passes futures valuation in `MultiAssetPositionEngine.ts:64`, despite the Phase 29 contract stating that futures expiry is required and missing expiry must fail closed.

Therefore the next task is:

> **REMEDIATE THE EXPIRY CONTRACT → VERIFY → SELECTIVELY INTEGRATE PHASE 28 + PHASE 29**

Do NOT begin Phase 30 yet.

---

# 1. ABSOLUTE SCOPE

This task owns ONLY:

```text
Phase 28 — Portfolio Intelligence
Phase 29 — Multi-Asset Quant Integration
```

Do NOT touch:

```text
Learning lane
Phase 27 macro work
Phase 24/25 unrelated remediation
frontend/UI
RiskGuard
TradingEngine
RiskManager
PositionSizer
MarketDataIntegrityGuard
TradingDataValidator
FinancialConservation
market-data providers
execution systems
ledger
paper broker
unrelated modified files
unrelated untracked files
```

Do NOT use blanket staging.

NEVER:

```bash
git add -A
git add .
```

Only explicitly stage approved Phase 28/29 paths.

---

# 2. CURRENT REPOSITORY STATE

The previous audit established:

```text
Phase 28:
19/19 lane tests
30/30 combined lane gate
full 1620/1620
tsc PASS
build PASS

Phase 29:
11/11 lane tests
30/30 combined lane gate
full 1620/1620
tsc PASS
build PASS
```

Learning isolation:

```text
PASS
```

Protected systems:

```text
PASS
```

Database/migration:

```text
PASS
```

Phase 28/29 are compute-only.

There are unrelated changes in the working tree.

There are approximately 51 unrelated modified/untracked files.

DO NOT TOUCH THEM.

---

# 3. CRITICAL EXPIRY FINDING

The audit found:

```text
src/lib/multi-asset/MultiAssetPositionEngine.ts:64
```

currently allows futures valuation to proceed when:

```text
expiryDate
```

is missing.

This conflicts with the Phase 29 contract:

```text
Futures:
- multiplier = 100000
- tick = 0.1
- expiry required
- margin required
- unrealized P&L required
- missing required metadata must fail closed
```

The required decision is:

> FIX

Do not choose ACCEPT.

The implementation must enforce the documented contract.

---

# 4. REMEDIATION OBJECTIVE

Modify only the minimum Phase 29 code required to ensure:

```text
missing futures expiryDate
        ↓
explicit validation failure
        ↓
NO valuation
        ↓
NO estimated expiry
        ↓
NO silent fallback
```

The exact error/result model must follow the existing Phase 29 architecture.

Do NOT invent a new error framework if an existing validation/result pattern already exists.

Inspect the code first.

---

# 5. INSPECT BEFORE MODIFYING

Read:

```text
src/lib/multi-asset/**
src/services/multi-asset/**
tests relevant to Phase 29
docs/PHASE_29_ARCHITECTURE.md
docs/PHASE_29_CERTIFICATION.md
```

Identify:

- current futures metadata type
- expiry representation
- validation path
- valuation path
- error/result type
- existing fail-closed conventions
- existing tests for missing multiplier
- existing tests for missing margin
- existing tests for missing unrealized inputs
- existing tests for invalid futures data

Do not make assumptions.

---

# 6. REMEDIATION REQUIREMENTS

Implement the smallest correct fix.

The following must be true:

### Case A — valid futures position

Given:

```text
expiryDate present
multiplier valid
tick valid
margin valid
price valid
required valuation inputs valid
```

valuation continues normally.

### Case B — missing expiry

Given:

```text
expiryDate = null / undefined / absent
```

result must be an explicit failure.

The system must NOT:

```text
infer expiry
estimate expiry
use current date
use contract default
ignore expiry
continue valuation
```

### Case C — invalid expiry

If an invalid expiry representation is already distinguishable by the existing type/validation architecture:

```text
invalid expiry
→ explicit failure
```

Do not silently normalize invalid data.

### Case D — expired contract

Do NOT invent new business semantics unless they already exist.

This remediation is specifically about:

```text
required metadata presence
```

If expired-contract behavior is currently undefined, document it rather than expanding scope.

---

# 7. TEST REQUIREMENT

Add or modify focused Phase 29 tests.

At minimum:

```text
1. valid futures expiry → valuation succeeds

2. missing expiryDate → fail closed

3. invalid expiryDate, if applicable → fail closed

4. existing futures valuation behavior remains unchanged
```

Tests must assert the actual public result/error contract.

Do not test private implementation details unnecessarily.

---

# 8. REGRESSION REQUIREMENT

After remediation run:

```bash
npx vitest run <Phase29 focused tests>
npx vitest run
npx tsc --noEmit
npm run build
```

Expected:

```text
Phase 29 tests: PASS
Full regression: PASS
Typecheck: PASS
Build: PASS
```

Do not weaken tests to obtain PASS.

---

# 9. UPDATE PHASE 29 EVIDENCE

Update documentation ONLY if required to accurately reflect the remediation.

The documentation must explicitly state:

```text
Futures expiry is required.
Missing expiry fails closed.
```

Also correct the minor documentation drift identified by the audit where appropriate:

### DataProvider naming

The certification document referred to a DataProvider filename that does not exactly match the implementation.

Verify the actual implementation.

Document the correct symbol/file location.

### FUTURES_TICK

The audit noted:

```text
FUTURES_TICK = 0.1
```

is currently defined but unused.

Do NOT force artificial usage merely to remove the observation.

If it is intentionally a semantic constant for Phase 29 but not required by the current valuation path, document that honestly.

### Lot 100

The audit noted that lot-100 behavior is currently hint-rounding rather than a complete integer-validation rule.

Do NOT expand scope unless necessary for the existing Phase 29 contract.

Document the current semantics accurately.

---

# 10. DO NOT OVER-REMEDIATE

Do NOT turn this task into a redesign.

Do NOT implement:

```text
new futures engine
new derivatives engine
rollover engine
expiry calendar
contract lifecycle system
margin engine redesign
tick-size engine redesign
broker execution
live futures trading
```

Only fix the documented contract gap.

---

# 11. PHASE 28 VERIFICATION

Do not modify Phase 28 unless the remediation accidentally exposes a genuine Phase 28 regression.

Verify Phase 28 tests remain green.

Do not refactor Phase 28.

---

# 12. LEARNING ISOLATION

There are approximately 11 untracked Learning paths belonging to another lane.

DO NOT:

```text
add
modify
delete
rename
stage
commit
```

any Learning file.

Explicitly inspect `git status` before staging.

If Learning files are present, leave them exactly as found.

---

# 13. UNRELATED WORKTREE ISOLATION

The working tree contains approximately 51 unrelated modified/untracked files.

These may include:

```text
Phase 27 macro migration
MacroRepository
Learning
other remediation
other agents
UI work
other experimental work
```

Do not modify them.

Do not stage them.

Do not delete them.

Do not stash them.

Do not reset them.

---

# 14. PRE-STAGING SAFETY CHECK

Before any commit, run:

```bash
git status --short
git diff --name-only
git ls-files --others --exclude-standard
```

Create an explicit allowlist.

---

# 15. PHASE 28 ALLOWLIST

Only Phase 28 files are eligible for the Phase 28 commit.

Expected paths are approximately:

```text
docs/PHASE_28_DISCOVERY_REPORT.md
docs/PHASE_28_ARCHITECTURE.md
docs/PHASE_28_CERTIFICATION.md

src/lib/portfolio/**
src/services/portfolio/**
tests related to Phase 28
```

IMPORTANT:

Do not blindly use a broad glob if it could capture unrelated files.

Determine the exact actual files from `git status` and `git diff`.

Create an exact path list before staging.

---

# 16. PHASE 29 ALLOWLIST

Only Phase 29 files are eligible for the Phase 29 commit.

Expected paths are approximately:

```text
docs/PHASE_29_ARCHITECTURE.md
docs/PHASE_29_CERTIFICATION.md

src/lib/multi-asset/**
src/services/multi-asset/**
tests related to Phase 29
```

Include the expiry remediation files.

Do not stage unrelated files.

---

# 17. NO MIXED COMMIT

Create separate logical commits:

### Commit A

```text
feat(portfolio): integrate phase 28 portfolio intelligence
```

### Commit B

```text
feat(multi-asset): integrate phase 29 multi-asset quant
```

If repository commit conventions differ, follow the established convention.

Do NOT combine Phase 28 and Phase 29 into one commit unless repository policy explicitly requires it.

Do NOT include:

```text
Learning
Phase 27
UI
other agent work
```

in either commit.

---

# 18. SELECTIVE STAGING

Use explicit paths.

Example pattern:

```bash
git add -- <EXACT_PHASE_28_FILES>
```

then:

```bash
git diff --cached --name-only
git diff --cached --stat
```

Before committing Phase 28 verify:

```text
EVERY STAGED FILE IS PHASE 28
```

Then commit.

For Phase 29 repeat independently.

Never use:

```bash
git add -A
git add .
```

---

# 19. POST-COMMIT VERIFICATION

After Phase 28 commit:

```bash
git show --stat --name-only HEAD
git status --short
```

Verify no unrelated files entered the commit.

After Phase 29 commit:

```bash
git show --stat --name-only HEAD
git status --short
```

Verify no unrelated files entered the commit.

---

# 20. FULL POST-INTEGRATION VERIFICATION

After both commits run:

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

Expected:

```text
Typecheck: PASS
Tests: 1620+ PASS, with the exact current count recorded
Build: PASS
```

If the test count changes because of the new expiry test, report the exact new count.

Do not claim 1620 if the actual count differs.

---

# 21. INTEGRATION EVIDENCE AUDIT

After committing, perform a mini integration audit.

Verify:

```text
Phase 28 files committed
Phase 29 files committed
Learning untouched
Protected systems untouched
Phase 27 untouched
No unrelated files in commits
```

Inspect:

```bash
git show --name-only <PHASE_28_COMMIT>
git show --name-only <PHASE_29_COMMIT>
```

Also inspect:

```bash
git status --short
```

The working tree may remain dirty because unrelated work belongs to other lanes.

That is acceptable.

The requirement is:

> unrelated work must remain unchanged and uncommitted by this task.

---

# 22. CERTIFICATION STATUS

After successful integration, classify:

```text
PHASE 28:
INTEGRATED + VERIFIED

PHASE 29:
INTEGRATED + VERIFIED

EXPIRY CONTRACT:
FIXED + VERIFIED

LEARNING:
UNTOUCHED

PROTECTED SYSTEMS:
UNTOUCHED

UNRELATED WORK:
UNTOUCHED
```

Do NOT claim the entire repository is clean.

Do NOT claim all work is integrated.

Only Phase 28/29 integration is certified.

---

# 23. PHASE 30

Do NOT start Phase 30 in this task.

Do NOT run the Phase 30 Discovery & Architecture Audit yet.

The next step will be a separate explicit instruction.

---

# 24. REQUIRED FINAL REPORT

Return:

```text
================================================================================
PHASE 28–29 REMEDIATION + SELECTIVE INTEGRATION REPORT
================================================================================

Repository:
Branch:
HEAD:

PHASE 29 EXPIRY REMEDIATION
---------------------------
Previous behavior:
Missing expiry behavior:

Fix:
Files changed:

Focused tests:
PASS / FAIL

Phase 29 lane tests:
X/X

FULL REGRESSION
---------------
Tests:
PASS / FAIL
Count:

Typecheck:
PASS / FAIL

Build:
PASS / FAIL

PHASE 28 INTEGRATION
--------------------
Commit:
Files:
PASS / FAIL

PHASE 29 INTEGRATION
--------------------
Commit:
Files:
PASS / FAIL

COMMIT PURITY
-------------
Phase 28 only:
PASS / FAIL

Phase 29 only:
PASS / FAIL

Learning touched:
YES / NO

Protected systems touched:
YES / NO

Phase 27 touched:
YES / NO

Unrelated files committed:
YES / NO

Working tree:
CLEAN / DIRTY-BUT-UNRELATED

CERTIFICATION
-------------
Phase 28:
INTEGRATED + VERIFIED / BLOCKED

Phase 29:
INTEGRATED + VERIFIED / BLOCKED

Expiry contract:
VERIFIED / BLOCKED

Phase 30:
NOT STARTED

NEXT AUTHORIZATION REQUIRED:
PHASE 30 DISCOVERY & ARCHITECTURE AUDIT
```

---

# 25. STOP CONDITION

After completing:

```text
remediation
→ focused tests
→ full regression
→ typecheck
→ build
→ selective Phase 28 commit
→ selective Phase 29 commit
→ post-integration verification
→ final report
```

STOP.

Do not begin another phase.

Do not modify Learning.

Do not touch unrelated work.

Do not clean the repository.

Do not use destructive Git commands.

The next task will explicitly authorize:

> **PHASE 30 DISCOVERY & ARCHITECTURE AUDIT**

---

# FINAL COMMAND

Proceed autonomously through:

```text
INSPECT
→ FIX EXPIRY CONTRACT
→ TEST
→ VERIFY
→ SELECTIVE STAGE
→ COMMIT PHASE 28
→ COMMIT PHASE 29
→ VERIFY INTEGRATION
→ REPORT
→ STOP
```

The guiding principle is:

> **Integrate only what you own. Preserve everything you do not own. Never trade correctness for a clean Git status.**