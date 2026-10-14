import { Router } from 'express';

export function createIngestionStatusRouter(_opts?: { scheduler?: any }): Router {
  const router = Router();
  router.get('/status', (_req, res) => {
    res.json({
      status: 'IDLE',
      scheduler: _opts?.scheduler ? 'ACTIVE' : 'DISABLED',
    });
  });
  return router;
}
