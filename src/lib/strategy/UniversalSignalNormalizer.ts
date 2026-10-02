/**
 * PHASE 25 — UNIVERSAL SIGNAL NORMALIZER
 * =======================================
 * Normalizes, validates, and bounds all StrategySignal outputs.
 *
 * Invariants:
 *   - Strict bounding: 0 <= conviction <= 100.
 *   - NaN, Infinity, negative values are clamped safely.
 *   - Fail-closed dominance: if dataFreshness is UNAVAILABLE or INVALID,
 *     signal is forced to HOLD (or FLAT for derivatives) with conviction = 0.
 *   - Price safety: targetPrice and stopLoss must be strictly positive and finite.
 */

import type {
  AssetClass,
  SignalDirection,
  SignalStrength,
  StrategySignal,
  StrategySignalLineage,
  TimeInForce,
} from './types.ts';
import type { DataFreshnessStatus } from '../../types/stock.ts';

export interface UnnormalizedSignalInput {
  readonly strategyId: string;
  readonly assetClass: AssetClass;
  readonly symbol: string;
  readonly direction: SignalDirection;
  readonly conviction: number;
  readonly targetPrice?: number | null;
  readonly stopLoss?: number | null;
  readonly timeInForce?: TimeInForce;
  readonly dataFreshness?: DataFreshnessStatus;
  readonly reasonCode?: string;
  readonly notes?: readonly string[];
  readonly lineage: StrategySignalLineage;
}

export class UniversalSignalNormalizer {
  /**
   * Normalizes numeric conviction into the strict [0, 100] interval.
   */
  public static normalizeConviction(raw: unknown): number {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return 0;
    }
    if (raw <= 0) return 0;
    if (raw >= 100) return 100;
    return Math.round(raw * 100) / 100;
  }

  /**
   * Derives discrete categorical SignalStrength from normalized conviction.
   */
  public static deriveStrength(conviction: number): SignalStrength {
    if (conviction >= 80) return 'STRONG';
    if (conviction >= 50) return 'MODERATE';
    if (conviction > 0) return 'WEAK';
    return 'NEUTRAL';
  }

  /**
   * Validates positive finite price targets/stops.
   */
  public static normalizePrice(price: unknown): number | null {
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
      return null;
    }
    return Math.round(price * 100) / 100;
  }

  /**
   * Normalizes an unverified strategy signal into a guaranteed-safe, bounded StrategySignal.
   */
  public static normalize(input: UnnormalizedSignalInput): StrategySignal {
    const rawFreshness: DataFreshnessStatus = input.dataFreshness ?? 'CURRENT';
    const isFailClosed = rawFreshness === 'UNAVAILABLE' || rawFreshness === 'INVALID';

    if (isFailClosed) {
      const safeDirection: SignalDirection =
        input.assetClass === 'DERIVATIVE' ? 'FLAT' : 'HOLD';

      return Object.freeze({
        strategyId: input.strategyId,
        assetClass: input.assetClass,
        symbol: input.symbol.trim().toUpperCase(),
        direction: safeDirection,
        conviction: 0,
        strength: 'NEUTRAL',
        targetPrice: null,
        stopLoss: null,
        timeInForce: input.timeInForce ?? 'SWING',
        dataFreshness: rawFreshness,
        reasonCode: input.reasonCode ?? 'DATA_UNAVAILABLE',
        notes: input.notes ? Object.freeze([...input.notes]) : Object.freeze([]),
        lineage: Object.freeze({ ...input.lineage }),
      });
    }

    const conviction = this.normalizeConviction(input.conviction);
    const strength = this.deriveStrength(conviction);
    const targetPrice = this.normalizePrice(input.targetPrice);
    const stopLoss = this.normalizePrice(input.stopLoss);

    // If conviction is zero, force direction to neutral (HOLD / FLAT)
    let direction = input.direction;
    if (conviction === 0) {
      direction = input.assetClass === 'DERIVATIVE' ? 'FLAT' : 'HOLD';
    }

    return Object.freeze({
      strategyId: input.strategyId,
      assetClass: input.assetClass,
      symbol: input.symbol.trim().toUpperCase(),
      direction,
      conviction,
      strength,
      targetPrice,
      stopLoss,
      timeInForce: input.timeInForce ?? 'SWING',
      dataFreshness: rawFreshness,
      reasonCode: input.reasonCode,
      notes: input.notes ? Object.freeze([...input.notes]) : Object.freeze([]),
      lineage: Object.freeze({ ...input.lineage }),
    });
  }

  /**
   * Factory method to create a fail-closed signal directly.
   */
  public static failClosed(
    strategyId: string,
    assetClass: AssetClass,
    symbol: string,
    reasonCode: string,
    lineage: StrategySignalLineage,
    notes?: readonly string[],
    freshness: DataFreshnessStatus = 'UNAVAILABLE'
  ): StrategySignal {
    const direction: SignalDirection = assetClass === 'DERIVATIVE' ? 'FLAT' : 'HOLD';

    return Object.freeze({
      strategyId,
      assetClass,
      symbol: symbol.trim().toUpperCase(),
      direction,
      conviction: 0,
      strength: 'NEUTRAL',
      targetPrice: null,
      stopLoss: null,
      timeInForce: 'SWING',
      dataFreshness: freshness,
      reasonCode,
      notes: notes ? Object.freeze([...notes]) : Object.freeze([]),
      lineage: Object.freeze({ ...lineage }),
    });
  }
}
