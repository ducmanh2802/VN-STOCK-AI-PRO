import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { financialStatements, financialRatios } from '../../db/schema.ts';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

export type FinancialStatementRow = InferSelectModel<typeof financialStatements>;
export type NewFinancialStatementRow = InferInsertModel<typeof financialStatements>;

export type FinancialRatioRow = InferSelectModel<typeof financialRatios>;
export type NewFinancialRatioRow = InferInsertModel<typeof financialRatios>;

export class FundamentalRepository {
  /**
   * Retrieves income, balance sheet, or cash flow statements by stock.
   */
  static async getStatements(
    stockId: number,
    options?: {
      statementType?: 'IS' | 'BS' | 'CF';
      year?: number;
    }
  ): Promise<FinancialStatementRow[]> {
    try {
      const conditions = [eq(financialStatements.stockId, stockId)];

      if (options?.statementType) {
        conditions.push(eq(financialStatements.statementType, options.statementType));
      }
      if (options?.year) {
        conditions.push(eq(financialStatements.year, options.year));
      }

      return await db
        .select()
        .from(financialStatements)
        .where(and(...conditions))
        .orderBy(desc(financialStatements.year), desc(financialStatements.quarter));
    } catch (error) {
      console.error(`FundamentalRepository.getStatements(${stockId}) failed:`, error);
      throw new Error('Lỗi khi truy xuất báo cáo tài chính của doanh nghiệp.', { cause: error });
    }
  }

  /**
   * Retrieves historical financial ratios (P/E, P/B, ROE, ROA, EPS, Margins).
   */
  static async getRatios(stockId: number, limit: number = 20): Promise<FinancialRatioRow[]> {
    try {
      return await db
        .select()
        .from(financialRatios)
        .where(eq(financialRatios.stockId, stockId))
        .orderBy(desc(financialRatios.year), desc(financialRatios.quarter))
        .limit(limit);
    } catch (error) {
      console.error(`FundamentalRepository.getRatios(${stockId}) failed:`, error);
      throw new Error('Lỗi khi truy xuất các chỉ số tài chính cơ bản.', { cause: error });
    }
  }

  /**
   * Retrieves the most recent financial ratios for quick metric cards.
   */
  static async getLatestRatios(stockId: number): Promise<FinancialRatioRow | null> {
    try {
      const results = await db
        .select()
        .from(financialRatios)
        .where(eq(financialRatios.stockId, stockId))
        .orderBy(desc(financialRatios.year), desc(financialRatios.quarter))
        .limit(1);

      return results[0] ?? null;
    } catch (error) {
      console.error(`FundamentalRepository.getLatestRatios(${stockId}) failed:`, error);
      throw new Error('Không thể tải chỉ số định giá mới nhất.', { cause: error });
    }
  }

  /**
   * Upserts financial statement line items.
   */
  static async upsertStatement(record: NewFinancialStatementRow): Promise<FinancialStatementRow> {
    try {
      const results = await db
        .insert(financialStatements)
        .values({
          ...record,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            financialStatements.stockId,
            financialStatements.year,
            financialStatements.quarter,
            financialStatements.statementType,
          ],
          set: {
            revenue: record.revenue,
            grossProfit: record.grossProfit,
            operatingProfit: record.operatingProfit,
            netProfit: record.netProfit,
            totalAssets: record.totalAssets,
            totalLiabilities: record.totalLiabilities,
            totalEquity: record.totalEquity,
            operatingCashFlow: record.operatingCashFlow,
            investingCashFlow: record.investingCashFlow,
            financingCashFlow: record.financingCashFlow,
            updatedAt: new Date(),
          },
        })
        .returning();

      return results[0];
    } catch (error) {
      console.error('FundamentalRepository.upsertStatement failed:', error);
      throw new Error('Lỗi khi cập nhật báo cáo tài chính.', { cause: error });
    }
  }

  /**
   * Upserts financial ratio metrics.
   */
  static async upsertRatios(record: NewFinancialRatioRow): Promise<FinancialRatioRow> {
    try {
      const results = await db
        .insert(financialRatios)
        .values({
          ...record,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [financialRatios.stockId, financialRatios.year, financialRatios.quarter],
          set: {
            pe: record.pe,
            pb: record.pb,
            ps: record.ps,
            roe: record.roe,
            roa: record.roa,
            roic: record.roic,
            eps: record.eps,
            bvps: record.bvps,
            debtToEquity: record.debtToEquity,
            currentRatio: record.currentRatio,
            quickRatio: record.quickRatio,
            grossMargin: record.grossMargin,
            netMargin: record.netMargin,
            dividendYield: record.dividendYield,
            updatedAt: new Date(),
          },
        })
        .returning();

      return results[0];
    } catch (error) {
      console.error('FundamentalRepository.upsertRatios failed:', error);
      throw new Error('Lỗi khi cập nhật các chỉ số tài chính.', { cause: error });
    }
  }
}
