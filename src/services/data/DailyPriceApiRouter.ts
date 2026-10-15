import { Router, type Request, type Response } from 'express';
import { getDailyPrices } from './DailyPriceService.ts';

export function createDailyPriceRouter(): Router {
  const router = Router();

  router.get('/:symbol/daily', async (req: Request, res: Response) => {
    try {
      const symbol = req.params.symbol;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
      const result = await getDailyPrices(symbol, { limit, now: new Date() });

      if (result.status === 'UNSUPPORTED_SYMBOL') {
        return res.status(404).json({ error: 'Không tìm thấy cổ phiếu' });
      }

      if (result.status === 'DATABASE_UNAVAILABLE') {
        return res.status(503).json({
          error: 'Dữ liệu giá không khả dụng',
          code: 'DATA_UNAVAILABLE',
          dataStatus: 'DATA_UNAVAILABLE',
          databaseState: result.databaseState,
        });
      }

      if (result.status === 'INVALID_QUERY') {
        return res.status(400).json({ error: result.detail || 'Truy vấn không hợp lệ' });
      }

      res.json(result.bars);
    } catch (err: any) {
      res.status(500).json({ error: 'Lỗi hệ thống khi tải lịch sử giá', detail: err?.message });
    }
  });

  return router;
}
