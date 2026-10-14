import { MarketIntelligenceSnapshotBuilder } from '../../lib/analysis/market/MarketIntelligenceSnapshotBuilder.ts';
import type { MarketIntelligenceSnapshot } from '../../lib/analysis/market/types.ts';
import { cached } from './marketDataCache.ts';

export class MarketIntelligenceService {
  public static async getSnapshot(options?: { forceRefresh?: boolean }): Promise<MarketIntelligenceSnapshot> {
    const fetcher = async () => {
      // Build a base snapshot with empty/minimal constituents (or real data when populated)
      return MarketIntelligenceSnapshotBuilder.build({
        indexCandles: [],
        constituents: [],
        dataFreshness: 'CURRENT',
      });
    };

    if (options?.forceRefresh) {
      return fetcher();
    }

    return cached('market_intelligence_snapshot', fetcher, 30000);
  }
}
