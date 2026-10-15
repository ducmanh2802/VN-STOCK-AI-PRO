/**
 * GET /api/stocks/:symbol/daily — historical daily OHLCV from the canonical model.
 *
 * Response body keeps the former array-of-rows shape (see `toLegacyDailyRow`). The
 * status of the series travels in headers so the body stays backward compatible:
 *   X-Data-Status            OK | EMPTY
 *   X-Data-Source            KBS
 *   X-Data-Version           canonical daily version
 *   X-Data-Missing-Sessions  trading sessions inside the range with no stored bar
 * Behaviour change, deliberate: `limit` now returns the MOST RECENT bars (ascending).
 * The former query applied the limit to an ascending scan and so returned the oldest
 * rows of the range.
 */
import { Router, type Request, type Response } from 'express';
import { sendDataError } from '../../middleware/platform/security.ts';
import { getDailyPrices, toLegacyDailyRow } from './DailyPriceService.ts';
import { AUTHORITATIVE_DAILY_SERIES } from './kbsDailyObservations.ts';

export function createDailyPriceRouter(options: { now?: () => Date } = {}): Router {
  const router = Router();
  const now = options.now ?? (() => new Date());

  router.get('/:symbol/daily', async (req: Request, res: Response) => {
    try {
      const limitRaw = typeof req.query.limit === 'string' ? req.query.limit : undefined;
      const result = await getDailyPrices(req.params.symbol, {
        from: typeof req.query.from === 'string' ? req.query.from : undefined,
        to: typeof req.query.to === 'string' ? req.query.to : undefined,
        limit: limitRaw === undefined ? undefined : Number(limitRaw),
        now: now(),
      });

      switch (result.status) {
        case 'INVALID_QUERY':
          return res.status(400).json({ error: result.detail, code: 'INVALID_QUERY' });
        case 'UNSUPPORTED_SYMBOL':
          return res.status(404).json({ error: 'Không tìm thấy cổ phiếu' });
        case 'DATABASE_UNAVAILABLE':
          return res.status(503).json({
            error: 'Lỗi khi tải lịch sử giá',
            code: 'DATA_UNAVAILABLE',
            dataStatus: 'DATA_UNAVAILABLE',
            databaseState: result.databaseState,
          });
        default:
          res.setHeader('X-Data-Status', result.status);
          res.setHeader('X-Data-Source', AUTHORITATIVE_DAILY_SERIES.source);
          res.setHeader('X-Data-Version', AUTHORITATIVE_DAILY_SERIES.dataVersion);
          res.setHeader('X-Data-Missing-Sessions', String(result.missingSessionCount));
          return res.json(result.bars.map(toLegacyDailyRow));
      }
    } catch (error) {
      console.error(`Error in GET /api/stocks/${req.params.symbol}/daily:`, error);
      sendDataError(res, 'Lỗi khi tải lịch sử giá', error);
    }
  });

  return router;
}
