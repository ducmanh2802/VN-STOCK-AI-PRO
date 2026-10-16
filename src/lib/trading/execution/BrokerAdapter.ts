export interface BrokerPosition {
  symbol: string;
  quantity: number;
  averageCost: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnL: number;
  unrealizedPnLPercent?: number;
  lastUpdated?: string;
}

export interface BrokerAccount {
  cash: number;
  totalEquity: number;
  positions: BrokerPosition[];
  buyingPower?: number;
  realizedPnL?: number;
}
