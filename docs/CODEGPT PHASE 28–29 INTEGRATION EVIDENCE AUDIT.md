# CODEGPT — PHASE 28–29 INTEGRATION EVIDENCE AUDIT

## ROLE

You are the Core Quant Integration Agent for `VN-STOCK-AI-PRO`.

Phase 28 — Portfolio Intelligence is reported CERTIFIED lane-local.

Phase 29 — Multi-Asset Quant Integration is reported CERTIFIED lane-local.

Do NOT begin Phase 30.

Your immediate objective is:

> **PHASE 28–29 INTEGRATION EVIDENCE AUDIT**

This is a READ-ONLY audit.

Do not modify source code, schema, migrations, configuration, Learning files, protected systems, or frontend files.

---

# 1. CURRENT REPORTED STATE

Reported:

### Phase 28

STATUS: CERTIFIED — lane-local

New areas:

- `src/lib/portfolio/**`
- `src/services/portfolio/**`
- portfolio tests
- Phase 28 discovery/architecture/certification documents

Capabilities reported:

- portfolio weights
- sector exposure
- asset-class exposure
- concentration
- position limit
- sector limit
- top-N concentration
- HHI
- covariance
- correlation
- annualized volatility
- beta
- tracking
- factor aggregation
- allocation
- equal-weight
- inverse-volatility
- minimum-variance ridge
- BL-lite
- benchmark
- scenario
- diagnostics

Requirements:

- pure deterministic engines
- `asOfDate`
- fail-closed
- no fabricated data
- no silent imputation

### Phase 29

STATUS: CERTIFIED — lane-local

New areas:

- `src/lib/multi-asset/**`
- `src/services/multi-asset/**`
- multi-asset tests
- Phase 29 architecture/certification documents

Required asset semantics:

- equity/ETF lot = 100
- futures multiplier = 100,000
- futures tick = 0.1
- futures expiry required
- margin required
- unrealized P&L required
- cash face value semantics
- NAV must not mutate price
- strategy HOLD/FLAT must never be overridden

Reported verification:

- lane tests: 30/30
- full regression: 1620/1620
- typecheck: PASS
- build: PASS
- migrations: none
- Learning files untouched
- protected/shared files untouched

Reported Git state:

- commit `ddf5560`
- additional Phase 28/29 files remain uncommitted

---

# 2. CRITICAL RULE

The previous certification is considered:

> LANE-LOCAL CERTIFICATION

It is NOT yet considered:

> INTEGRATED MAINLINE CERTIFICATION

until Git boundaries and repository state are independently verified.

Do not assume the previous report is correct.

Inspect the actual repository.

---

# 3. READ-ONLY AUDIT

Perform a complete evidence audit.

Do not modify files.

Do not commit.

Do not stash.

Do not reset.

Do not checkout.

Do not cherry-pick.

Do not merge.

Do not clean the working tree.

Forbidden:

```text
git reset --hard
git clean -fd
git clean -fdx
git restore .
git checkout -- .
git push --force
```

---

# 4. GIT STATE AUDIT

Inspect:

```bash
git status --short
git branch --show-current
git log --oneline --decorate -20
git diff --stat
git diff --name-only
git diff --cached --stat
git diff --cached --name-only
```

Determine:

### A. What exactly is contained in commit `ddf5560`?

### B. Which Phase 28 files are committed?

### C. Which Phase 29 files are committed?

### D. Which Phase 28/29 files remain uncommitted?

### E. Are there unrelated files in the working tree?

### F. Are any Learning files modified?

### G. Are any protected/shared files modified?

### H. Are any frontend/UI files unintentionally included?

### I. Are any schema/migration/config/package files unexpectedly modified?

Produce an explicit ownership matrix.

---

# 5. COMMIT BOUNDARY AUDIT

Inspect the actual commit:

```bash
git show --stat ddf5560
git show --name-only ddf5560
```

Classify every changed file as:

```text
PHASE_28
PHASE_29
LEARNING
PROTECTED
SHARED
UI
UNRELATED
UNKNOWN
```

No assumptions.

If `ddf5560` contains unrelated work, report it.

If Phase 28/29 files are missing from the commit, report them.

---

# 6. SOURCE OWNERSHIP AUDIT

Inspect:

```text
src/lib/portfolio/**
src/services/portfolio/**
src/lib/multi-asset/**
src/services/multi-asset/**
```

Confirm the implementation matches the reported certification.

Verify:

- pure engines remain pure
- deterministic calculations
- explicit `asOfDate`
- no hidden current-time dependency
- no fabricated market data
- no synthetic fallback
- no silent imputation
- fail-closed behavior
- service orchestration does not bypass domain validation

---

# 7. MULTI-ASSET SEMANTICS AUDIT

Verify actual code for:

### Equity

```text
lot = 100
```

### ETF

```text
lot = 100
```

### Futures

```text
multiplier = 100000
tick = 0.1
expiry required
margin required
unrealized P&L required
```

Verify that missing futures information causes a deterministic failure rather than estimation.

Verify:

```text
cash face value
```

is not incorrectly treated as a market price.

