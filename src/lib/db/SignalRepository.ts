import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { signals, stocks } from '../../db/schema.ts';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

export type SignalRow = InferSelectModel<typeof signals>;
export type NewSignalRow = InferInsertModel<typeof signals>;

export class SignalRepository {
  /**
   * Retrieves active buy/sell signals with joined stock information.
   */
  static async getActiveSignals(options?: {
    timeframe?: string;
    limit?: number;
  }): Promise<Array<{ signal: SignalRow; stock: { symbol: string; companyName: string; exchange: string } }>> {
    try {
      const conditions = [eq(signals.status, 'ACTIVE')];

      if (options?.timeframe) {
        conditions.push(eq(signals.timeframe, options.timeframe));
      }

      let query = db
        .select({
          signal: signals,
          stock: {
            symbol: stocks.symbol,
            companyName: stocks.companyName,
            exchange: stocks.exchange,
          },
        })
        .from(signals)
        .innerJoin(stocks, eq(signals.stockId, stocks.id))
        .where(and(...conditions))
        .orderBy(desc(signals.generatedAt));

      if (options?.limit) {
        query = query.limit(options.limit) as any;
      }

      return await query;
    } catch (error) {
      console.error('SignalRepository.getActiveSignals failed:', error);
      throw new Error('Lỗi khi tải danh sách tín hiệu khuyến nghị giao dịch.', { cause: error });
    }
  }

  /**
   * Retrieves signals for a specific stock ticker.
   */
  static async getByStock(stockId: number): Promise<SignalRow[]> {
    try {
      return await db
        .select()
        .from(signals)
        .where(eq(signals.stockId, stockId))
        .orderBy(desc(signals.generatedAt));
    } catch (error) {
      console.error(`SignalRepository.getByStock(${stockId}) failed:`, error);
      throw new Error('Lỗi khi truy xuất tín hiệu của cổ phiếu.', { cause: error });
    }
  }

  /**
   * Publishes a new trading signal.
   */
  static async createSignal(record: NewSignalRow): Promise<SignalRow> {
    try {
      const results = await db
        .insert(signals)
        .values({
          ...record,
          updatedAt: new Date(),
        })
        .returning();

      return results[0];
    } catch (error) {
      console.error('SignalRepository.createSignal failed:', error);
      throw new Error('Không thể tạo tín hiệu khuyến nghị mới.', { cause: error });
    }
  }

  /**
   * Updates signal execution status (ACTIVE, TRIGGERED, EXPIRED, STOPPED).
   */
  static async updateStatus(
    signalId: number,
    status: 'ACTIVE' | 'TRIGGERED' | 'EXPIRED' | 'STOPPED'
  ): Promise<SignalRow | null> {
    try {
      const results = await db
        .update(signals)
        .set({
          status,
          updatedAt: new Date(),
        })
        .where(eq(signals.id, signalId))
        .returning();

      return results[0] ?? null;
    } catch (error) {
      console.error(`SignalRepository.updateStatus(${signalId}, ${status}) failed:`, error);
      throw new Error('Không thể cập nhật trạng thái tín hiệu.', { cause: error });
    }
  }
}
