/**
 * PHASE 19.1 — READ-ONLY MACRO DATA PROVIDER CONTRACT
 * ====================================================
 * Service interface for macroeconomic data providers.
 * Enforces real-data-first, fail-closed contracts for future integrations.
 */

import type {
  MacroIndicator,
  MacroIndicatorCategory,
  MacroCountry,
} from '../../../types/macro.ts';

export interface MacroProviderHealth {
  readonly providerId: string;
  readonly providerName: string;
  readonly status: 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'NO_DATA';
  readonly lastChecked: string;
  readonly message?: string;
}

export interface MacroDataProvider {
  /**
   * Fetch a single indicator observation by its unique code.
   * Returns null if no verified observation exists.
   */
  getIndicator(code: string): Promise<MacroIndicator | null>;

  /**
   * Fetch multiple indicators by their unique codes.
   * If codes is omitted, fetches all available indicators.
   */
  getIndicators(codes?: readonly string[]): Promise<readonly MacroIndicator[]>;

  /**
   * Fetch indicators filtered by category.
   */
  getLatestByCategory(category: MacroIndicatorCategory): Promise<readonly MacroIndicator[]>;

  /**
   * Fetch indicators filtered by country jurisdiction.
   */
  getLatestByCountry(country: MacroCountry): Promise<readonly MacroIndicator[]>;

  /**
   * Provider health check & connectivity status
   */
  getHealthStatus(): Promise<MacroProviderHealth>;
}
