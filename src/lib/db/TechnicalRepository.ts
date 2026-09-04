import { eq, and, desc, asc } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { technicalIndicators } from '../../db/schema.ts';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

export type TechnicalIndicatorRow = InferSelectModel<typeof technicalIndicators>;
export type NewTechnicalIndicatorRow = InferInsertModel<typeof technicalIndicators>;

export class TechnicalRepository {
  /**
   * Retrieves the most recent computed technical indicators for a given stock.
   */
  static async getLatest(
    stockId: number,
    timeframe: string = '1D'
  ): Promise<TechnicalIndicatorRow | null> {
    try {
      const results = await db
        .select()
        .from(technicalIndicators)
        .where(
          and(
            eq(technicalIndicators.stockId, stockId),
            eq(technicalIndicators.timeframe, timeframe)
          )
        )
        .orderBy(desc(technicalIndicators.date))
        .limit(1);

      return results[0] ?? null;
    } catch (error) {
      console.error(`TechnicalRepository.getLatest(${stockId}, ${timeframe}) failed:`, error);
      throw new Error('Lỗi khi tải chỉ báo kỹ thuật mới nhất.', { cause: error });
    }
  }

  /**
   * Retrieves historical series of technical indicators (RSI, MACD, Bollinger Bands, MA lines).
   */
  static async getHistory(
    stockId: number,
    timeframe: string = '1D',
    limit: number = 60
  ): Promise<TechnicalIndicatorRow[]> {
    try {
      return await db
        .select()
        .from(technicalIndicators)
        .where(
          and(
            eq(technicalIndicators.stockId, stockId),
            eq(technicalIndicators.timeframe, timeframe)
          )
        )
        .orderBy(asc(technicalIndicators.date))
        .limit(limit);
    } catch (error) {
      console.error(`TechnicalRepository.getHistory(${stockId}) failed:`, error);
      throw new Error('Lỗi khi tải chuỗi dữ liệu chỉ báo kỹ thuật.', { cause: error });
    }
  }

  /**
   * Upserts calculated technical indicators for a specific date and timeframe.
   */
  static async upsert(record: NewTechnicalIndicatorRow): Promise<TechnicalIndicatorRow> {
    try {
      const results = await db
        .insert(technicalIndicators)
        .values({
          ...record,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            technicalIndicators.stockId,
            technicalIndicators.date,
            technicalIndicators.timeframe,
          ],
          set: {
            ma20: record.ma20,
            ma50: record.ma50,
            ma200: record.ma200,
            ema12: record.ema12,
            ema26: record.ema26,
            rsi14: record.rsi14,
            macd: record.macd,
            macdSignal: record.macdSignal,
            macdHistogram: record.macdHistogram,
            bollingerUpper: record.bollingerUpper,
            bollingerMiddle: record.bollingerMiddle,
            bollingerLower: record.bollingerLower,
            volumeMa20: record.volumeMa20,
            atr14: record.atr14,
            signalSummary: record.signalSummary,
            updatedAt: new Date(),
          },
        })
        .returning();

      return results[0];
    } catch (error) {
      console.error('TechnicalRepository.upsert failed:', error);
      throw new Error('Không thể lưu chỉ số phân tích kỹ thuật.', { cause: error });
    }
  }
}
