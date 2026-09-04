import { eq, desc } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { valuationResults } from '../../db/schema.ts';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

export type ValuationResultRow = InferSelectModel<typeof valuationResults>;
export type NewValuationResultRow = InferInsertModel<typeof valuationResults>;

export class ValuationRepository {
  /**
   * Retrieves all calculated valuation models for a stock (DCF, P/E Multiple, Graham, Consensus).
   */
  static async getByStock(stockId: number): Promise<ValuationResultRow[]> {
    try {
      return await db
        .select()
        .from(valuationResults)
        .where(eq(valuationResults.stockId, stockId))
        .orderBy(desc(valuationResults.evaluatedAt));
    } catch (error) {
      console.error(`ValuationRepository.getByStock(${stockId}) failed:`, error);
      throw new Error('Lỗi khi tải kết quả các mô hình định giá.', { cause: error });
    }
  }

  /**
   * Retrieves the latest valuation evaluation for a specific stock and model.
   */
  static async getLatestByModel(stockId: number, modelName: string): Promise<ValuationResultRow | null> {
    try {
      const results = await db
        .select()
        .from(valuationResults)
        .where(eq(valuationResults.stockId, stockId))
        .orderBy(desc(valuationResults.evaluatedAt))
        .limit(1);

      return results[0] ?? null;
    } catch (error) {
      console.error(`ValuationRepository.getLatestByModel(${stockId}, ${modelName}) failed:`, error);
      throw new Error('Lỗi khi tải kết quả định giá theo mô hình.', { cause: error });
    }
  }

  /**
   * Inserts a newly evaluated valuation calculation result.
   */
  static async insertValuation(record: NewValuationResultRow): Promise<ValuationResultRow> {
    try {
      const results = await db
        .insert(valuationResults)
        .values({
          ...record,
          updatedAt: new Date(),
        })
        .returning();

      return results[0];
    } catch (error) {
      console.error('ValuationRepository.insertValuation failed:', error);
      throw new Error('Lỗi khi lưu kết quả định giá cổ phiếu.', { cause: error });
    }
  }
}
