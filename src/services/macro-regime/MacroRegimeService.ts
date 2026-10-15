import { MacroRegimeOrchestrator } from '../../lib/macro-regime/MacroRegimeOrchestrator.ts';
import { getFixtureMacroObservations } from './__tests__/macroFixtures.ts';
import { cached } from '../market/marketDataCache.ts';

export class MacroRegimeService {
  public static async getSnapshot(options?: {
    asOfDate?: string;
    forceRefresh?: boolean;
  }): Promise<any> {
    const asOfDate = options?.asOfDate ?? new Date().toISOString().slice(0, 10);
    const key = `macro_regime_snapshot_${asOfDate}`;

    const fetcher = async () => {
      const observations = getFixtureMacroObservations();
      return MacroRegimeOrchestrator.buildSnapshot({
        observations,
        asOfDate,
      });
    };

    if (options?.forceRefresh) {
      return fetcher();
    }
    return cached(key, fetcher, 30000);
  }
}
