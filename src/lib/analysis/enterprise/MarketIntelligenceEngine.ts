/**
 * ENGINE 10 — MARKET + TECHNICAL + MONEY FLOW INTELLIGENCE
 * Integrates the existing technical analysis + MoneyFlowEngine + foreign flow +
 * volume into a single market-context score. This NEVER overrides fundamental
 * analysis — it only provides market context.
 */
import type { MarketIntelligenceResult } from '../../../types/enterpriseIntelligence.ts';
import { round2 } from './helpers.ts';

export interface MarketIntelligenceInput {
  price: number | null;
  tradingDate: string | null;
  source: string | null;
  technicalScore: number | null;
  technicalSignal: string | null;
  momentumScore: number | null;
  moneyFlowScore: number | null;
  moneyFlowTrend: string | null;
  foreignFlowLabel: string | null;
  volumeScore: number | null;
}

export class MarketIntelligenceEngine {
  static evaluate(input: MarketIntelligenceInput): MarketIntelligenceResult {
    const subs: number[] = [];
    if (input.technicalScore !== null) subs.push(input.technicalScore);
    if (input.momentumScore !== null) subs.push(input.momentumScore);
    if (input.moneyFlowScore !== null) subs.push(input.moneyFlowScore);
    if (input.volumeScore !== null) subs.push(input.volumeScore);
    if (input.foreignFlowLabel !== null) {
      subs.push(input.foreignFlowLabel === 'NET_BUY' ? 80 : input.foreignFlowLabel === 'NET_SELL' ? 25 : 50);
    }
    let score: number | null = null;
    if (subs.length > 0) score = round2(subs.reduce((a, b) => a + b, 0) / subs.length);

    return {
      score,
      technicalTrend: input.technicalSignal,
      momentum: input.momentumScore !== null ? `${input.momentumScore.toFixed(0)}/100` : null,
      moneyFlow: input.moneyFlowTrend,
      foreignFlow: input.foreignFlowLabel,
      price: input.price,
      dataDate: input.tradingDate,
      source: input.source,
    };
  }
}