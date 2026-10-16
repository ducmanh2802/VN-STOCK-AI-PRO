import { Router } from 'express';

export function createBacktestApiRouter(): Router {
  const router = Router();

  router.get('/status', (_req, res) => {
    res.json({ status: 'READY', engine: 'BacktestEngine' });
  });

  router.post('/run', (_req, res) => {
    res.json({ status: 'NOT_CONFIGURED', message: 'Backtest parameters required' });
  });

  return router;
}
