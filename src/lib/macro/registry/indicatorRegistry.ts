/**
 * PHASE 19.1 — MACRO INDICATOR REGISTRY
 * =====================================
 * Canonical registry of supported macroeconomic indicators across US, Vietnam, and Global domains.
 * All indicators are strictly typed with jurisdiction, frequency, unit, and default source.
 */

import type {
  MacroIndicatorDefinition,
  MacroIndicatorCategory,
  MacroCountry,
} from '../../../types/macro.ts';

/**
 * Complete canonical registry of supported indicators
 */
export const MACRO_INDICATOR_REGISTRY: readonly MacroIndicatorDefinition[] = [
  // =========================================================================
  // UNITED STATES / FEDERAL RESERVE INDICATORS
  // =========================================================================
  {
    code: 'FED_FUNDS_RATE',
    name: 'Federal Funds Effective Rate (FFR)',
    country: 'US',
    category: 'INTEREST_RATE',
    unit: '%',
    frequency: 'DAILY',
    defaultSource: 'FED',
    description: 'Target benchmark rate set by the FOMC for overnight lending between depository institutions.',
    minValue: -5,
    maxValue: 30,
    allowNegative: true,
  },
  {
    code: 'FED_POLICY_STANCE',
    name: 'Fed Policy Stance / Statement Sentiment',
    country: 'US',
    category: 'CENTRAL_BANK_POLICY',
    unit: 'Score (-1 to +1)',
    frequency: 'EVENT',
    defaultSource: 'FED',
    description: 'Quantitative scoring of FOMC policy statements and rate guidance (Hawkish > 0, Dovish < 0).',
    minValue: -1,
    maxValue: 1,
    allowNegative: true,
  },
  {
    code: 'FOMC_NEXT_MEETING',
    name: 'Next FOMC Meeting Schedule',
    country: 'US',
    category: 'CENTRAL_BANK_POLICY',
    unit: 'Epoch ms / Days',
    frequency: 'EVENT',
    defaultSource: 'FED',
    description: 'Scheduled date of upcoming Federal Open Market Committee rate decisions.',
    minValue: 0,
    allowNegative: false,
  },
  {
    code: 'US_CPI',
    name: 'US Consumer Price Index (Headline YoY)',
    country: 'US',
    category: 'INFLATION',
    unit: '% YoY',
    frequency: 'MONTHLY',
    defaultSource: 'FRED',
    description: 'Year-over-year headline inflation index published by the Bureau of Labor Statistics / FRED.',
    minValue: -20,
    maxValue: 100,
    allowNegative: true,
  },
  {
    code: 'US_CORE_CPI',
    name: 'US Core CPI (Excluding Food & Energy YoY)',
    country: 'US',
    category: 'INFLATION',
    unit: '% YoY',
    frequency: 'MONTHLY',
    defaultSource: 'FRED',
    description: 'Underlying inflation measure excluding volatile food and energy components.',
    minValue: -10,
    maxValue: 50,
    allowNegative: true,
  },
  {
    code: 'US_PCE',
    name: 'US Personal Consumption Expenditures Price Index (Headline YoY)',
    country: 'US',
    category: 'INFLATION',
    unit: '% YoY',
    frequency: 'MONTHLY',
    defaultSource: 'FRED',
    description: 'The Federal Reserve primary preferred headline inflation gauge.',
    minValue: -10,
    maxValue: 50,
    allowNegative: true,
  },
  {
    code: 'US_CORE_PCE',
    name: 'US Core PCE Price Index (YoY)',
    country: 'US',
    category: 'INFLATION',
    unit: '% YoY',
    frequency: 'MONTHLY',
    defaultSource: 'FRED',
    description: 'The Federal Reserve primary preferred core inflation gauge (excluding food & energy).',
    minValue: -10,
    maxValue: 50,
    allowNegative: true,
  },
  {
    code: 'US_UNEMPLOYMENT',
    name: 'US Civilian Unemployment Rate (U-3)',
    country: 'US',
    category: 'EMPLOYMENT',
    unit: '%',
    frequency: 'MONTHLY',
    defaultSource: 'FRED',
    description: 'Seasonally adjusted percentage of the labor force that is unemployed.',
    minValue: 0,
    maxValue: 40,
    allowNegative: false,
  },
  {
    code: 'US_NFP',
    name: 'US Non-Farm Payrolls Change',
    country: 'US',
    category: 'EMPLOYMENT',
    unit: 'Thousands',
    frequency: 'MONTHLY',
    defaultSource: 'FRED',
    description: 'Monthly change in total non-farm payroll employment from BLS/FRED.',
    minValue: -30000,
    maxValue: 30000,
    allowNegative: true,
  },
  {
    code: 'US_10Y_YIELD',
    name: 'US 10-Year Treasury Benchmark Yield',
    country: 'US',
    category: 'INTEREST_RATE',
    unit: '%',
    frequency: 'DAILY',
    defaultSource: 'US_TREASURY',
    description: 'Market yield on 10-year US Treasury constant maturities (global risk-free benchmark).',
    minValue: -2,
    maxValue: 30,
    allowNegative: true,
  },
  {
    code: 'US_2Y_YIELD',
    name: 'US 2-Year Treasury Benchmark Yield',
    country: 'US',
    category: 'INTEREST_RATE',
    unit: '%',
    frequency: 'DAILY',
    defaultSource: 'US_TREASURY',
    description: 'Market yield on 2-year US Treasury maturities (sensitive to near-term Fed policy).',
    minValue: -2,
    maxValue: 30,
    allowNegative: true,
  },
  {
    code: 'US_DXY',
    name: 'US Dollar Index (DXY)',
    country: 'US',
    category: 'CURRENCY',
    unit: 'Index Points',
    frequency: 'DAILY',
    defaultSource: 'FRED',
    description: 'Geometric trade-weighted basket index of USD against six major world currencies.',
    minValue: 10,
    maxValue: 300,
    allowNegative: false,
  },
  {
    code: 'FED_BALANCE_SHEET',
    name: 'Federal Reserve Total Assets (Quantitative Tightening/Easing)',
    country: 'US',
    category: 'LIQUIDITY',
    unit: 'Trillion USD',
    frequency: 'WEEKLY',
    defaultSource: 'FRED',
    description: 'Total assets on the Federal Reserve balance sheet (WALCL on FRED).',
    minValue: 0.1,
    maxValue: 50.0,
    allowNegative: false,
  },

  // =========================================================================
  // VIETNAM / STATE BANK OF VIETNAM & GSO INDICATORS
  // =========================================================================
  {
    code: 'SBV_REFINANCING_RATE',
    name: 'Lãi suất tái cấp vốn NHNN (Refinancing Rate)',
    country: 'VN',
    category: 'INTEREST_RATE',
    unit: '%',
    frequency: 'EVENT',
    defaultSource: 'SBV',
    description: 'Key policy rate set by State Bank of Vietnam for liquidity refinancing to commercial banks.',
    minValue: 0,
    maxValue: 30,
    allowNegative: false,
  },
  {
    code: 'SBV_DISCOUNT_RATE',
    name: 'Lãi suất tái chiết khấu NHNN (Discount Rate)',
    country: 'VN',
    category: 'INTEREST_RATE',
    unit: '%',
    frequency: 'EVENT',
    defaultSource: 'SBV',
    description: 'Interest rate charged by SBV on commercial banks discounting valuable papers.',
    minValue: 0,
    maxValue: 30,
    allowNegative: false,
  },
  {
    code: 'SBV_OMO_RATE',
    name: 'Lãi suất nghiệp vụ thị trường mở OMO (Open Market Operations Rate)',
    country: 'VN',
    category: 'INTEREST_RATE',
    unit: '%',
    frequency: 'DAILY',
    defaultSource: 'SBV',
    description: 'Interest rate applied by SBV for Reverse Repo / T-Bill open market operations.',
    minValue: 0,
    maxValue: 30,
    allowNegative: false,
  },
  {
    code: 'VN_DEPOSIT_RATE',
    name: 'Lãi suất huy động tiền gửi bình quân 12T (Average 12M Deposit Rate)',
    country: 'VN',
    category: 'INTEREST_RATE',
    unit: '%',
    frequency: 'MONTHLY',
    defaultSource: 'SBV',
    description: 'Average 12-month deposit interest rate across Big 4 and major commercial joint-stock banks in Vietnam.',
    minValue: 0,
    maxValue: 35,
    allowNegative: false,
  },
  {
    code: 'VN_LENDING_RATE',
    name: 'Lãi suất cho vay bình quân (Average Lending Rate)',
    country: 'VN',
    category: 'INTEREST_RATE',
    unit: '%',
    frequency: 'MONTHLY',
    defaultSource: 'SBV',
    description: 'Average commercial lending rate for corporate and retail credit in Vietnam.',
    minValue: 0,
    maxValue: 40,
    allowNegative: false,
  },
  {
    code: 'VN_CREDIT_GROWTH',
    name: 'Tăng trưởng tín dụng toàn hệ thống (Credit Growth YoY/YTD)',
    country: 'VN',
    category: 'LIQUIDITY',
    unit: '%',
    frequency: 'MONTHLY',
    defaultSource: 'SBV',
    description: 'System-wide banking credit expansion relative to SBV annual target.',
    minValue: -10,
    maxValue: 60,
    allowNegative: true,
  },
  {
    code: 'VN_CPI',
    name: 'Chỉ số giá tiêu dùng CPI Việt Nam (YoY)',
    country: 'VN',
    category: 'INFLATION',
    unit: '% YoY',
    frequency: 'MONTHLY',
    defaultSource: 'GSO_VIETNAM',
    description: 'Monthly year-over-year headline inflation published by Vietnam General Statistics Office.',
    minValue: -10,
    maxValue: 50,
    allowNegative: true,
  },
  {
    code: 'VN_GDP_GROWTH',
    name: 'Tăng trưởng GDP Việt Nam (Real GDP Growth YoY)',
    country: 'VN',
    category: 'GROWTH',
    unit: '% YoY',
    frequency: 'QUARTERLY',
    defaultSource: 'GSO_VIETNAM',
    description: 'Quarterly real gross domestic product growth rate announced by General Statistics Office.',
    minValue: -20,
    maxValue: 30,
    allowNegative: true,
  },
  {
    code: 'USD_VND',
    name: 'Tỷ giá USD/VND trung tâm & liên ngân hàng',
    country: 'VN',
    category: 'CURRENCY',
    unit: 'VND',
    frequency: 'DAILY',
    defaultSource: 'SBV',
    description: 'Official central exchange rate and interbank USD/VND spot exchange rate.',
    minValue: 10000,
    maxValue: 50000,
    allowNegative: false,
  },
  {
    code: 'VN_M2_GROWTH',
    name: 'Tăng trưởng cung tiền M2 Việt Nam (YoY)',
    country: 'VN',
    category: 'LIQUIDITY',
    unit: '% YoY',
    frequency: 'MONTHLY',
    defaultSource: 'SBV',
    description: 'Broad money supply (M2) expansion rate across the Vietnam banking system.',
    minValue: -10,
    maxValue: 60,
    allowNegative: true,
  },
] as const;

