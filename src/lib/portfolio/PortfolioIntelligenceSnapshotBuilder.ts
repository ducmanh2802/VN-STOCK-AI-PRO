/**
 * PHASE 28 — PORTFOLIO INTELLIGENCE SNAPSHOT BUILDER (pure orchestrator)
 * Single deterministic entry point. Caller supplies validated inputs + timestamps.
 */

import { AllocationEngine } from './AllocationEngine.ts';
import { ConcentrationEngine } from './ConcentrationEngine.ts';
import { CovarianceEngine } from './CovarianceEngine.ts';
import { FactorExposureEngine } from './FactorExposureEngine.ts';
import { PortfolioDiagnosticsEngine } from './PortfolioDiagnosticsEngine.ts';
import { PortfolioExposureEngine } from './PortfolioExposureEngine.ts';
import type {
  AllocationMethod,
  AllocationResult,
  BenchmarkComparison,
  BetaReport,
  ConcentrationReport,
  CovarianceReport,
  DataFreshnessStatus,
  ExposureBreakdown,
  FactorExposureReport,
  FactorVector,
  PortfolioAssetClass,
  PortfolioDataStatus,
  PortfolioDiagnostics,
  PortfolioIntelligenceSnapshot,
  PortfolioMetric,
  PortfolioPolicy,
  PortfolioPositionInput,
  ScenarioShockResult,
} from './types.ts';
import { PORTFOLIO_CALCULATION_VERSION, PORTFOLIO_LIMITATIONS } from './types.ts';

export interface SnapshotInput {
  readonly positions: readonly PortfolioPositionInput[];
  readonly cashValue?: number | null;
  readonly historicalReturns?: Readonly<Record<string, readonly number[]>>;
  readonly benchmarkReturns?: readonly number[];
  readonly benchmarkSymbol?: string;
  readonly benchmarkPeriodReturn?: number | null;
  readonly portfolioPeriodReturn?: number | null;
  readonly factorScores?: Readonly<Record<string, FactorVector>>;
  readonly policy?: PortfolioPolicy;
  readonly shocks?: Readonly<Record<string, number>>;
  readonly quoteFreshness?: Readonly<Record<string, 'FRESH' | 'STALE' | 'UNAVAILABLE'>>;
  readonly asOfDate: string;
  readonly evaluatedAt: string;
  readonly minObservations?: number;
}

function statusFromFreshness(
  quoteFreshness: SnapshotInput['quoteFreshness'],
  positions: readonly PortfolioPositionInput[]
): { status: PortfolioDataStatus; freshness: DataFreshnessStatus } {
  if (!quoteFreshness) return { status: 'OK', freshness: 'CURRENT' };
  let stale = false;
  for (const p of positions) {
    if (p.assetClass === 'CASH') continue;
    const q = quoteFreshness[p.symbol.trim().toUpperCase()];
    if (q === 'UNAVAILABLE') return { status: 'DATA_UNAVAILABLE', freshness: 'UNAVAILABLE' };
    if (q === 'STALE') stale = true;
  }
  return stale ? { status: 'STALE', freshness: 'STALE' } : { status: 'OK', freshness: 'CURRENT' };
}

function metric<T>(
  value: T | null,
  status: PortfolioDataStatus,
  formula: string,
  source: string,
  asOfDate: string,
  evaluatedAt: string,
  units: string,
  extra?: { window?: string; confidence?: string; details?: Record<string, unknown>; warnings?: string[] }
): PortfolioMetric<T> {
  return {
    value,
    status,
    provenance: {
      formula,
      source,
      asOfDate,
      evaluatedAt,
      window: extra?.window,
      units,
      confidence: extra?.confidence,
    },
    details: extra?.details,
    warnings: extra?.warnings,
  };
}

const ENGINE = 'PortfolioIntelligenceSnapshotBuilder';

