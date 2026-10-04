# BUSINESS-03 — STRATEGY / RESEARCH MARKETPLACE ARCHITECTURE

**Status:** IMPLEMENTED + CERTIFIED
**Date:** 2026-10-05
**Tests:** 4 business files / 134 tests / 0 failures

---

## 1. THE CENTRAL RULE

Roadmap §03.2: *"Never display `+37.4%` without knowing: dataset, period, strategy version,
cost model, execution model, validation state."*

This is enforced at **three independent layers**, so no single mistake can leak a number:

| Layer | Mechanism | Failure it prevents |
|---|---|---|
| Type | `gateMetric` returns a union; `DisplayableMetric` is only constructible via the gate | a reviewer forgetting a check |
| Engine | `MarketplaceEngine.performanceForDisplay` is the only rendering path | ad-hoc rendering elsewhere |
| **Database** | generated column `performance_displayable` + `CHECK (performance = '[]' OR performance_displayable)` | a direct SQL write persisting a number without provenance |

The database layer is the one that matters most: it makes the invalid state
**unrepresentable**, not merely discouraged. An application-only check would leave the row
writable by any future query.

Provenance is **six separate columns**, never one JSON manifest — a missing field is then
visible to a query, a constraint and a test instead of hiding inside an opaque object.

---

## 2. NO PARTIAL RENDITION

```ts
type ListingPerformance =
  | { status: 'AVAILABLE';   metrics: DisplayableMetric[]; provenance: ResolvedProvenance }
  | { status: 'NOT_AVAILABLE'; missing: string[];       reason: string }
```

Either every metric renders with its provenance, or none does and the gap list says which
field is missing. There is no shape that can hold a number without provenance beside it.

A **non-finite** value (NaN / ±Infinity) is treated as unavailable — a broken backtest must
not surface as a number.

A listing with incomplete provenance is still publishable. It reads
`PERFORMANCE: NOT_AVAILABLE` with the missing fields enumerated. Publishing methodology while
the author's own evidence is incomplete is a truthful, legitimate state.

---

## 3. STATE SEPARATION (roadmap §03.4, §15)

`evidence` is a set of **independent** flags. Nothing implies anything above it:

```
AUTHORED  PUBLISHED  VERIFIED  BACKTESTED  OUT_OF_SAMPLE_TESTED  PAPER_TESTED  CERTIFIED
```

- A new version starts with exactly `['AUTHORED']`. Publishing adds `PUBLISHED` and nothing else.
- `PUBLISHED` does **not** imply `VERIFIED`. `canAssert(v,'VERIFIED')` is false on a freshly
  published listing.
- `BACKTESTED` does **not** imply `CERTIFIED`.
- A **new version does not inherit the previous version's evidence.** v2 is different code;
  inheriting v1's certification would be exactly the "publication implies validation" error
  one generation later.

`evidenceLevel()` returns the strongest rung for display only. It is never an authorization
input.

---

## 4. VERSIONING (roadmap §03.5)

`nextVersion(previous, change)` returns a **new frozen object** with `version + 1` and
`previousVersionId`. The prior version is a frozen value the function has no reference capable
of mutating, so its recorded performance cannot change.

The DB reinforces this structurally:

```sql
CREATE UNIQUE INDEX marketplace_listings_version_uniq ON marketplace_listings (strategy_id, version);
```

One row per (strategy, version). Silent in-place version mutation is impossible — not
discouraged, impossible.

A new version also resets `publication` to `DRAFT` and the evidence ladder to `AUTHORED`.

---

## 5. RANKING (roadmap §03.6, §03.7)

**Raw return is never a ranking input.** The test
`never ranks on raw return: a higher CAGR with worse risk does not win` builds a strategy with
**+95% CAGR** against one with +18% and asserts the 18% strategy ranks first.

Components: risk-adjusted return (Sharpe, capped), drawdown penalty, sample-size confidence,
out-of-sample bonus, paper-evidence bonus. Negative components are floored at 0 so a strategy
is never ranked *below* "no evidence" — uncertainty is communicated through the `missing`
list, not by a punitive score.

Candidates with unresolvable provenance are **excluded with a reason**, never scored as zero.
Scoring unknown as zero would place unverified strategies at the bottom, which reads as "we
evaluated them and they were bad" — a fabricated judgement.

Methodology is versioned (`v1.0.0-business-03-rank`), exported as
`RANKING_METHODOLOGY`, and every score exposes its `components` map. Ties break
deterministically by ref so the ordering is stable.

---

## 6. COMMERCIAL STATE (roadmap §03.8, §03.9)

`commercialModel` is a **name**, not an amount. `marketplace_purchases` has no amount column
at all — a half-recorded price is worse than none.

`MarketplaceEngine.creatorEconomics` returns `NOT_APPLICABLE` with every monetary field `null`
until a settled ledger amount exists. There is no code path that produces a payout balance
from nothing. The DB enforces the decomposition:

```sql
CONSTRAINT marketplace_creator_balance_check CHECK (
  gross_revenue_minor IS NULL OR (
    platform_fee_minor + creator_share_minor = gross_revenue_minor
    AND creator_share_minor - COALESCE(refund_minor,0) - COALESCE(tax_withheld_minor,0) >= 0
  )
)
```

Submission is entitlement-gated through the same `EntitlementService` seam used everywhere
else: FREE cannot publish (`MARKETPLACE_PUBLISHING_NOT_IN_PLAN`), and a plan must permit the
chosen commercial model (`MARKETPLACE_MODEL_NOT_ALLOWED`). Only the author may submit.

---

## 7. DATA MODEL

| Table | Purpose |
|---|---|
| `marketplace_strategies` | stable identity + ownership across versions |
| `marketplace_listings` | one row per version; six provenance columns + generated displayable flag |
| `marketplace_purchases` | purchase intent; no amount |
| `marketplace_creator_economics` | decomposed money, NULL until settled; DB balance CHECK |

Indexes are bounded-feed shaped: `(publication_status, asset_class, created_at DESC)` for
discovery, a partial index on `performance_displayable` for ranking inputs.

---

## 8. KNOWN LIMITATIONS

| # | Limitation | Severity |
|---|---|---|
| P-01 | No marketplace HTTP router; export/import integration pending | P2 |
| P-02 | Ranking weights are unvalidated against real outcome data (no data exists to validate against) | P2 — flagged, not fabricated |
| P-03 | `Verified` is asserted manually by an operator; no automated re-verification job exists | P2 — INFRA phase |
| P-04 | Vietnamese-language claim scanning for marketplace descriptions reuses the community blocklist, which is a blocklist not a classifier | P2 by design |