# Metric Contracts & Quant Definitions

## Phase 19 Quant Standards

### 1. Fail-Closed Invariant
- **Rule**: `null` or `undefined` or `NaN` signifies **data unavailable**, NOT 0.
- `0` is a valid mathematical value (e.g. 0% return, 0 change), and MUST NEVER be substituted for missing data.
- UI components must display placeholder dashes (`--` or `—`) for missing values.

### 2. Rankings & Strategy Invariants
- **Rank Integrity**: Rank numbers are 1-based sequential integers ($1, 2, \dots, N$) determined by deterministic ordering.
- **Sorting Comparator**:
  - Valid finite numbers sort by value (ascending or descending).
  - Non-finite or missing values sort to the end (nulls last) regardless of sort direction.
  - Secondary tie-breakers must be deterministic: `score` $\rightarrow$ `expectedReturn` $\rightarrow$ `riskReward` $\rightarrow$ `symbol`.
- **Display Formatting**:
  - Scores: integer or 1-decimal finite number ($0 \le \text{score} \le 100$), or `—` if unavailable.
  - Expected Return: signed percentage format (`+X.X%`, `-X.X%`, `0.0%`), or `—` if unavailable.
  - Risk/Reward: `1 : X.X` when finite and positive, or `—` if unavailable.
