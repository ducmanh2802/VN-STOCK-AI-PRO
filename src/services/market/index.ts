import { MarketDataProvider } from '../../types/provider';
import { MockMarketDataProvider } from './MockMarketDataProvider';

// Singleton instance of the data provider
// In Phase 10 or when real API is configured, simply replace MockMarketDataProvider with RealMarketDataProvider
export const marketDataProvider: MarketDataProvider = new MockMarketDataProvider();
export const marketService: MarketDataProvider = marketDataProvider;

export * from './MockMarketDataProvider';
export * from '../../types/provider';
