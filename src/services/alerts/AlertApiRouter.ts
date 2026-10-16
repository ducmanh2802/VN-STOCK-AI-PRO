import { Router } from 'express';

export function createAlertApiRouter(): Router {
  const router = Router();
  router.get('/status', (_req, res) => {
    res.json({ status: 'READY', lane: 'alerts' });
  });
  return router;
}
