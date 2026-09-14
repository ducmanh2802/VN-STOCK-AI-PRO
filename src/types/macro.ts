/**
 * PHASE 19.1 — MACRO INTELLIGENCE FOUNDATION & DATA CONTRACT
 * ==========================================================
 * Strongly typed domain model for macroeconomic intelligence.
 * Real-data-first, fail-closed, auditable, and immutable.
 */

/**
 * Supported Macro Data Sources (US & Vietnam Central Banks, Treasuries, Stats Agencies)
 */
export type MacroSource =
  | 'FED'
  | 'FRED'
  | 'US_TREASURY'
  | 'SBV'
  | 'GSO_VIETNAM'
  | 'MOF_VIETNAM';

/**
 * Macro Indicator Categories
 */
export type MacroIndicatorCategory =
  | 'INTEREST_RATE'
  | 'INFLATION'
  | 'EMPLOYMENT'
  | 'LIQUIDITY'
  | 'CURRENCY'
  | 'GROWTH'
  | 'CENTRAL_BANK_POLICY';

/**
 * Reporting / Observation Frequency
 */
export type MacroFrequency =
  | 'DAILY'
  | 'WEEKLY'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'EVENT';

/**
 * Data Quality & Availability Status
 * - VALID: Verified real data within freshness threshold
 * - STALE: Verified real data exceeding freshness threshold
 * - INVALID: Corrupted, failed validation, or rejected data
 * - NO_DATA: Explicit unavailable state (no mock, no fake values)
 */
export type MacroDataStatus =
  | 'VALID'
  | 'STALE'
  | 'INVALID'
  | 'NO_DATA';

/**
 * Country / Jurisdiction
 */
export type MacroCountry = 'US' | 'VN' | 'GLOBAL';

/**
 * Static Definition / Metadata for a registered Macroeconomic Indicator
 */
export interface MacroIndicatorDefinition {
  readonly code: string;
  readonly name: string;
  readonly country: MacroCountry;
  readonly category: MacroIndicatorCategory;
  readonly unit: string;
  readonly frequency: MacroFrequency;
  readonly defaultSource: MacroSource;
  readonly description?: string;
  readonly minValue?: number;
  readonly maxValue?: number;
  readonly allowNegative?: boolean;
}

/**
 * Macro Indicator Observation Record
 * Every observation must be grounded in an authoritative source.
 */
export interface MacroIndicator {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly country: MacroCountry;
  readonly category: MacroIndicatorCategory;

  /**
   * Numeric observation value.
   * STRICT: null represents unavailable / no data.
   * NEVER use 0 as a placeholder for missing data.
   */
  readonly value: number | null;
  readonly previousValue: number | null;
  readonly expectedValue?: number | null;

  readonly unit: string;

  /**
   * ISO 8601 Date string for observation period (e.g. "2026-03-01")
   */
  readonly observationDate: string;

  /**
   * ISO 8601 Timestamp of publication/release (e.g. "2026-03-12T13:30:00Z")
   */
  readonly publishedAt: string;

  readonly source: MacroSource;
  readonly sourceUrl: string;

  readonly frequency: MacroFrequency;
  readonly status: MacroDataStatus;

  /**
   * Source reliability & data confidence (0.0 to 1.0)
   */
  readonly confidence: number;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Macro Data Source Configuration & Status
 */
export interface MacroDataSource {
  readonly id: string;
  readonly provider: MacroSource;
  readonly name: string;
  readonly baseUrl: string;
  readonly priority: number;
  readonly requiresApiKey: boolean;
  readonly enabled: boolean;
  readonly reliabilityScore: number; // 0.0 - 1.0
  readonly lastSuccessfulFetch?: string;
  readonly notes?: string;
}

/**
 * Structured Validation Result
 */
export interface MacroDataValidationResult {
  readonly valid: boolean;
  readonly status: MacroDataStatus;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly checkedAt: string;
  readonly sourceTrusted: boolean;
  readonly timestampValid: boolean;
  readonly valueValid: boolean;
}

/**
 * Freshness Thresholds Configuration (in milliseconds)
 */
export interface MacroFreshnessConfig {
  readonly DAILY: number;
  readonly WEEKLY: number;
  readonly MONTHLY: number;
  readonly QUARTERLY: number;
  readonly EVENT: number;
}
