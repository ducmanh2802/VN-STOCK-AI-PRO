/**
 * SECTION 8 — BULL / BASE / BEAR SCENARIO ENGINE
 *
 * Deterministic projection framework. Each scenario derives a fair value from a
 * forward EPS × a valuation multiple:
 *   EPS_t = EPS_0 * (1 + scenarioGrowth)^years
 *   FairValue = EPS_t * scenarioMultiple
 *
 * Growth and multiple are scaled off REAL historical growth / the configured
 * target multiple, so assumptions stay anchored to company history. Probabilities
 * are configurable and must sum to 100%. The three scenarios are validated so
 * bear <= base <= bull; a violation flags `consistent:false` and invalidates the
 * expected value.
 */
import type { ScenarioSetResult } from '../../../types/enterpriseIntelligence.ts';
import { EnterpriseConfig } from './financialFacts.ts';
import { round2 } from './helpers.ts';

export interface ScenarioInput {
  eps: number | null;
  currentPrice: number | null;
  revenueCAGR: number | null; // %
  netMargin: number | null; // %
  config: EnterpriseConfig;
  years?: number;
}

export class ScenarioEngine {
  static evaluate(input: ScenarioInput): ScenarioSetResult {
    const price = input.currentPrice;
    const years = input.years ?? 3;
    const baseGrowth = input.revenueCAGR !== null ? Math.max(0, input.revenueCAGR) : Math.max(0, (input.netMargin ?? 0) * 0.5);

    const bullGrowth = baseGrowth * 1.5;
    const bullMargin = input.netMargin !== null ? input.netMargin + 4 : null;
    const bullMultiple = input.config.targetPE * 1.3;

    const bearGrowth = Math.max(-100, baseGrowth * 0.3);
    const bearMargin = input.netMargin !== null ? input.netMargin - 6 : null;
    const bearMultiple = input.config.targetPE * 0.6;

    const bullFV = fv(input.eps, price, bullGrowth, years, bullMultiple);
    const baseFV = fv(input.eps, price, baseGrowth, years, input.config.targetPE);
    const bearFV = fv(input.eps, price, bearGrowth, years, bearMultiple);

    const consistent = this.validate(bullFV, baseFV, bearFV);

    const probabilities = {
      bull: input.config.bullProbability,
      base: input.config.baseProbability,
      bear: input.config.bearProbability,
    };

    let expectedValue: number | null = null;
    if (consistent && bullFV !== null && baseFV !== null && bearFV !== null) {
      expectedValue = round2(bullFV * probabilities.bull + baseFV * probabilities.base + bearFV * probabilities.bear);
    }

    return {
      bull: this.scenario('bull', price, bullFV, bullGrowth, bullMargin, bullMultiple, probabilities.bull),
      base: this.scenario('base', price, baseFV, baseGrowth, input.netMargin, input.config.targetPE, probabilities.base),
      bear: this.scenario('bear', price, bearFV, bearGrowth, bearMargin, bearMultiple, probabilities.bear),
      expectedValue,
      consistent,
    };
  }

  static validate(bull: number | null, base: number | null, bear: number | null): boolean {
    if (bull === null || base === null || bear === null) return true; // nothing to check
    return bear <= base && base <= bull;
  }

  private static scenario(
    kind: 'bull' | 'base' | 'bear',
    price: number | null,
    fv: number | null,
    growth: number,
    margin: number | null,
    multiple: number,
    probability: number
  ): ScenarioSetResult['bull'] {
    const upside = fv !== null && price && price > 0 ? round2(((fv - price) / price) * 100) : null;
    return {
      case: kind,
      fairValue: fv,
      upside,
      growth: round2(growth),
      margin: margin !== null ? round2(margin) : null,
      multiple: round2(multiple),
      probability,
      reasoning: null,
    };
  }
}

function fv(
  eps: number | null,
  price: number | null,
  growthPct: number,
  years: number,
  multiple: number
): number | null {
  if (eps === null || eps <= 0) return null;
  const epsFuture = eps * Math.pow(1 + growthPct / 100, years);
  return round2(epsFuture * multiple);
}