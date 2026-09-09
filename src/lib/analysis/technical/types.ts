/**
 * Shared types for the technical analysis engine (support/resistance + risk).
 * These were moved out of `indicators.ts`/`StockAnalysisEngine.ts` during a
 * refactor; this file is their canonical home.
 */
import { CandleInput } from '../common/types.ts';

export type SRType = 'SUPPORT' | 'RESISTANCE';

export interface SupportResistanceLevel {
  price: number;
  strength: number;
  type: SRType;
}

export interface RiskAnalysisResult {
  volatility20D: number | null;
  atr14: number | null;
  atrPercent: number | null;
  distanceToSupport: number | null;
  distanceToResistance: number | null;
  drawdown52wHigh: number | null;
  upsideToResistance: number | null;
  downsideToSupport: number | null;
  riskFactors: string[];
}

export type { CandleInput };