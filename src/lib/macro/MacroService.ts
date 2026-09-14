/**
 * PHASE 19.1 — MACRO INTELLIGENCE SERVICE
 * =======================================
 * Unified service coordinating macroeconomic providers, validation, and registry access.
 */

import type {
  MacroIndicator,
  MacroIndicatorDefinition,
  MacroDataSource,
  MacroIndicatorCategory,
  MacroCountry,
  MacroDataValidationResult,
} from '../../types/macro.ts';
import type { MacroDataProvider, MacroProviderHealth } from './providers/MacroDataProvider.ts';
import { EmptyMacroDataProvider } from './providers/EmptyMacroDataProvider.ts';
import {
  getAllRegisteredIndicators,
  getRegisteredIndicator,
  getIndicatorsByCategory,
  getIndicatorsByCountry,
} from './registry/indicatorRegistry.ts';
import {
  getAllSources,
  getSourceConfig,
} from './registry/sourceRegistry.ts';
import { MacroDataValidator } from './validation/MacroDataValidator.ts';

export class MacroService {
  private readonly provider: MacroDataProvider;

  constructor(provider?: MacroDataProvider) {
    this.provider = provider ?? new EmptyMacroDataProvider();
  }

  /**
   * Get all registered indicator definitions
   */
  public getDefinitions(): readonly MacroIndicatorDefinition[] {
    return getAllRegisteredIndicators();
  }

  /**
   * Get specific indicator definition
   */
  public getDefinition(code: string): MacroIndicatorDefinition | undefined {
    return getRegisteredIndicator(code);
  }

  /**
   * Get definitions filtered by category
   */
  public getDefinitionsByCategory(
    category: MacroIndicatorCategory
  ): readonly MacroIndicatorDefinition[] {
    return getIndicatorsByCategory(category);
  }

  /**
   * Get definitions filtered by country
   */
  public getDefinitionsByCountry(country: MacroCountry): readonly MacroIndicatorDefinition[] {
    return getIndicatorsByCountry(country);
  }

  /**
   * Get all registered data sources
   */
  public getSources(): readonly MacroDataSource[] {
    return getAllSources();
  }

  /**
   * Fetch and validate a single indicator
   */
  public async getIndicator(code: string): Promise<{
    indicator: MacroIndicator | null;
    validation: MacroDataValidationResult | null;
  }> {
    const raw = await this.provider.getIndicator(code);
    if (!raw) {
      return { indicator: null, validation: null };
    }

    const validation = MacroDataValidator.validate(raw);
    return {
      indicator: raw,
      validation,
    };
  }

  /**
   * Fetch all indicators
   */
  public async getAllIndicators(): Promise<readonly MacroIndicator[]> {
    return this.provider.getIndicators();
  }

  /**
   * Fetch indicators by category
   */
  public async getIndicatorsByCategory(
    category: MacroIndicatorCategory
  ): Promise<readonly MacroIndicator[]> {
    return this.provider.getLatestByCategory(category);
  }

  /**
   * Fetch indicators by country
   */
  public async getIndicatorsByCountry(
    country: MacroCountry
  ): Promise<readonly MacroIndicator[]> {
    return this.provider.getLatestByCountry(country);
  }

  /**
   * Service health status
   */
  public async getHealth(): Promise<MacroProviderHealth> {
    return this.provider.getHealthStatus();
  }
}

/**
 * Singleton Default Macro Service
 */
export const defaultMacroService = new MacroService();
