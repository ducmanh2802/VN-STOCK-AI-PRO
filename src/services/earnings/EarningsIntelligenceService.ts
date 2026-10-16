import type { EarningsSnapshot, CanonicalFinancialFact, EarningsReportType } from '../../lib/earnings/types.ts';
import { RestatementEngine } from '../../lib/earnings/RestatementEngine.ts';
import { EarningsSnapshotBuilder } from '../../lib/earnings/EarningsSnapshotBuilder.ts';
import { IncomeStatementEngine } from '../../lib/earnings/IncomeStatementEngine.ts';
import { FinancialPeriodEngine } from '../../lib/earnings/FinancialPeriodEngine.ts';
import { EarningsDataProvider, type EarningsFactRequest } from './EarningsDataProvider.ts';
import { cached } from '../market/marketDataCache.ts';

export class EarningsIntelligenceService {
  public static latestFactsFor(
    sym: string,
    reportType: EarningsReportType,
    periodId: string,
    store: RestatementEngine
  ): readonly CanonicalFinancialFact[] {
    const cleanSym = sym.trim().toUpperCase();
    const lineItems = ['NET_REVENUE', 'NET_PROFIT', 'PARENT_NET_PROFIT', 'OPERATING_PROFIT', 'GROSS_PROFIT'];
    const facts: CanonicalFinancialFact[] = [];

    for (const item of lineItems) {
      const versions = store.getVersions(cleanSym, 'INCOME_STATEMENT', reportType, periodId, item);
      const latest = RestatementEngine.pickLatest(versions);
      if (latest && latest.symbol === cleanSym) {
        facts.push(latest);
      }
    }

    return facts;
  }

  public static async getSnapshot(
    symbol: string,
    options?: {
      asOfDate?: string;
      payloads?: EarningsFactRequest[];
      forceRefresh?: boolean;
    }
  ): Promise<EarningsSnapshot> {
    const cleanSymbol = symbol.trim().toUpperCase();
    const asOfDate = options?.asOfDate ?? new Date().toISOString().slice(0, 10);
    const key = `earnings_snapshot_${cleanSymbol}_${asOfDate}`;

    const fetcher = async (): Promise<EarningsSnapshot> => {
      const store = new RestatementEngine();
      let sourceTimestamp: number | null = null;

      if (options?.payloads && options.payloads.length > 0) {
        for (const p of options.payloads) {
          if (p.symbol.toUpperCase() === cleanSymbol) {
            const parsedFacts = EarningsDataProvider.parseDocument(p);
            store.appendMany(parsedFacts);
            if (p.rawPayload.document.publishedAt) {
              const ts = Date.parse(p.rawPayload.document.publishedAt);
              if (!Number.isNaN(ts)) {
                sourceTimestamp = sourceTimestamp ? Math.max(sourceTimestamp, ts) : ts;
              }
            }
          }
        }
      }

      const period = FinancialPeriodEngine.quarter(2024, 1);
      const facts = EarningsIntelligenceService.latestFactsFor(cleanSymbol, 'CONSOLIDATED', period.id, store);
      const income = facts.length > 0 ? IncomeStatementEngine.normalize(facts, period, 'CONSOLIDATED') : null;

      return EarningsSnapshotBuilder.buildSnapshot({
        symbol: cleanSymbol,
        asOfDate,
        income,
        dataFreshness: facts.length > 0 ? 'CURRENT' : 'UNAVAILABLE',
        sourceTimestamp,
      });
    };

    if (options?.forceRefresh) {
      return fetcher();
    }
    return cached(key, fetcher, 30000);
  }
}
