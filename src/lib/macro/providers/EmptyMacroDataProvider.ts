/**
 * PHASE 19.1 — FAIL-CLOSED EMPTY MACRO DATA PROVIDER
 * ===================================================
 * Safe baseline provider that returns NO_DATA status.
 * STRICT: Absolutely no mock, random, or synthetic data generation.
 */

import type {
  MacroIndicator,
  MacroIndicatorCategory,
  MacroCountry,
} from '../../../types/macro.ts';
import type { MacroDataProvider, MacroProviderHealth } from './MacroDataProvider.ts';
import {
  getRegisteredIndicator,
  getAllRegisteredIndicators,
  getIndicatorsByCategory,
  getIndicatorsByCountry,
} from '../registry/indicatorRegistry.ts';

export class EmptyMacroDataProvider implements MacroDataProvider {
  public readonly id = 'empty-macro-provider';
  public readonly name = 'Safe Empty Macro Provider (Phase 19.1 Baseline)';

  /**
   * Helper to construct a canonical NO_DATA representation for a registered indicator
   */
  private createNoDataIndicator(code: string): MacroIndicator | null {
    const def = getRegisteredIndicator(code);
    if (!def) return null;

    const nowIso = new Date().toISOString();
    return {
      id: `macro_${def.code.toLowerCase()}_nodata`,
      code: def.code,
      name: def.name,
      country: def.country,
      category: def.category,
      value: null,
      previousValue: null,
      expectedValue: null,
      unit: def.unit,
      observationDate: nowIso.split('T')[0],
      publishedAt: nowIso,
      source: def.defaultSource,
      sourceUrl: '',
      frequency: def.frequency,
      status: 'NO_DATA',
      confidence: 1.0,
      metadata: {
        reason: 'PHASE_19_1_DATA_PROVIDER_NOT_CONNECTED',
      },
    };
  }

  public async getIndicator(code: string): Promise<MacroIndicator | null> {
    return this.createNoDataIndicator(code);
  }

  public async getIndicators(codes?: readonly string[]): Promise<readonly MacroIndicator[]> {
    if (codes && codes.length > 0) {
      return codes
        .map((c) => this.createNoDataIndicator(c))
        .filter((ind): ind is MacroIndicator => ind !== null);
    }

    return getAllRegisteredIndicators()
      .map((def) => this.createNoDataIndicator(def.code))
      .filter((ind): ind is MacroIndicator => ind !== null);
  }

  public async getLatestByCategory(
    category: MacroIndicatorCategory
  ): Promise<readonly MacroIndicator[]> {
    return getIndicatorsByCategory(category)
      .map((def) => this.createNoDataIndicator(def.code))
      .filter((ind): ind is MacroIndicator => ind !== null);
  }

  public async getLatestByCountry(
    country: MacroCountry
  ): Promise<readonly MacroIndicator[]> {
    return getIndicatorsByCountry(country)
      .map((def) => this.createNoDataIndicator(def.code))
      .filter((ind): ind is MacroIndicator => ind !== null);
  }

  public async getHealthStatus(): Promise<MacroProviderHealth> {
    return {
      providerId: this.id,
      providerName: this.name,
      status: 'NO_DATA',
      lastChecked: new Date().toISOString(),
      message: 'Phase 19.1 baseline provider active. No external data feeds connected yet.',
    };
  }
}
