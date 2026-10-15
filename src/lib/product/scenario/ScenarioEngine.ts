/**
 * PRODUCT-02 — SCENARIO / WHAT-IF ENGINE (pure + deterministic)
 * ==============================================================
 * Hypothetical portfolio exploration that NEVER touches real state:
 * - baseline positions are read-only (deep-copied in and out; never mutated)
 * - price shocks + allocation deltas are USER_ASSUMPTION inputs
 * - all math reuses certified engines (Exposure, Concentration, Diagnostics)
 * - macro scenarios are recorded as labeled assumption sets; they are NEVER
 *   converted into returns via invented causal models (no such mapping exists)
 * - every output value carries provenance: CALCULATED | USER_ASSUMPTION | NOT_AVAILABLE
 */
import { ConcentrationEngine } from '../../portfolio/ConcentrationEngine.ts';
import { PortfolioDiagnosticsEngine } from '../../portfolio/PortfolioDiagnosticsEngine.ts';
import { PortfolioExposureEngine } from '../../portfolio/PortfolioExposureEngine.ts';
import type { PortfolioPositionInput } from '../../portfolio/types.ts';

export type ScenarioProvenance = 'CALCULATED' | 'USER_ASSUMPTION' | 'NOT_AVAILABLE';

export type ScenarioAssumptionKind = 'PRICE_SHOCK' | 'ALLOCATION_DELTA' | 'CASH_MOVE' | 'MACRO_NOTE';

export interface ScenarioAssumption {
  readonly kind: ScenarioAssumptionKind;
  /** Symbol for PRICE_SHOCK/ALLOCATION_DELTA; macro variable name for MACRO_NOTE; 'CASH' for CASH_MOVE. */
  readonly target: string;
  /** Shock fraction (e.g. -0.2) / quantity delta (shares, signed integer) / cash delta (VND) / NaN for notes. */
  readonly value: number;
  readonly label: string;
}

export interface ScenarioPositionView {
  readonly symbol: string;
  readonly quantity: number;
  readonly markPrice: number | null;
  readonly marketValue: number | null;
  readonly weight: number | null;
}

export interface ScenarioSnapshot {
  readonly positions: readonly ScenarioPositionView[];
  readonly totalMarketValue: number | null;
  readonly maxPositionPercent: number | null;
  readonly maxPositionSymbol: string | null;
  readonly valid: boolean;
}

export interface ScenarioDiff {
  readonly absoluteImpact: number | null;
  readonly percentageImpact: number | null;
  readonly concentrationDelta: number | null;
  readonly worstShockLoss: number | null;
  readonly worstShockName: string | null;
}

export interface ScenarioResult {
  readonly baseline: ScenarioSnapshot;
  readonly shocked: ScenarioSnapshot;
  readonly diff: ScenarioDiff;
  readonly assumptions: readonly ScenarioAssumption[];
  readonly warnings: readonly string[];
  readonly provenance: Readonly<Record<string, ScenarioProvenance>>;
  readonly version: string;
}

export const SCENARIO_VERSION = 'v1.0.0-product-scenario';

function freeze<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function snapOf(positions: readonly PortfolioPositionInput[], asOfDate: string): ScenarioSnapshot {
  const { breakdown, invalid } = PortfolioExposureEngine.compute({ positions, asOfDate });
  if (invalid || !breakdown) return { positions: [], totalMarketValue: null, maxPositionPercent: null, maxPositionSymbol: null, valid: false };
  const conc = ConcentrationEngine.compute({ exposure: breakdown });
  const weights = (breakdown.weights ?? {}) as Record<string, number>;
  const views: ScenarioPositionView[] = positions.map((p) => {
    const mv = p.markPrice === null || p.markPrice === undefined ? null : p.quantity * p.markPrice;
    return { symbol: p.symbol, quantity: p.quantity, markPrice: p.markPrice ?? null, marketValue: mv, weight: weights[p.symbol] ?? null };
  });
  const total = views.reduce<number | null>((acc, v) => (acc === null || v.marketValue === null ? null : acc + v.marketValue), 0);
  return {
    positions: views,
    totalMarketValue: total,
    maxPositionPercent: conc?.maxPositionPercent ?? null,
    maxPositionSymbol: conc?.maxPositionSymbol ?? null,
    valid: true,
  };
}

