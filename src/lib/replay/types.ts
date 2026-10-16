export interface ReplayManifest {
  replayId: string;
  createdAt: string;
  datasetId: string;
  datasetVersion: string;
  strategyId: string;
  strategyVersion: string;
  decisionVersion: string;
  riskModelVersion: string;
  positionSizingVersion: string;
  executionModelVersion: string;
  costModelVersion: string;
  universe: string[];
  startDate: string;
  endDate: string;
  initialCapital: number;
  currency: string;
  seed: any;
  mode: string;
  configuration: Record<string, any>;
  codeVersion: string;
  schemaVersion: string;
  provider: string;
  dataQuality: string;
  corporateActionPolicy: string;
  pointInTimePolicy: string;
}

export interface ReplayResult {
  replayId: string;
  status: string;
  manifest: ReplayManifest;
  fingerprint: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  finalNAV: number;
  returnPct: number;
  orders: any[];
  fills: any[];
  strategyTradeCount: number;
  riskRejectionCount: number;
  executionRejectionCount: number;
  filledQuantity: number;
  accountingStatus: string;
  reconciliationStatus: string;
  dataWarnings: string[];
  limitations: string[];
  events: any[];
  checkpoints: any[];
}
