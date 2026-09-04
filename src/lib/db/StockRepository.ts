import { eq, ilike, or, desc, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { stocks } from '../../db/schema.ts';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

export type StockRow = InferSelectModel<typeof stocks>;
export type NewStockRow = InferInsertModel<typeof stocks>;

export class StockRepository {
  /**
   * Retrieves all active stocks, with optional filtering by exchange or sector.
   */
  static async getStocks(options?: {
    exchange?: string;
    sector?: string;
    limit?: number;
    offset?: number;
  }): Promise<StockRow[]> {
    try {
      let query = db
        .select()
        .from(stocks)
        .where(eq(stocks.isActive, true))
        .orderBy(stocks.symbol);

      if (options?.limit) {
        query = query.limit(options.limit) as any;
      }
      if (options?.offset) {
        query = query.offset(options.offset) as any;
      }

      return await query;
    } catch (error) {
      console.error('StockRepository.getStocks failed:', error);
      throw new Error('Không thể tải danh sách cổ phiếu từ cơ sở dữ liệu.', { cause: error });
    }
  }

  /**
   * Finds a stock by its ticker symbol (case-insensitive).
   */
  static async getBySymbol(symbol: string): Promise<StockRow | null> {
    try {
      const upper = symbol.toUpperCase().trim();
      const results = await db
        .select()
        .from(stocks)
        .where(eq(stocks.symbol, upper))
        .limit(1);

      return results[0] ?? null;
    } catch (error) {
      console.error(`StockRepository.getBySymbol(${symbol}) failed:`, error);
      throw new Error(`Không thể tìm thấy thông tin cổ phiếu ${symbol}.`, { cause: error });
    }
  }

  /**
   * Searches stocks by symbol or company name prefix/substring.
   */
  static async search(searchTerm: string, limit: number = 10): Promise<StockRow[]> {
    try {
      const term = `%${searchTerm.trim()}%`;
      return await db
        .select()
        .from(stocks)
        .where(
          or(
            ilike(stocks.symbol, term),
            ilike(stocks.companyName, term),
            ilike(stocks.sector, term)
          )
        )
        .limit(limit);
    } catch (error) {
      console.error(`StockRepository.search(${searchTerm}) failed:`, error);
      throw new Error('Lỗi khi tìm kiếm cổ phiếu.', { cause: error });
    }
  }

  /**
   * Upserts stock master record.
   */
  static async upsert(stockData: NewStockRow): Promise<StockRow> {
    try {
      const results = await db
        .insert(stocks)
        .values({
          ...stockData,
          symbol: stockData.symbol.toUpperCase().trim(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: stocks.symbol,
          set: {
            companyName: stockData.companyName,
            exchange: stockData.exchange,
            sector: stockData.sector,
            industry: stockData.industry,
            listedShares: stockData.listedShares,
            outstandingShares: stockData.outstandingShares,
            foreignLimitPercent: stockData.foreignLimitPercent,
            isActive: stockData.isActive ?? true,
            updatedAt: new Date(),
          },
        })
        .returning();

      return results[0];
    } catch (error) {
      console.error('StockRepository.upsert failed:', error);
      throw new Error('Lỗi khi cập nhật thông tin niêm yết cổ phiếu.', { cause: error });
    }
  }
}