export class ScenarioEngine {
  static run(input: {
    readonly baseline: readonly PortfolioPositionInput[];
    readonly assumptions: readonly ScenarioAssumption[];
    readonly asOfDate: string;
  }): ScenarioResult {
    const assumptions = [...input.assumptions];
    const warnings: string[] = [];
    const provenance: Record<string, ScenarioProvenance> = {};
    // Work on private mutable copies; the caller's readonly baseline is never mutated.
    const shocked: { -readonly [K in keyof PortfolioPositionInput]: PortfolioPositionInput[K] }[] = freeze(
      [...input.baseline],
    );
    const bySym = new Map(shocked.map((p) => [p.symbol.trim().toUpperCase(), p]));

    for (const a of assumptions) {
      const t = (a.target || '').trim().toUpperCase();
      if (a.kind === 'MACRO_NOTE') {
        provenance[`macro:${a.target}`] = 'USER_ASSUMPTION';
        warnings.push(`Macro assumption recorded without causal mapping: ${a.label} (no invented transmission).`);
        continue;
      }
      if (a.kind === 'CASH_MOVE') {
        provenance['cash'] = 'USER_ASSUMPTION';
        warnings.push(`Cash move assumption recorded: ${a.label}. Cash baseline unchanged.`);
        continue;
      }
      const pos = bySym.get(t);
      if (!pos) {
        warnings.push(`Assumption ignored (unknown symbol): ${a.label}`);
        continue;
      }
      if (a.kind === 'PRICE_SHOCK') {
        if (!Number.isFinite(a.value)) throw new Error('SCENARIO_SHOCK_INVALID');
        if (pos.markPrice === null || pos.markPrice === undefined) {
          provenance[`price:${t}`] = 'NOT_AVAILABLE';
          warnings.push(`Price shock skipped (no mark price): ${t}. No imputation performed.`);
          continue;
        }
        const next = pos.markPrice * (1 + a.value);
        if (!(next >= 0)) throw new Error('SCENARIO_NEGATIVE_PRICE');
        pos.markPrice = next;
        provenance[`price:${t}`] = 'USER_ASSUMPTION';
      } else if (a.kind === 'ALLOCATION_DELTA') {
        if (!Number.isInteger(a.value)) throw new Error('SCENARIO_QTY_MUST_BE_INTEGER');
        const nextQty = pos.quantity + a.value;
        if (nextQty < 0) throw new Error('SCENARIO_NEGATIVE_QTY');
        pos.quantity = nextQty;
        if (pos.assetClass !== 'DERIVATIVE' && pos.assetClass !== 'CASH' && nextQty % 100 !== 0) {
          warnings.push(`Lot-size warning: ${t} ends at ${nextQty} shares (HOSE/HNX lot = 100).`);
        }
        provenance[`qty:${t}`] = 'USER_ASSUMPTION';
      }
    }

    const baseline = snapOf(freeze([...input.baseline]), input.asOfDate);
    const shockedSnap = snapOf(shocked, input.asOfDate);
    provenance['baseline.total'] = baseline.totalMarketValue !== null ? 'CALCULATED' : 'NOT_AVAILABLE';
    provenance['shocked.total'] = shockedSnap.totalMarketValue !== null ? 'CALCULATED' : 'NOT_AVAILABLE';

    const absoluteImpact =
      baseline.totalMarketValue !== null && shockedSnap.totalMarketValue !== null
        ? shockedSnap.totalMarketValue - baseline.totalMarketValue
        : null;
    const percentageImpact =
      absoluteImpact !== null && baseline.totalMarketValue !== null && baseline.totalMarketValue !== 0
        ? absoluteImpact / baseline.totalMarketValue
        : null;
    const concentrationDelta =
      baseline.maxPositionPercent !== null && shockedSnap.maxPositionPercent !== null
        ? shockedSnap.maxPositionPercent - baseline.maxPositionPercent
        : null;
    provenance['diff.impact'] = absoluteImpact !== null ? 'CALCULATED' : 'NOT_AVAILABLE';

    let worstShockLoss: number | null = null;
    let worstShockName: string | null = null;
    if (baseline.totalMarketValue !== null) {
      const shockMap: Record<string, number> = {};
      for (const a of assumptions) {
        if (a.kind === 'PRICE_SHOCK' && Number.isFinite(a.value) && a.value < 0) shockMap[a.label] = -a.value;
      }
      const r = PortfolioDiagnosticsEngine.scenarios({ totalMarketValue: baseline.totalMarketValue, shocks: shockMap });
      worstShockLoss = r?.worstLoss ?? null;
      worstShockName = r?.worstScenario ?? null;
    }
    provenance['diff.worstShock'] = worstShockLoss !== null ? 'CALCULATED' : 'NOT_AVAILABLE';

    return {
      baseline,
      shocked: shockedSnap,
      diff: { absoluteImpact, percentageImpact, concentrationDelta, worstShockLoss, worstShockName },
      assumptions,
      warnings,
      provenance,
      version: SCENARIO_VERSION,
    };
  }
}
