export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface EnterpriseMetric {
  name: string;
  value: number | string | null;
  unit?: string;
  source?: string;
  confidence: ConfidenceLevel;
}
