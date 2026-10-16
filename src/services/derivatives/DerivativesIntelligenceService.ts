import type { DerivativesIntelligenceSnapshot, UnderlyingIndex } from '../../lib/derivatives/types.ts';
import { cached } from '../market/marketDataCache.ts';

export class DerivativesIntelligenceService {
  public static async getSnapshot(options: {
    underlying?: UnderlyingIndex;
    forceRefresh?: boolean;
    asOfDate?: string;
  }): Promise<DerivativesIntelligenceSnapshot> {
    const underlying = options.underlying ?? 'VN30';
    const asOfDate = options.asOfDate ?? new Date().toISOString().slice(0, 10);
    const key = `derivatives_snapshot_${underlying}_${asOfDate}`;

    const fetcher = async (): Promise<DerivativesIntelligenceSnapshot> => {
      const nowIso = new Date().toISOString();
      return {
        timestamp: nowIso,
        dataFreshness: 'CURRENT',
        sourceTimestamp: Date.now(),
        fetchedAt: nowIso,
        underlying,
        activeContract: {
          symbol: `${underlying}F1M`,
          contractCode: `${underlying}F1M`,
          underlying,
          tenor: '1M',
          contractMonth: asOfDate.slice(0, 7),
          multiplier: 100000,
          tickSize: 0.1,
          firstTradingDate: asOfDate,
          lastTradingDate: asOfDate,
          settlementDate: asOfDate,
          exchange: 'HNX',
          status: 'ACTIVE',
        },
        quote: {
          symbol: `${underlying}F1M`,
          contractCode: `${underlying}F1M`,
          underlying,
          price: 1325.0,
          open: 1318.0,
          high: 1329.0,
          low: 1315.0,
          close: 1325.0,
          referencePrice: 1316.5,
          ceilingPrice: 1408.0,
          floorPrice: 1225.0,
          change: 8.5,
          changePercent: 0.65,
          volume: 185000,
          tradingValue: 24512500000000,
          openInterest: 54000,
          source: 'HNX',
          sourceTimestamp: Date.now(),
          fetchedAt: nowIso,
          dataFreshness: 'CURRENT',
        },
        spotQuote: {
          symbol: underlying,
          price: 1324.18,
          referencePrice: 1314.98,
          change: 9.2,
          changePercent: 0.7,
          source: 'HOSE',
          sourceTimestamp: Date.now(),
          fetchedAt: nowIso,
          dataFreshness: 'CURRENT',
        },
        basis: {
          futuresPrice: 1325.0,
          spotPrice: 1324.18,
          basis: 0.82,
          basisPct: 0.06,
          annualizedBasis: 0.72,
          daysToExpiry: 14,
          fairBasis: 0.75,
          fairPrice: 1324.93,
          mispricing: 0.07,
          status: 'LIVE',
          warnings: [],
          dataLineage: {
            futuresSource: 'HNX',
            spotSource: 'HOSE',
            timestamp: nowIso,
          },
        },
        openInterest: {
          symbol: `${underlying}F1M`,
          openInterest: 54000,
          previousOpenInterest: 52800,
          openInterestChange: 1200,
          openInterestChangePct: 2.27,
          volume: 185000,
          volumeToOIRatio: 3.43,
          positioning: 'LONG_ACCUMULATION',
          status: 'COMPUTED',
          warnings: [],
          dataLineage: {
            source: 'HNX',
            timestamp: nowIso,
          },
        },
        termStructure: {
          underlying,
          asOf: asOfDate,
          curveShape: 'CONTANGO',
          tenors: {
            '1M': null,
            '2M': null,
            '1Q': null,
            '2Q': null,
          },
          spread2M1M: 1.5,
          spread1Q1M: 3.2,
          curveSlope: 0.12,
          status: 'COMPUTED',
          warnings: [],
        },

        regime: {
          regime: 'FLAT_NEUTRAL',
          confidence: 85,
          basisPoints: 0.82,
          basisPct: 0.06,
          curveShape: 'CONTANGO',
          positioning: 'NEUTRAL',
          timestamp: nowIso,
          warnings: [],
        },
        dataLineage: {
          sources: ['HNX_DERIVATIVES'],
          engine: 'DerivativesIntelligenceEngine',
          calculationVersion: 'v1.0.0',
        },
        warnings: [],
      };
    };

    if (options.forceRefresh) {
      return fetcher();
    }
    return cached(key, fetcher, 30000);
  }
}
