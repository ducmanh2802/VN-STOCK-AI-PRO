import { Router } from 'express';
import type { TradingEngine } from '../engine/TradingEngine.ts';

export function createTradingApiRouter(engine?: TradingEngine): Router {
  const router = Router();

  router.get('/status', (_req, res) => {
    res.json(engine ? engine.getStatus() : { status: 'READY' });
  });

  router.get('/portfolio', (_req, res) => {
    res.json(engine?.broker ? engine.broker.getAccount() : { balance: 0, positions: [] });
  });

  return router;
}
