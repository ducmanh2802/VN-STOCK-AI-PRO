import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  portfolios,
  portfolioPositions,
  portfolioTransactions,
  stocks,
} from '../../db/schema.ts';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

export type PortfolioRow = InferSelectModel<typeof portfolios>;
export type NewPortfolioRow = InferInsertModel<typeof portfolios>;

export type PortfolioPositionRow = InferSelectModel<typeof portfolioPositions>;
export type NewPortfolioPositionRow = InferInsertModel<typeof portfolioPositions>;

export type PortfolioTransactionRow = InferSelectModel<typeof portfolioTransactions>;
export type NewPortfolioTransactionRow = InferInsertModel<typeof portfolioTransactions>;

export class PortfolioRepository {
  /**
   * Retrieves all portfolios belonging to a user.
   */
  static async getUserPortfolios(userId: number): Promise<PortfolioRow[]> {
    try {
      return await db
        .select()
        .from(portfolios)
        .where(eq(portfolios.userId, userId))
        .orderBy(desc(portfolios.createdAt));
    } catch (error) {
      console.error(`PortfolioRepository.getUserPortfolios(${userId}) failed:`, error);
      throw new Error('Lỗi khi tải danh mục đầu tư.', { cause: error });
    }
  }

  /**
   * Retrieves positions in a portfolio with joined stock info.
   */
  static async getPositions(portfolioId: number) {
    try {
      return await db
        .select({
          position: portfolioPositions,
          stock: {
            symbol: stocks.symbol,
            companyName: stocks.companyName,
            exchange: stocks.exchange,
          },
        })
        .from(portfolioPositions)
        .innerJoin(stocks, eq(portfolioPositions.stockId, stocks.id))
        .where(eq(portfolioPositions.portfolioId, portfolioId));
    } catch (error) {
      console.error(`PortfolioRepository.getPositions(${portfolioId}) failed:`, error);
      throw new Error('Lỗi khi tải danh sách cổ phiếu nắm giữ trong danh mục.', { cause: error });
    }
  }

  /**
   * Retrieves transaction history of a portfolio.
   */
  static async getTransactions(portfolioId: number): Promise<Array<{ transaction: PortfolioTransactionRow; stock: { symbol: string } }>> {
    try {
      return await db
        .select({
          transaction: portfolioTransactions,
          stock: {
            symbol: stocks.symbol,
          },
        })
        .from(portfolioTransactions)
        .innerJoin(stocks, eq(portfolioTransactions.stockId, stocks.id))
        .where(eq(portfolioTransactions.portfolioId, portfolioId))
        .orderBy(desc(portfolioTransactions.transactionDate));
    } catch (error) {
      console.error(`PortfolioRepository.getTransactions(${portfolioId}) failed:`, error);
      throw new Error('Lỗi khi tải lịch sử giao dịch danh mục đầu tư.', { cause: error });
    }
  }

  /**
   * Creates a new portfolio.
   */
  static async createPortfolio(
    userId: number,
    name: string,
    initialCash: string = '0',
    currency: string = 'VND'
  ): Promise<PortfolioRow> {
    try {
      const results = await db
        .insert(portfolios)
        .values({
          userId,
          name: name.trim(),
          initialCash,
          availableCash: initialCash,
          currency,
          updatedAt: new Date(),
        })
        .returning();

      return results[0];
    } catch (error) {
      console.error('PortfolioRepository.createPortfolio failed:', error);
      throw new Error('Không thể tạo danh mục đầu tư mới.', { cause: error });
    }
  }

  /**
   * Records a new transaction (BUY, SELL, DIVIDEND) and updates positions accordingly.
   */
  static async recordTransaction(
    tx: NewPortfolioTransactionRow
  ): Promise<PortfolioTransactionRow> {
    try {
      const results = await db
        .insert(portfolioTransactions)
        .values({
          ...tx,
          updatedAt: new Date(),
        })
        .returning();

      return results[0];
    } catch (error) {
      console.error('PortfolioRepository.recordTransaction failed:', error);
      throw new Error('Lỗi khi ghi nhận lệnh giao dịch.', { cause: error });
    }
  }

  /**
   * Upserts a holding position in a portfolio.
   */
  static async upsertPosition(
    position: NewPortfolioPositionRow
  ): Promise<PortfolioPositionRow> {
    try {
      const results = await db
        .insert(portfolioPositions)
        .values({
          ...position,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [portfolioPositions.portfolioId, portfolioPositions.stockId],
          set: {
            quantity: position.quantity,
            averageCost: position.averageCost,
            currentPrice: position.currentPrice,
            marketValue: position.marketValue,
            unrealizedPnl: position.unrealizedPnl,
            unrealizedPnlPercent: position.unrealizedPnlPercent,
            updatedAt: new Date(),
          },
        })
        .returning();

      return results[0];
    } catch (error) {
      console.error('PortfolioRepository.upsertPosition failed:', error);
      throw new Error('Lỗi khi cập nhật trạng thái vị thế nắm giữ.', { cause: error });
    }
  }
}