/**
 * Fast Lookup Map by Code
 */
const INDICATOR_MAP: ReadonlyMap<string, MacroIndicatorDefinition> = new Map(
  MACRO_INDICATOR_REGISTRY.map((def) => [def.code, def])
);

/**
 * Retrieve a registered indicator definition by code
 */
export function getRegisteredIndicator(code: string): MacroIndicatorDefinition | undefined {
  if (!code || typeof code !== 'string') return undefined;
  return INDICATOR_MAP.get(code.trim().toUpperCase());
}

/**
 * Check if indicator code is registered
 */
export function isIndicatorCodeRegistered(code: string): boolean {
  if (!code || typeof code !== 'string') return false;
  return INDICATOR_MAP.has(code.trim().toUpperCase());
}

/**
 * Retrieve all registered indicator definitions
 */
export function getAllRegisteredIndicators(): readonly MacroIndicatorDefinition[] {
  return MACRO_INDICATOR_REGISTRY;
}

/**
 * Filter registered indicators by category
 */
export function getIndicatorsByCategory(
  category: MacroIndicatorCategory
): readonly MacroIndicatorDefinition[] {
  return MACRO_INDICATOR_REGISTRY.filter((ind) => ind.category === category);
}

/**
 * Filter registered indicators by country
 */
export function getIndicatorsByCountry(
  country: MacroCountry
): readonly MacroIndicatorDefinition[] {
  return MACRO_INDICATOR_REGISTRY.filter((ind) => ind.country === country);
}
