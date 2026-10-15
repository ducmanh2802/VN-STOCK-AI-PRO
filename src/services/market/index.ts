import { MarketDataProvider } from '../../types/provider';
import { RealMarketDataProvider, realMarketDataProvider } from './RealMarketDataProvider';

// Singleton instance of the real market data provider (KBS & VPS)
export const marketDataProvider: MarketDataProvider = realMarketDataProvider;
export const marketService: MarketDataProvider = marketDataProvider;

export { RealMarketDataProvider, realMarketDataProvider };
export * from '../../types/provider';
export * from './stockUniverse';
