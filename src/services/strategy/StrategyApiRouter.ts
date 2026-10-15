import { Router } from 'express';

export function createStrategyApiRouter(): Router {
  const router = Router();
  router.get('/status', (_req, res) => {
    res.json({ status: 'READY', lane: 'strategy' });
  });
  return router;
}
