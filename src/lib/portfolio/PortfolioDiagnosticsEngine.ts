/**
 * PHASE 28 — PORTFOLIO DIAGNOSTICS ENGINE (pure, deterministic)
 * Benchmark comparison, scenario shocks, verdicts. No I/O, no clock.
 */

import type {
  BenchmarkComparison,
  ConcentrationReport,
  ExposureBreakdown,
  PortfolioDiagnostics,
  ScenarioShockResult,
} from './types.ts';

export interface ScenarioInput {
  readonly totalMarketValue: number | null;
  readonly shocks: Readonly<Record<string, number>>;
}

export class PortfolioDiagnosticsEngine {
  static scenarios(input: ScenarioInput): ScenarioShockResult | null {
    const mv = input.totalMarketValue;
    const entries = Object.entries(input.shocks ?? {});
    if (mv === null || !(mv >= 0)) return null;
    if (entries.length === 0) return null;
    const valid = entries.filter(([, r]) => typeof r === 'number' && Number.isFinite(r) && r >= 0);
    if (valid.length === 0) return null;
    const scenarios: Record<string, number> = {};
    for (const [k, r] of valid) scenarios[k] = Math.round(mv * r);
    let worst: string | null = null;
    let worstLoss: number | null = null;
    for (const [k, v] of Object.entries(scenarios)) {
      if (worstLoss === null || v > worstLoss) {
        worstLoss = v;
        worst = k;
      }
    }
    return { scenarios, worstScenario: worst, worstLoss };
  }

  static benchmark(
    portfolioReturn: number | null,
    benchmarkReturn: number | null,
    benchmarkSymbol: string
  ): BenchmarkComparison | null {
    if (portfolioReturn === null || benchmarkReturn === null) return null;
    if (!Number.isFinite(portfolioReturn) || !Number.isFinite(benchmarkReturn)) return null;
    return {
      portfolioReturn,
      benchmarkReturn,
      activeReturn: portfolioReturn - benchmarkReturn,
      benchmarkSymbol,
    };
  }

  static verdict(input: {
    readonly exposure: ExposureBreakdown | null;
    readonly concentration: ConcentrationReport | null;
    readonly exposureStatus: string;
    readonly covarianceStatus: string;
    readonly factorCoverage: number | null;
  }): PortfolioDiagnostics {
    const reasons: string[] = [];
    const symCount = input.exposure ? Object.keys(input.exposure.weights ?? {}).length : 0;
    if (symCount === 0) return { verdict: 'EMPTY', reasons: ['No equity exposure.'] };
    if (input.exposureStatus !== 'OK' || input.covarianceStatus === 'DATA_UNAVAILABLE') {
      reasons.push('Required market inputs unavailable — analytics partial.');
    }
    if (input.covarianceStatus === 'INSUFFICIENT_DATA') {
      reasons.push('Historical series below minimum sample — volatility/beta provisional.');
    }
    if (input.concentration && !input.concentration.withinLimits) {
      reasons.push(...input.concentration.breaches);
      return { verdict: 'CONCENTRATED', reasons };
    }
    if (reasons.length > 0) return { verdict: 'DATA_LIMITED', reasons };
    if (input.factorCoverage !== null && input.factorCoverage < 0.5) {
      return { verdict: 'WATCH', reasons: ['Factor coverage below 50%.'] };
    }
    if ((input.concentration?.hhi ?? 0) > 2500) {
      return { verdict: 'WATCH', reasons: ['HHI above 2500 (highly concentrated).'] };
    }
    return { verdict: 'HEALTHY', reasons: ['Within limits; inputs complete.'] };
  }
}
