export type MacroCountry = 'US' | 'VN' | 'GLOBAL';

export type MacroFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'EVENT';

export type MacroIndicatorCategory =
  | 'INTEREST_RATE'
  | 'INFLATION'
  | 'EMPLOYMENT'
  | 'ECONOMIC_GROWTH'
  | 'GROWTH'
  | 'LIQUIDITY'
  | 'EXTERNAL_FLOWS'
  | 'HOUSING'
  | 'CONSUMPTION'
  | 'MONETARY_POLICY'
  | 'CENTRAL_BANK_POLICY'
  | 'SENTIMENT'
  | 'BOND_MARKET'
  | 'CURRENCY';

export type MacroDataStatus = 'VALID' | 'STALE' | 'INVALID' | 'UNAVAILABLE' | 'SUSPECT' | 'NO_DATA';

export type MacroDataSource = string;

export interface MacroSource {
  id: string;
  provider: string;
  name: string;
  baseUrl: string;
  priority: number;
  requiresApiKey: boolean;
  enabled: boolean;
  reliabilityScore: number;
  notes: string;
}

export interface MacroFreshnessConfig {
  DAILY: number;
  WEEKLY: number;
  MONTHLY: number;
  QUARTERLY: number;
  EVENT: number;
}

export interface MacroIndicatorDefinition {
  code: string;
  name: string;
  country: MacroCountry;
  category: MacroIndicatorCategory;
  unit: string;
  frequency: MacroFrequency;
  defaultSource: string;
  description: string;
  minValue?: number;
  maxValue?: number;
  allowNegative?: boolean;
}

export interface MacroIndicator {
  id?: string;
  code: string;
  name: string;
  country: MacroCountry;
  category: MacroIndicatorCategory;
  unit: string;
  frequency: MacroFrequency;
  source: string;
  sourceUrl?: string;
  value: number | null;
  previousValue?: number | null;
  expectedValue?: number | null;
  change?: number | null;
  changePercent?: number | null;
  confidence?: number;
  observationDate: string;
  publishedAt?: string;
  publicationDate?: string;
  retrievalTimestamp?: string;
  status: MacroDataStatus;
  isHistorical?: boolean;
  notes?: string;
  metadata?: Record<string, any>;
}

export interface MacroSourceConfig {
  id: string;
  name: string;
  trustLevel: 'TIER_1_STATUTORY' | 'TIER_2_EXCHANGE' | 'TIER_3_SECONDARY' | 'TIER_4_UNVERIFIED';
  url?: string;
  enabled: boolean;
  defaultFreshnessToleranceMs?: number;
}

export interface MacroDataValidationResult {
  isValid: boolean;
  valid?: boolean;
  status: MacroDataStatus;
  errors: readonly string[];
  warnings: readonly string[];
  checkedAt: string;
  sourceTrusted?: boolean;
  timestampValid?: boolean;
  valueValid?: boolean;
}
