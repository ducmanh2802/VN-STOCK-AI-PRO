import { eq, desc } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { foreignTrading, moneyFlows } from '../../db/schema.ts';
import type { InferSelectModel } from 'drizzle-orm';

export type ForeignTradingRow = InferSelectModel<typeof foreignTrading>;
export type MoneyFlowRow = InferSelectModel<typeof moneyFlows>;

export class MoneyFlowRepository {
  /**
   * Retrieves the most recent foreign trading record for a given stock.
   */
  static async getLatestForeign(stockId: number): Promise<ForeignTradingRow | null> {
    try {
      const results = await db
        .select()
        .from(foreignTrading)
        .where(eq(foreignTrading.stockId, stockId))
        .orderBy(desc(foreignTrading.date))
        .limit(1);

      return results[0] ?? null;
    } catch (error) {
      console.error(`MoneyFlowRepository.getLatestForeign(${stockId}) failed:`, error);
      return null;
    }
  }

  /**
   * Retrieves historical foreign trading records.
   */
  static async getForeignHistory(stockId: number, limit: number = 30): Promise<ForeignTradingRow[]> {
    try {
      return await db
        .select()
        .from(foreignTrading)
        .where(eq(foreignTrading.stockId, stockId))
        .orderBy(desc(foreignTrading.date))
        .limit(limit);
    } catch (error) {
      console.error(`MoneyFlowRepository.getForeignHistory(${stockId}) failed:`, error);
      return [];
    }
  }

  /**
   * Retrieves the latest institutional/order flow record for a given stock.
   */
  static async getLatestMoneyFlow(stockId: number): Promise<MoneyFlowRow | null> {
    try {
      const results = await db
        .select()
        .from(moneyFlows)
        .where(eq(moneyFlows.stockId, stockId))
        .orderBy(desc(moneyFlows.date))
        .limit(1);

      return results[0] ?? null;
    } catch (error) {
      console.error(`MoneyFlowRepository.getLatestMoneyFlow(${stockId}) failed:`, error);
      return null;
    }
  }
}