export class PortfolioIntelligenceSnapshotBuilder {
  static build(input: SnapshotInput): PortfolioIntelligenceSnapshot {
    const warnings: string[] = [];
    const asOfDate = input.asOfDate;
    const evaluatedAt = input.evaluatedAt;
    const fresh = statusFromFreshness(input.quoteFreshness, input.positions);

    // 1. Exposure
    const expRes = PortfolioExposureEngine.compute({
      positions: input.positions,
      cashValue: input.cashValue ?? null,
      asOfDate,
    });
    if (expRes.invalid) {
      const bad: PortfolioIntelligenceSnapshot = {
        snapshotId: `portfolio-${asOfDate}-invalid`,
        asOfDate,
        evaluatedAt,
        symbols: [],
        dataFreshness: 'INVALID',
        exposure: metric<ExposureBreakdown>(null, 'INVALID', 'weights = mv_i / Σmv', ENGINE, asOfDate, evaluatedAt, 'ratio', { warnings: ['Invalid position inputs (negative quantity or price).'] }),
        concentration: metric<ConcentrationReport>(null, 'INVALID', 'concentration', ENGINE, asOfDate, evaluatedAt, '%'),
        covariance: metric<CovarianceReport>(null, 'INVALID', 'covariance', ENGINE, asOfDate, evaluatedAt, 'decimal'),
        beta: metric<BetaReport>(null, 'INVALID', 'beta', ENGINE, asOfDate, evaluatedAt, 'ratio'),
        factorExposure: metric<FactorExposureReport>(null, 'INVALID', 'factor', ENGINE, asOfDate, evaluatedAt, 'score'),
        allocation: metric<Readonly<Record<AllocationMethod, AllocationResult>>>(null, 'INVALID', 'allocation', ENGINE, asOfDate, evaluatedAt, 'weight'),
        benchmark: metric<BenchmarkComparison>(null, 'INVALID', 'benchmark', ENGINE, asOfDate, evaluatedAt, '%'),
        scenarios: metric<ScenarioShockResult>(null, 'INVALID', 'scenario', ENGINE, asOfDate, evaluatedAt, 'VND'),
        diagnostics: { verdict: 'DATA_LIMITED', reasons: ['Invalid inputs.'] },
        dataLineage: { sources: [], engine: ENGINE, calculationVersion: PORTFOLIO_CALCULATION_VERSION },
        warnings: ['Invalid position inputs.'],
        limitations: [...PORTFOLIO_LIMITATIONS],
      };
      return bad;
    }
    const exposure = expRes.breakdown!;
    const symbols = Object.keys(exposure.weights).sort();
    const empty = symbols.length === 0;

    // 2. Concentration
    const conc = ConcentrationEngine.compute({ exposure, policy: input.policy });

    // 3. Covariance (needs returns for every non-cash held symbol with weight > 0)
    let covStatus: PortfolioDataStatus = empty ? 'OK' : 'DATA_UNAVAILABLE';
    let covValue = null as CovarianceReport | null;
    let covWarnings: string[] | undefined;
    if (!empty) {
      const needed = symbols.filter((s) => (exposure.weights[s] ?? 0) > 0);
      const rets: Record<string, readonly number[]> = {};
      let missing = false;
      for (const s of needed) {
        // Cash pseudo-symbol has no return series — exclude from covariance universe.
        const isCash = input.positions.some(
          (p) => p.symbol.trim().toUpperCase() === s && p.assetClass === 'CASH'
        );
        if (isCash) continue;
        const r = input.historicalReturns?.[s];
        if (!r || r.length === 0) {
          missing = true;
          break;
        }
        rets[s] = r;
      }
      if (missing) {
        covStatus = fresh.status === 'STALE' ? 'STALE' : 'DATA_UNAVAILABLE';
        covWarnings = ['Historical return series missing for at least one held symbol — covariance fail-closed.'];
      } else {
        const out = CovarianceEngine.compute({
          returnsBySymbol: rets,
          weights: exposure.weights,
          minObservations: input.minObservations ?? 30,
        });
        if (!out) {
          covStatus = 'DATA_UNAVAILABLE';
        } else if (out.insufficient) {
          covStatus = 'INSUFFICIENT_DATA';
          covValue = {
            symbols: out.symbols,
            observationCount: out.observationCount,
            covariance: out.covariance,
            correlation: out.correlation,
            volatilities: out.volatilities,
            annualizedPortfolioVolatility: out.annualizedPortfolioVolatility,
            diversificationRatio: out.diversificationRatio,
          };
          covWarnings = [`Only ${out.observationCount} observations (minimum ${input.minObservations ?? 30}).`];
        } else {
          covStatus = fresh.status === 'OK' ? 'OK' : fresh.status;
          covValue = {
            symbols: out.symbols,
            observationCount: out.observationCount,
            covariance: out.covariance,
            correlation: out.correlation,
            volatilities: out.volatilities,
            annualizedPortfolioVolatility: out.annualizedPortfolioVolatility,
            diversificationRatio: out.diversificationRatio,
          };
        }
      }
    } else {
      covValue = {
        symbols: [],
        observationCount: 0,
        covariance: [],
        correlation: [],
        volatilities: {},
        annualizedPortfolioVolatility: 0,
        diversificationRatio: null,
      };
    }

    // 4. Beta vs benchmark
    let betaStatus: PortfolioDataStatus = empty ? 'OK' : 'DATA_UNAVAILABLE';
    let betaValue: BetaReport | null = empty
      ? { beta: 0, correlationToBenchmark: null, trackingErrorAnnualized: null, overlapCount: 0 }
      : null;
    if (!empty && input.benchmarkReturns && input.benchmarkReturns.length >= 2) {
      const prets = CovarianceEngine.portfolioReturnSeries(input.historicalReturns ?? {}, exposure.weights);
      if (prets) {
        const b = CovarianceEngine.beta(prets, input.benchmarkReturns);
        if (b.beta !== null) {
          betaStatus = 'OK';
          betaValue = {
            beta: b.beta,
            correlationToBenchmark: b.correlation,
            trackingErrorAnnualized: b.trackingErrorAnn,
            overlapCount: b.overlap,
          };
        } else {
          betaStatus = 'INSUFFICIENT_DATA';
        }
      }
    } else if (!empty) {
      betaStatus = covStatus === 'STALE' ? 'STALE' : 'DATA_UNAVAILABLE';
    }

    // 5. Factor exposure
    let factorStatus: PortfolioDataStatus = empty ? 'OK' : 'DATA_UNAVAILABLE';
    let factorValue: FactorExposureReport | null = empty
      ? { exposure: { value: null, quality: null, momentum: null, growth: null, size: null, lowVol: null }, coverage: 0, uncoveredSymbols: [] }
      : null;
    if (!empty && input.factorScores) {
      const f = FactorExposureEngine.compute({ weights: exposure.weights, factorsBySymbol: input.factorScores });
      if (f) {
        if (f.coverage <= 0) {
          factorValue = null;
          factorStatus = 'DATA_UNAVAILABLE';
        } else {
          factorValue = f;
          factorStatus = f.coverage < 1 ? 'STALE' : 'OK';
        }
        if (f.coverage > 0 && f.coverage < 1) {
          warnings.push(`Factor coverage partial (${(f.coverage * 100).toFixed(1)}%). Uncovered: ${f.uncoveredSymbols.join(', ') || 'none'}.`);
        }
      }
    }

    // 6. Allocation (requires at least 1 symbol; vols from covariance when available)
    let allocStatus: PortfolioDataStatus = empty ? 'OK' : 'OK';
    let allocValue: Record<AllocationMethod, AllocationResult> | null = null;
    if (empty) {
      allocValue = null;
      allocStatus = 'OK';
    } else {
      const allocSyms = covValue && covValue.symbols.length > 0 ? covValue.symbols : symbols.filter((s) => !input.positions.some((p) => p.symbol.trim().toUpperCase() === s && p.assetClass === 'CASH'));
      if (allocSyms.length === 0) {
        allocValue = null;
        allocStatus = 'DATA_UNAVAILABLE';
      } else {
        const vols: Record<string, number | null> = {};
        for (const s of allocSyms) vols[s] = covValue?.volatilities[s] ?? null;
        allocValue = AllocationEngine.all({
          symbols: allocSyms,
          volatilities: vols,
          covariance: covValue && covValue.symbols.join() === allocSyms.join() ? (covValue.covariance as number[][]) : undefined,
        });
      }
    }

    // 7. Benchmark comparison (period returns must both be supplied)
    const benchCmp = PortfolioDiagnosticsEngine.benchmark(
      input.portfolioPeriodReturn ?? null,
      input.benchmarkPeriodReturn ?? null,
      input.benchmarkSymbol ?? 'VN-INDEX'
    );
    const benchStatus: PortfolioDataStatus = benchCmp ? 'OK' : empty ? 'OK' : 'DATA_UNAVAILABLE';

    // 8. Scenarios
    const scen = PortfolioDiagnosticsEngine.scenarios({
      totalMarketValue: exposure.totalMarketValue,
      shocks: input.shocks ?? {},
    });
    const scenStatus: PortfolioDataStatus = scen ? 'OK' : empty ? 'OK' : 'DATA_UNAVAILABLE';

    const diagnostics: PortfolioDiagnostics = PortfolioDiagnosticsEngine.verdict({
      exposure,
      concentration: conc,
      exposureStatus: fresh.status,
      covarianceStatus: covStatus,
      factorCoverage: factorValue?.coverage ?? null,
    });

    if (covWarnings) warnings.push(...covWarnings);
    if (fresh.status === 'STALE') warnings.push('Quote data stale for at least one held position.');

    const expStatus: PortfolioDataStatus = fresh.status === 'OK' ? 'OK' : fresh.status;

    return {
      snapshotId: `portfolio-${asOfDate}-${symbols.length}`,
      asOfDate,
      evaluatedAt,
      symbols,
      dataFreshness: fresh.freshness,
      exposure: metric(exposure, expStatus, 'weights = mv_i / Σmv; sector/asset-class = Σw over members', 'BrokerAccount positions + mark prices', asOfDate, evaluatedAt, 'ratio'),
      concentration: metric(
        conc,
        conc ? expStatus : 'DATA_UNAVAILABLE',
        'max/top-N/sector/class/HHI; limits 20% position / 30% sector',
        'Exposure weights + policy',
        asOfDate,
        evaluatedAt,
        '%'
      ),
      covariance: metric(
        covValue,
        covStatus,
        'sample cov Σ(r−μ)(r−μ)/(n−1) on aligned tails; σ_p=sqrt(wᵀΣw)×sqrt(252)',
        'Validated historical returns (KBS/ETF/derivatives providers)',
        asOfDate,
        evaluatedAt,
        'decimal',
        { window: covValue ? `${covValue.observationCount} obs` : undefined, warnings: covWarnings }
      ),
      beta: metric(
        betaValue,
        betaStatus,
        'beta = cov(r_p,r_b)/var(r_b) on overlapping tail',
        'Portfolio returns + explicit benchmark series',
        asOfDate,
        evaluatedAt,
        'ratio'
      ),
      factorExposure: metric(
        factorValue,
        factorStatus,
        'f_k = Σ w_i × f_{i,k} over covered weight (per-factor renormalization)',
        'Caller-supplied per-symbol factor vectors',
        asOfDate,
        evaluatedAt,
        'score'
      ),
      allocation: metric(
        allocValue,
        allocValue ? 'OK' : allocStatus,
        'equal / inverse-vol / min-variance (ridge 1e-6, long-only clip) / BL-lite blend',
        'Covariance + volatilities',
        asOfDate,
        evaluatedAt,
        'weight'
      ),
      benchmark: metric(
        benchCmp ?? (empty ? { portfolioReturn: 0, benchmarkReturn: input.benchmarkPeriodReturn ?? null, activeReturn: null, benchmarkSymbol: input.benchmarkSymbol ?? 'VN-INDEX' } : null),
        empty ? 'OK' : benchStatus,
        'active = portfolio − benchmark (same window)',
        'Supplied period returns',
        asOfDate,
        evaluatedAt,
        '%'
      ),
      scenarios: metric(
        scen ?? (empty ? { scenarios: {}, worstScenario: null, worstLoss: 0 } : null),
        empty ? 'OK' : scenStatus,
        'loss = marketValue × shockRate per named scenario',
        'Supplied shock map',
        asOfDate,
        evaluatedAt,
        'VND'
      ),
      diagnostics,
      dataLineage: {
        sources: ['BrokerAccount', 'KBS/ETF/derivatives historical providers', 'sector map', 'factor inputs', 'benchmark series'],
        engine: 'PortfolioIntelligenceSnapshotBuilder',
        calculationVersion: PORTFOLIO_CALCULATION_VERSION,
      },
      warnings,
      limitations: [...PORTFOLIO_LIMITATIONS],
    };
  }
}

export type { PortfolioAssetClass };
