/**
 * PHASE 21 — CONTINUOUS FUTURES ENGINE
 * =====================================
 * Constructs roll-adjusted continuous time series from individual contract bars.
 * Enforces temporal causality (no lookahead bias), deterministic rollover dates,
 * and zero synthetic bar interpolation.
 */

import type {
  UnderlyingIndex,
  ContinuousAdjustmentMethod,
  ContinuousFuturesBar,
  ContinuousFuturesSeries,
  ContractSpecification,
  CandlePoint,
} from './types.ts';

export interface ContinuousBuildInput {
  underlying: UnderlyingIndex;
  method: ContinuousAdjustmentMethod;
  contracts: ContractSpecification[];
  contractBars: Record<string, CandlePoint[]>;
}

export class ContinuousFuturesEngine {
  /**
   * Stitches historical contract bars into a single continuous futures series.
   */
  public static buildSeries(input: ContinuousBuildInput): ContinuousFuturesSeries {
    // Sort contracts by expiration date ascending
    const sortedContracts = [...input.contracts].sort((a, b) =>
      a.lastTradingDate.localeCompare(b.lastTradingDate)
    );

    const continuousBars: ContinuousFuturesBar[] = [];
    const rollDates: string[] = [];
    const seenTimestamps = new Set<string>();

    let cumulativeAdditiveAdjustment = 0;
    let cumulativeMultiplicativeRatio = 1.0;

    // Track roll adjustments at boundaries
    const adjustments: { rollDate: string; diff: number; ratio: number }[] = [];

    // Traverse contracts chronologically
    for (let i = 0; i < sortedContracts.length; i++) {
      const contract = sortedContracts[i];
      const nextContract = sortedContracts[i + 1];
      const bars = input.contractBars[contract.contractCode] || [];

      // Sort bars ascending
      const sortedBars = [...bars].sort((a, b) => String(a.time).localeCompare(String(b.time)));

      // Active trading window for this contract:
      // Until nextContract takes over on contract.lastTradingDate
      const rollDate = contract.lastTradingDate;

      for (const bar of sortedBars) {
        const barDate = String(bar.time).slice(0, 10);

        // If this bar is strictly after the roll date and we have a next contract, do not include
        if (nextContract && barDate > rollDate) {
          continue;
        }

        // Avoid duplicate timestamps
        if (seenTimestamps.has(barDate)) {
          continue;
        }

        seenTimestamps.add(barDate);
        continuousBars.push({
          time: bar.time,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume,
          openInterest: null,
          contractCode: contract.contractCode,
          unadjustedClose: bar.close,
        });
      }

      // If there is a next contract, compute roll gap on rollDate
      if (nextContract) {
        rollDates.push(rollDate);
        const nextBars = input.contractBars[nextContract.contractCode] || [];
        const oldBar = sortedBars.find((b) => String(b.time).slice(0, 10) === rollDate) || sortedBars[sortedBars.length - 1];
        const newBar = nextBars.find((b) => String(b.time).slice(0, 10) === rollDate) || nextBars[0];

        if (oldBar && newBar && oldBar.close > 0 && newBar.close > 0) {
          const diff = newBar.close - oldBar.close;
          const ratio = newBar.close / oldBar.close;
          adjustments.push({ rollDate, diff, ratio });
        }
      }
    }

    // Apply backward adjustments if requested
    if (input.method === 'BACKWARD_DIFFERENCE' && adjustments.length > 0) {
      // Apply backward cumulative diff from latest to earliest
      for (let a = adjustments.length - 1; a >= 0; a--) {
        const adj = adjustments[a];
        cumulativeAdditiveAdjustment += adj.diff;

        for (const bar of continuousBars) {
          if (String(bar.time).slice(0, 10) <= adj.rollDate) {
            bar.open = +(bar.open + adj.diff).toFixed(2);
            bar.high = +(bar.high + adj.diff).toFixed(2);
            bar.low = +(bar.low + adj.diff).toFixed(2);
            bar.close = +(bar.close + adj.diff).toFixed(2);
          }
        }
      }
    } else if (input.method === 'PROPORTIONAL_RATIO' && adjustments.length > 0) {
      for (let a = adjustments.length - 1; a >= 0; a--) {
        const adj = adjustments[a];
        cumulativeMultiplicativeRatio *= adj.ratio;

        for (const bar of continuousBars) {
          if (String(bar.time).slice(0, 10) <= adj.rollDate) {
            bar.open = +(bar.open * adj.ratio).toFixed(2);
            bar.high = +(bar.high * adj.ratio).toFixed(2);
            bar.low = +(bar.low * adj.ratio).toFixed(2);
            bar.close = +(bar.close * adj.ratio).toFixed(2);
          }
        }
      }
    }

    // Final sorting check
    continuousBars.sort((a, b) => String(a.time).localeCompare(String(b.time)));

    return {
      underlying: input.underlying,
      method: input.method,
      bars: continuousBars,
      rollDates,
      count: continuousBars.length,
    };
  }
}
