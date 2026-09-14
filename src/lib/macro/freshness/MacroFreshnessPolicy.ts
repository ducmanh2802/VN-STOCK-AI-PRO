/**
 * PHASE 19.1 — MACRO FRESHNESS POLICY
 * ===================================
 * Centralized freshness rules and age evaluation for macroeconomic indicators.
 * Prevents stale data from polluting downstream quantitative models.
 */

import type { MacroFrequency, MacroFreshnessConfig } from '../../../types/macro.ts';

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

/**
 * Standard Default Freshness Thresholds (in milliseconds)
 */
export const DEFAULT_MACRO_FRESHNESS_CONFIG: Readonly<MacroFreshnessConfig> = {
  DAILY: 72 * ONE_HOUR_MS, // 72 hours (covers weekend delays)
  WEEKLY: 10 * ONE_DAY_MS, // 10 days
  MONTHLY: 45 * ONE_DAY_MS, // 45 days (covers release lag for month-end data)
  QUARTERLY: 120 * ONE_DAY_MS, // 120 days (covers 90 days quarter + 30 days reporting lag)
  EVENT: 90 * ONE_DAY_MS, // 90 days default for discrete policy events
};

export class MacroFreshnessPolicy {
  private readonly config: MacroFreshnessConfig;

  constructor(customConfig?: Partial<MacroFreshnessConfig>) {
    this.config = {
      ...DEFAULT_MACRO_FRESHNESS_CONFIG,
      ...customConfig,
    };
  }

  /**
   * Get maximum allowed age in milliseconds for a given frequency
   */
  public getMaxAgeMs(frequency: MacroFrequency): number {
    switch (frequency) {
      case 'DAILY':
        return this.config.DAILY;
      case 'WEEKLY':
        return this.config.WEEKLY;
      case 'MONTHLY':
        return this.config.MONTHLY;
      case 'QUARTERLY':
        return this.config.QUARTERLY;
      case 'EVENT':
        return this.config.EVENT;
      default:
        return this.config.MONTHLY;
    }
  }

  /**
   * Calculate data age in milliseconds from timestamp to reference time
   */
  public getAgeMs(timestamp: string | Date | number, referenceTime: Date = new Date()): number {
    const timeMs = typeof timestamp === 'number'
      ? timestamp
      : timestamp instanceof Date
        ? timestamp.getTime()
        : new Date(timestamp).getTime();

    if (Number.isNaN(timeMs)) {
      return Number.MAX_SAFE_INTEGER;
    }

    return referenceTime.getTime() - timeMs;
  }

  /**
   * Check if a timestamp is within the freshness threshold
   */
  public isFresh(
    timestamp: string | Date | number,
    frequency: MacroFrequency,
    referenceTime: Date = new Date()
  ): boolean {
    const ageMs = this.getAgeMs(timestamp, referenceTime);
    if (ageMs < 0) {
      // Future timestamp is invalid, not fresh
      return false;
    }
    const maxAgeMs = this.getMaxAgeMs(frequency);
    return ageMs <= maxAgeMs;
  }

  /**
   * Return structured freshness classification
   */
  public evaluateFreshness(
    timestamp: string | Date | number,
    frequency: MacroFrequency,
    referenceTime: Date = new Date()
  ): {
    isFresh: boolean;
    ageMs: number;
    maxAgeMs: number;
    status: 'FRESH' | 'STALE' | 'FUTURE_INVALID' | 'TIMESTAMP_INVALID';
  } {
    const timeMs = typeof timestamp === 'number'
      ? timestamp
      : timestamp instanceof Date
        ? timestamp.getTime()
        : new Date(timestamp).getTime();

    if (Number.isNaN(timeMs)) {
      return {
        isFresh: false,
        ageMs: Number.MAX_SAFE_INTEGER,
        maxAgeMs: this.getMaxAgeMs(frequency),
        status: 'TIMESTAMP_INVALID',
      };
    }

    const ageMs = referenceTime.getTime() - timeMs;
    const maxAgeMs = this.getMaxAgeMs(frequency);

    if (ageMs < 0) {
      return {
        isFresh: false,
        ageMs,
        maxAgeMs,
        status: 'FUTURE_INVALID',
      };
    }

    const isFresh = ageMs <= maxAgeMs;
    return {
      isFresh,
      ageMs,
      maxAgeMs,
      status: isFresh ? 'FRESH' : 'STALE',
    };
  }
}

/**
 * Singleton Default Policy Instance
 */
export const defaultMacroFreshnessPolicy = new MacroFreshnessPolicy();
