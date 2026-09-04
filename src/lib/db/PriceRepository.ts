import { eq, and, gte, lte, desc, asc } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { stockDaily, stockIntraday } from '../../db/schema.ts';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

export type StockDailyRow = InferSelectModel<typeof stockDaily>;
export type NewStockDailyRow = InferInsertModel<typeof stockDaily>;

export type StockIntradayRow = InferSelectModel<typeof stockIntraday>;
export type NewStockIntradayRow = InferInsertModel<typeof stockIntraday>;

export class PriceRepository {
  /**
   * Fetches chronological daily OHLCV bars for charts and indicators.
   */
  static async getDailyHistory(
    stockId: number,
    options?: {
      from?: string; // YYYY-MM-DD
      to?: string;   // YYYY-MM-DD
      limit?: number;
    }
  ): Promise<StockDailyRow[]> {
    try {
      const conditions = [eq(stockDaily.stockId, stockId)];

      if (options?.from) {
        conditions.push(gte(stockDaily.date, options.from));
      }
      if (options?.to) {
        conditions.push(lte(stockDaily.date, options.to));
      }

      let query = db
        .select()
        .from(stockDaily)
        .where(and(...conditions))
        .orderBy(asc(stockDaily.date));

      if (options?.limit) {
        query = query.limit(options.limit) as any;
      }

      return await query;
    } catch (error) {
      console.error(`PriceRepository.getDailyHistory(${stockId}) failed:`, error);
      throw new Error('Không thể tải dữ liệu lịch sử giá theo ngày.', { cause: error });
    }
  }

  /**
   * Fetches the latest daily closing price and volume for a stock.
   */
  static async getLatestDaily(stockId: number): Promise<StockDailyRow | null> {
    try {
      const results = await db
        .select()
        .from(stockDaily)
        .where(eq(stockDaily.stockId, stockId))
        .orderBy(desc(stockDaily.date))
        .limit(1);

      return results[0] ?? null;
    } catch (error) {
      console.error(`PriceRepository.getLatestDaily(${stockId}) failed:`, error);
      throw new Error('Lỗi khi tải phiên giá gần nhất của cổ phiếu.', { cause: error });
    }
  }

  /**
   * Retrieves intraday trade ticks or minute bars for realtime charts.
   */
  static async getIntradayHistory(stockId: number, limit: number = 300): Promise<StockIntradayRow[]> {
    try {
      return await db
        .select()
        .from(stockIntraday)
        .where(eq(stockIntraday.stockId, stockId))
        .orderBy(asc(stockIntraday.timestamp))
        .limit(limit);
    } catch (error) {
      console.error(`PriceRepository.getIntradayHistory(${stockId}) failed:`, error);
      throw new Error('Không thể tải dữ liệu khớp lệnh trong ngày.', { cause: error });
    }
  }

  /**
   * Batch upserts daily candle data.
   */
  static async batchUpsertDaily(records: NewStockDailyRow[]): Promise<StockDailyRow[]> {
    if (records.length === 0) return [];
    try {
      return await db
        .insert(stockDaily)
        .values(records)
        .onConflictDoUpdate({
          target: [stockDaily.stockId, stockDaily.date],
          set: {
            open: stockDaily.open,
            high: stockDaily.high,
            low: stockDaily.low,
            close: stockDaily.close,
            refPrice: stockDaily.refPrice,
            ceilingPrice: stockDaily.ceilingPrice,
            floorPrice: stockDaily.floorPrice,
            change: stockDaily.change,
            changePercent: stockDaily.changePercent,
            volume: stockDaily.volume,
            value: stockDaily.value,
            updatedAt: new Date(),
          },
        })
        .returning();
    } catch (error) {
      console.error('PriceRepository.batchUpsertDaily failed:', error);
      throw new Error('Lỗi khi cập nhật bảng giá hàng ngày.', { cause: error });
    }
  }

  /**
   * Batch inserts intraday ticks.
   */
  static async insertIntraday(records: NewStockIntradayRow[]): Promise<StockIntradayRow[]> {
    if (records.length === 0) return [];
    try {
      return await db
        .insert(stockIntraday)
        .values(records)
        .onConflictDoNothing()
        .returning();
    } catch (error) {
      console.error('PriceRepository.insertIntraday failed:', error);
      throw new Error('Lỗi khi lưu dữ liệu biến động giá trong ngày.', { cause: error });
    }
  }
}
