/**
 * PHASE 23 — CORPORATE ACTIONS DATA PROVIDER
 * ==========================================
 * Real data provider for Vietnamese corporate actions disclosures and historical prices.
 *
 * SOURCE HIERARCHY:
 * - Tier 1 & 2: VSDC & Exchange official notices via VietnamCorporateActionsRegistry.
 * - Tier 4: KBS Securities historical OHLCV for previous close lookup.
 * - Tier 4: VPS Securities live quote for current market price.
 *
 * STRICT FAIL-CLOSED: Zero synthetic schedules, zero fake events, zero random ratios.
 */

import { VietnamCorporateActionsRegistry } from '../../lib/corporate-actions/VietnamCorporateActionsRegistry.ts';
import type { CorporateAction } from '../../lib/corporate-actions/types.ts';
import { KbsHistoricalProvider } from '../market/providers/kbs/index.ts';
import { VPSMarketDataProvider } from '../market/providers/VPSMarketDataProvider.ts';

export interface SymbolMarketContext {
  currentPrice: number | null;
  historicalQuotes: Map<string, number>; // Map<dateStr, closePrice>
}

export class CorporateActionDataProvider {
  /**
   * Retrieves verified corporate actions for a symbol from the authoritative registry.
   */
  public static async getCorporateActions(symbol: string): Promise<CorporateAction[]> {
    const sym = symbol.trim().toUpperCase();
    return VietnamCorporateActionsRegistry.getBySymbol(sym);
  }

  /**
   * Retrieves market context (current price and historical closing prices) for corporate action adjustment.
   */
  public static async getMarketContext(symbol: string): Promise<SymbolMarketContext> {
    const sym = symbol.trim().toUpperCase();
    let currentPrice: number | null = null;
    const historicalQuotes = new Map<string, number>();

    // 1. Fetch current price from VPS (best-effort)
    try {
      const vpsProvider = new VPSMarketDataProvider();
      const quote = await vpsProvider.getQuote(sym);
      if (quote && Number.isFinite(quote.price) && quote.price > 0) {
        currentPrice = quote.price;
      }
    } catch {
      // VPS network error handled fail-closed
      currentPrice = null;
    }

    // 2. Fetch historical daily bars from KBS to retrieve prevClose prices (best-effort)
    try {
      const today = new Date().toISOString().slice(0, 10);
      const bars = await KbsHistoricalProvider.getDailyHistory(
        sym,
        '2024-01-01',
        today
      );

      if (bars && Array.isArray(bars)) {
        for (const bar of bars) {
          if (bar && bar.date && Number.isFinite(bar.close) && bar.close > 0) {
            historicalQuotes.set(bar.date, bar.close);
          }
        }
      }
    } catch {
      // KBS historical error handled fail-closed
    }

    return {
      currentPrice,
      historicalQuotes,
    };
  }
}