Verify:

```text
NAV calculation
```

does not mutate or reinterpret underlying price.

Verify strategy semantics:

```text
HOLD
FLAT
```

are never silently converted into BUY/SELL or another position state.

---

# 8. PORTFOLIO INTELLIGENCE AUDIT

Verify actual implementation of:

- portfolio weights
- sector exposure
- asset-class exposure
- concentration
- position limit
- sector limit
- top-N concentration
- HHI
- covariance
- correlation
- volatility
- beta
- tracking
- factor aggregation
- allocation
- benchmark
- scenario
- diagnostics

Verify missing data behavior.

Particularly confirm:

```text
NO IMPUTATION
NO FABRICATION
NO SILENT FALLBACK
```

Verify factor coverage is explicit.

Verify covariance/correlation behavior for insufficient history.

Verify allocation methods fail safely when inputs are insufficient.

---

# 9. PROTECTED SYSTEM AUDIT

Confirm no modifications or bypasses to:

```text
RiskGuard
TradingEngine
RiskManager
PositionSizer
MarketDataIntegrityGuard
TradingDataValidator
FinancialConservation
market data providers
core execution systems
paper trading ledger
```

If any are changed, classify the situation as:

> INTEGRATION BLOCKER

Do not fix it during this audit.

---

# 10. LEARNING ISOLATION AUDIT

Confirm no changes to:

```text
src/lib/learning/**
src/services/learning/**
src/lib/db/LearningRepository.ts
tests/learning/**
docs/learning/**
LEARNING_PLATFORM_*
```

The Learning lane is owned by OpenCode.

Do not modify or commit any Learning work.

If Learning files are dirty, report them separately and do not touch them.

---

# 11. DATABASE / MIGRATION AUDIT

Determine whether Phase 28/29 genuinely require no migration.

Inspect:

- schema
- migration directory
- repository layer
- database references

Confirm that no hidden persistence dependency exists.

If no migration is required, explicitly document why.

---

# 12. TEST EVIDENCE

Re-run verification after the read-only inspection:

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

Do not alter code to make tests pass.

Record exact:

```text
Typecheck result
Test count
Test failures
Build result
```

If the test count differs from the reported 1620, explain why.

---

# 13. DOCUMENTATION EVIDENCE

Inspect:

```text
docs/PHASE_28_DISCOVERY_REPORT.md
docs/PHASE_28_ARCHITECTURE.md
docs/PHASE_28_CERTIFICATION.md

docs/PHASE_29_ARCHITECTURE.md
docs/PHASE_29_CERTIFICATION.md
```

Cross-check documentation against actual implementation.

Do not trust documentation blindly.

Identify:

```text
DOCUMENTED
IMPLEMENTED
TESTED
CERTIFIED
```

for each major capability.

---

# 14. CERTIFICATION CLASSIFICATION

At the end classify the current state into exactly one:

### A. INTEGRATION READY

All Phase 28/29 files are correctly owned and the only remaining action is an explicit commit/integration step.

### B. INTEGRATION BLOCKED

There is an ownership conflict, protected-file modification, Learning conflict, incorrect implementation, failing verification, or other blocker.

### C. REMEDIATION REQUIRED

The architecture is valid but evidence or implementation does not satisfy certification requirements.

### D. CLEAN MAINLINE INTEGRATED

Phase 28/29 are already fully committed and verified in the current baseline.

Do not call the state integrated merely because tests pass.

---

# 15. DO NOT IMPLEMENT PHASE 30

This audit must NOT begin:

- Phase 30
- new portfolio capabilities
- new multi-asset capabilities
- UI work
- cloud work
- Kubernetes
- infrastructure work
- Learning work

The next phase will only be authorized after this audit.

---

# 16. REQUIRED REPORT

Return:

```text
PHASE 28–29 INTEGRATION EVIDENCE AUDIT

Repository:
Branch:
HEAD:

Phase 28:
STATUS:
Commit status:
Files committed:
Files uncommitted:

Phase 29:
STATUS:
Commit status:
Files committed:
Files uncommitted:

Learning isolation:
PASS / FAIL

Protected systems:
PASS / FAIL

Database/migration:
PASS / FAIL

Typecheck:
PASS / FAIL

Tests:
PASS / FAIL
COUNT:

Build:
PASS / FAIL

Commit boundary:
PASS / FAIL

Ownership:
PASS / FAIL

Documentation:
PASS / FAIL

Overall classification:
INTEGRATION READY /
INTEGRATION BLOCKED /
REMEDIATION REQUIRED /
CLEAN MAINLINE INTEGRATED

Blocking issues:

Required next action:

PHASE 30:
NOT STARTED
```

---

# 17. AUTONOMY BOUNDARY

You may inspect everything required for this audit.

You may NOT modify anything.

You may NOT commit anything.

You may NOT start Phase 30.

After producing the report, STOP.

The next instruction will explicitly authorize:

```text
COMMIT / INTEGRATION
```

or:

```text
REMEDIATION
```

or:

```text
PHASE 30 DISCOVERY
```

depending on the evidence.

# END