import { Router } from 'express';

export function createScenarioApiRouter(): Router {
  const router = Router();
  router.get('/status', (_req, res) => {
    res.json({ status: 'READY', lane: 'scenario' });
  });
  return router;
}
