import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { watchlists, watchlistItems, stocks } from '../../db/schema.ts';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

export type WatchlistRow = InferSelectModel<typeof watchlists>;
export type NewWatchlistRow = InferInsertModel<typeof watchlists>;

export type WatchlistItemRow = InferSelectModel<typeof watchlistItems>;
export type NewWatchlistItemRow = InferInsertModel<typeof watchlistItems>;

export class WatchlistRepository {
  /**
   * Retrieves all watchlists owned by a user.
   */
  static async getUserWatchlists(userId: number): Promise<WatchlistRow[]> {
    try {
      return await db
        .select()
        .from(watchlists)
        .where(eq(watchlists.userId, userId))
        .orderBy(desc(watchlists.isDefault), desc(watchlists.createdAt));
    } catch (error) {
      console.error(`WatchlistRepository.getUserWatchlists(${userId}) failed:`, error);
      throw new Error('Không thể tải danh sách theo dõi của người dùng.', { cause: error });
    }
  }

  /**
   * Retrieves a watchlist with all tracked stocks.
   */
  static async getWatchlistWithStocks(watchlistId: number) {
    try {
      const listInfo = await db
        .select()
        .from(watchlists)
        .where(eq(watchlists.id, watchlistId))
        .limit(1);

      if (listInfo.length === 0) return null;

      const items = await db
        .select({
          item: watchlistItems,
          stock: stocks,
        })
        .from(watchlistItems)
        .innerJoin(stocks, eq(watchlistItems.stockId, stocks.id))
        .where(eq(watchlistItems.watchlistId, watchlistId))
        .orderBy(stocks.symbol);

      return {
        ...listInfo[0],
        stocks: items,
      };
    } catch (error) {
      console.error(`WatchlistRepository.getWatchlistWithStocks(${watchlistId}) failed:`, error);
      throw new Error('Lỗi khi tải chi tiết danh mục theo dõi.', { cause: error });
    }
  }

  /**
   * Creates a new watchlist.
   */
  static async createWatchlist(
    userId: number,
    name: string,
    description?: string,
    isDefault: boolean = false
  ): Promise<WatchlistRow> {
    try {
      const results = await db
        .insert(watchlists)
        .values({
          userId,
          name: name.trim(),
          description: description?.trim(),
          isDefault,
          updatedAt: new Date(),
        })
        .returning();

      return results[0];
    } catch (error) {
      console.error('WatchlistRepository.createWatchlist failed:', error);
      throw new Error('Không thể tạo danh mục theo dõi mới.', { cause: error });
    }
  }

  /**
   * Adds a stock to a watchlist.
   */
  static async addStock(
    watchlistId: number,
    stockId: number,
    notes?: string,
    targetPrice?: string
  ): Promise<WatchlistItemRow> {
    try {
      const results = await db
        .insert(watchlistItems)
        .values({
          watchlistId,
          stockId,
          notes,
          targetPrice,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [watchlistItems.watchlistId, watchlistItems.stockId],
          set: {
            notes,
            targetPrice,
            updatedAt: new Date(),
          },
        })
        .returning();

      return results[0];
    } catch (error) {
      console.error('WatchlistRepository.addStock failed:', error);
      throw new Error('Không thể thêm cổ phiếu vào danh mục theo dõi.', { cause: error });
    }
  }

  /**
   * Removes a stock from a watchlist.
   */
  static async removeStock(watchlistId: number, stockId: number): Promise<boolean> {
    try {
      const results = await db
        .delete(watchlistItems)
        .where(
          and(
            eq(watchlistItems.watchlistId, watchlistId),
            eq(watchlistItems.stockId, stockId)
          )
        )
        .returning();

      return results.length > 0;
    } catch (error) {
      console.error(`WatchlistRepository.removeStock(${watchlistId}, ${stockId}) failed:`, error);
      throw new Error('Không thể xóa cổ phiếu khỏi danh mục theo dõi.', { cause: error });
    }
  }

  /**
   * Deletes an entire watchlist.
   */
  static async deleteWatchlist(watchlistId: number, userId: number): Promise<boolean> {
    try {
      const results = await db
        .delete(watchlists)
        .where(and(eq(watchlists.id, watchlistId), eq(watchlists.userId, userId)))
        .returning();

      return results.length > 0;
    } catch (error) {
      console.error(`WatchlistRepository.deleteWatchlist(${watchlistId}) failed:`, error);
      throw new Error('Không thể xóa danh mục theo dõi.', { cause: error });
    }
  }
}
