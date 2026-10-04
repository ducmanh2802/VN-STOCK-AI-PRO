/**
 * PHASE 29 — QUANT PLATFORM INTEGRATION ENGINE (pure, deterministic)
 * Unifies multi-asset portfolio + Phase-28 reference + strategy rollup + limit checks.
 * Never overrides strategy HOLD/FLAT; only summarizes.
 */

import { MultiAssetPortfolioEngine } from './MultiAssetPortfolioEngine.ts';
import { MultiAssetPositionEngine } from './MultiAssetPositionEngine.ts';
import type {
  DataFreshnessStatus,
  MultiAssetPosition,
  QuantLimitCheck,
  QuantPlatformSnapshot,
  StrategySignalSummary,
  ValuedPosition,
} from './types.ts';
import { MULTI_ASSET_CALCULATION_VERSION, MULTI_ASSET_LIMITATIONS } from './types.ts';

export interface StrategySignalLike {
  readonly direction: string;
  readonly conviction: number;
}

export interface QuantIntegrationInput {
  readonly positions: readonly MultiAssetPosition[];
  readonly cashBalance?: number | null;
  readonly targetWeights?: Readonly<Record<string, number>>;
  readonly markPrices?: Readonly<Record<string, number | null>>;
  readonly signals?: readonly StrategySignalLike[];
  readonly portfolioReference?: string | null;
  readonly leverageCap?: number;
  readonly derivativeNotionalCap?: number | null;
  readonly cashFloorPercent?: number;
  readonly quoteFreshness?: Readonly<Record<string, 'FRESH' | 'STALE' | 'UNAVAILABLE'>>;
  readonly asOfDate: string;
  readonly evaluatedAt: string;
}

function summarizeSignals(signals: readonly StrategySignalLike[]): StrategySignalSummary {
  const byDirection: Record<string, number> = {};
  let sum = 0;
  let n = 0;
  for (const s of signals) {
    const d = (s.direction || 'HOLD').toUpperCase();
    byDirection[d] = (byDirection[d] ?? 0) + 1;
    if (typeof s.conviction === 'number' && Number.isFinite(s.conviction)) {
      sum += s.conviction;
      n += 1;
    }
  }
  const nonHold = (byDirection.LONG ?? 0) + (byDirection.SHORT ?? 0) + (byDirection.REBALANCE ?? 0) + (byDirection.CLOSE ?? 0);
  return {
    total: signals.length,
    byDirection,
    meanConviction: n > 0 ? sum / n : null,
    hasNonHoldSignal: nonHold > 0,
  };
}

export class QuantPlatformIntegrationEngine {
  static build(input: QuantIntegrationInput): QuantPlatformSnapshot {
    const warnings: string[] = [];
    const { valued } = MultiAssetPositionEngine.valueAll(input.positions, input.asOfDate);

    let freshness: DataFreshnessStatus = 'CURRENT';
    if (input.quoteFreshness) {
      for (const p of input.positions) {
        if (p.assetClass === 'CASH') continue;
        const q = input.quoteFreshness[p.symbol.trim().toUpperCase()];
        if (q === 'UNAVAILABLE') {
          freshness = 'UNAVAILABLE';
          break;
        }
        if (q === 'STALE') freshness = 'STALE';
      }
    }
    if (valued.some((v: ValuedPosition) => v.status === 'INVALID')) freshness = 'INVALID';
    else if (valued.some((v: ValuedPosition) => v.status === 'DATA_UNAVAILABLE') && freshness === 'CURRENT') freshness = 'UNAVAILABLE';

    const { summary, status } = MultiAssetPortfolioEngine.summarize({
      valued,
      cashBalance: input.cashBalance ?? null,
    });

    const rebalance =
      status === 'OK' && input.targetWeights
        ? (MultiAssetPortfolioEngine.rebalance(valued, input.targetWeights, summary.netAssets, input.markPrices ?? {}) ?? [])
        : [];

    const strategy = summarizeSignals(input.signals ?? []);

    const limits: QuantLimitCheck[] = [];
    const levCap = input.leverageCap ?? 2.0;
    limits.push({
      limit: `leverage <= ${levCap}`,
      passed: summary.leverage === null ? null : summary.leverage <= levCap,
      detail: summary.leverage === null ? 'Leverage unknown (fail-closed).' : `Leverage ${summary.leverage.toFixed(3)}.`,
    });
    if (input.derivativeNotionalCap !== undefined && input.derivativeNotionalCap !== null) {
      const dNot = Math.abs(summary.byClass.DERIVATIVE ?? NaN);
      limits.push({
        limit: `|derivative notional| <= ${input.derivativeNotionalCap}`,
        passed: Number.isFinite(dNot) ? dNot <= (input.derivativeNotionalCap as number) : null,
        detail: Number.isFinite(dNot) ? `Derivative notional ${Math.round(dNot)} VND.` : 'Derivative notional unknown.',
      });
    }
    if (input.cashFloorPercent !== undefined && input.cashFloorPercent !== null) {
      const net = summary.netAssets ?? NaN;
      const cash = summary.cashBalance ?? NaN;
      const pct = Number.isFinite(net) && net > 0 && Number.isFinite(cash) ? (cash / net) * 100 : NaN;
      limits.push({
        limit: `cash >= ${input.cashFloorPercent}% of net assets`,
        passed: Number.isFinite(pct) ? pct >= (input.cashFloorPercent as number) : null,
        detail: Number.isFinite(pct) ? `Cash ${pct.toFixed(2)}%.` : 'Cash ratio unknown.',
      });
    }
    if (summary.totalMarginRequired !== null && (summary.totalMarginRequired as number) > 0) {
      const cov = summary.marginCoverage ?? NaN;
      limits.push({
        limit: 'cash covers futures margin (>= 1.0x)',
        passed: Number.isFinite(cov) ? (cov as number) >= 1 : null,
        detail: Number.isFinite(cov) ? `Coverage ${(cov as number).toFixed(2)}x.` : 'Margin coverage unknown.',
      });
    }

    if (status !== 'OK') warnings.push('Multi-asset summary fail-closed — see position statuses.');
    if (strategy.total === 0) warnings.push('No strategy signals supplied — integration carries portfolio only.');

    return {
      snapshotId: `quant-${input.asOfDate}-${valued.length}`,
      asOfDate: input.asOfDate,
      evaluatedAt: input.evaluatedAt,
      dataFreshness: freshness,
      positions: valued,
      summary,
      rebalance,
      strategy,
      limits,
      portfolioReference: input.portfolioReference ?? null,
      dataLineage: {
        sources: ['MultiAsset positions', 'mark prices', 'margin/unrealized inputs', 'strategy signals', 'Phase-28 snapshot reference'],
        engine: 'QuantPlatformIntegrationEngine',
        calculationVersion: MULTI_ASSET_CALCULATION_VERSION,
      },
      warnings,
      limitations: [...MULTI_ASSET_LIMITATIONS],
    };
  }
}
