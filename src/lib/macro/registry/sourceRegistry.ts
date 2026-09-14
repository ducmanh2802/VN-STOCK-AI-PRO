/**
 * PHASE 19.1 — MACRO SOURCE REGISTRY
 * ==================================
 * Authoritative registry of macroeconomic data sources and providers.
 * Manages provider metadata, priorities, authentication requirements, and reliability scores.
 */

import type { MacroDataSource, MacroSource } from '../../../types/macro.ts';

/**
 * Supported data sources registry
 */
export const MACRO_SOURCE_REGISTRY: readonly MacroDataSource[] = [
  {
    id: 'fed-official',
    provider: 'FED',
    name: 'Board of Governors of the Federal Reserve System',
    baseUrl: 'https://www.federalreserve.gov/data',
    priority: 1,
    requiresApiKey: false,
    enabled: true,
    reliabilityScore: 0.99,
    notes: 'Official US central bank monetary policy, FOMC statements, and policy rates.',
  },
  {
    id: 'fred-stlouis',
    provider: 'FRED',
    name: 'Federal Reserve Bank of St. Louis Economic Data (FRED)',
    baseUrl: 'https://api.stlouisfed.org/fred',
    priority: 1,
    requiresApiKey: true,
    enabled: true,
    reliabilityScore: 0.98,
    notes: 'Primary time-series data repository for US and international macroeconomic statistics.',
  },
  {
    id: 'us-treasury',
    provider: 'US_TREASURY',
    name: 'United States Department of the Treasury',
    baseUrl: 'https://home.treasury.gov/resource-center/data-chart-center',
    priority: 1,
    requiresApiKey: false,
    enabled: true,
    reliabilityScore: 0.99,
    notes: 'US Treasury yield curve, daily treasury par yield curve rates.',
  },
  {
    id: 'sbv-vietnam',
    provider: 'SBV',
    name: 'State Bank of Vietnam (Ngân hàng Nhà nước Việt Nam)',
    baseUrl: 'https://www.sbv.gov.vn',
    priority: 1,
    requiresApiKey: false,
    enabled: true,
    reliabilityScore: 0.95,
    notes: 'Official Vietnam monetary policy rates, central exchange rate, OMO, and banking system liquidity.',
  },
  {
    id: 'gso-vietnam',
    provider: 'GSO_VIETNAM',
    name: 'General Statistics Office of Vietnam (Tổng cục Thống kê)',
    baseUrl: 'https://www.gso.gov.vn',
    priority: 1,
    requiresApiKey: false,
    enabled: true,
    reliabilityScore: 0.95,
    notes: 'National inflation (CPI), quarterly GDP, retail sales, and socio-economic statistical releases.',
  },
  {
    id: 'mof-vietnam',
    provider: 'MOF_VIETNAM',
    name: 'Ministry of Finance Vietnam (Bộ Tài chính)',
    baseUrl: 'https://mof.gov.vn',
    priority: 2,
    requiresApiKey: false,
    enabled: true,
    reliabilityScore: 0.92,
    notes: 'Fiscal policy, public debt, government bond issuance, and state budget reports.',
  },
] as const;

/**
 * Fast lookup map by provider name
 */
const SOURCE_MAP: ReadonlyMap<MacroSource, MacroDataSource> = new Map(
  MACRO_SOURCE_REGISTRY.map((src) => [src.provider, src])
);

/**
 * Get data source configuration by source enum
 */
export function getSourceConfig(source: MacroSource): MacroDataSource | undefined {
  if (!source) return undefined;
  return SOURCE_MAP.get(source);
}

/**
 * Retrieve all registered data sources
 */
export function getAllSources(): readonly MacroDataSource[] {
  return MACRO_SOURCE_REGISTRY;
}

/**
 * Retrieve enabled data sources sorted by priority
 */
export function getEnabledSources(): readonly MacroDataSource[] {
  return MACRO_SOURCE_REGISTRY
    .filter((src) => src.enabled)
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Verify if a provider is a registered, trusted source
 */
export function isSourceTrusted(source: MacroSource): boolean {
  if (!source) return false;
  const cfg = SOURCE_MAP.get(source);
  return !!cfg && cfg.enabled && cfg.reliabilityScore >= 0.8;
}
