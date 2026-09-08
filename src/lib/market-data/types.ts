export type ProviderSource = 'KBS' | 'VNDIRECT' | 'DATABASE' | 'MOCK';
export type DataStatus = 'LIVE' | 'DELAYED' | 'HISTORICAL' | 'UNAVAILABLE';

export interface ResponseMeta {
  source: string;
  status: DataStatus;
  dataStatus?: DataStatus;
  fetchedAt: string;
  freshnessMs: number;
  marketTimestamp: string | null;
}

export * from '../../services/market/types';
