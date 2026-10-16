import { Router, type Request, type Response } from 'express';
import {
  getNewsMacroListService,
  NewsMacroListError,
  NewsMacroUnavailableError,
} from '../../../services/newsMacro/NewsMacroListService.ts';

export function createNewsMacroListRouter(): Router {
  const router = Router();
  const service = getNewsMacroListService();

  router.get('/news', async (req: Request, res: Response) => {
    try {
      const result = await service.listNews({
        limit: req.query.limit as string,
        cursor: req.query.cursor as string,
        symbol: req.query.symbol as string,
      });
      res.json(result);
    } catch (err: any) {
      if (err instanceof NewsMacroListError) {
        res.status(400).json({ error: err.message, code: err.code });
      } else if (err instanceof NewsMacroUnavailableError) {
        res.status(503).json({ error: 'DATA_UNAVAILABLE', details: err.message });
      } else {
        res.status(500).json({ error: 'INTERNAL_ERROR' });
      }
    }
  });

  router.get('/policy-events', async (req: Request, res: Response) => {
    try {
      const result = await service.listPolicyEvents({
        limit: req.query.limit as string,
        cursor: req.query.cursor as string,
        policyType: req.query.policyType as string,
      });
      res.json(result);
    } catch (err: any) {
      if (err instanceof NewsMacroListError) {
        res.status(400).json({ error: err.message, code: err.code });
      } else if (err instanceof NewsMacroUnavailableError) {
        res.status(503).json({ error: 'DATA_UNAVAILABLE', details: err.message });
      } else {
        res.status(500).json({ error: 'INTERNAL_ERROR' });
      }
    }
  });

  router.get('/earnings-calendar', async (req: Request, res: Response) => {
    try {
      const result = await service.listEarningsCalendar({
        limit: req.query.limit as string,
        cursor: req.query.cursor as string,
        symbol: req.query.symbol as string,
      });
      res.json(result);
    } catch (err: any) {
      if (err instanceof NewsMacroListError) {
        res.status(400).json({ error: err.message, code: err.code });
      } else if (err instanceof NewsMacroUnavailableError) {
        res.status(503).json({ error: 'DATA_UNAVAILABLE', details: err.message });
      } else {
        res.status(500).json({ error: 'INTERNAL_ERROR' });
      }
    }
  });

  router.get('/macro/observations', async (req: Request, res: Response) => {
    try {
      const result = await service.listMacroObservations({
        limit: req.query.limit as string,
        cursor: req.query.cursor as string,
        metricCode: req.query.metricCode as string,
      });
      res.json(result);
    } catch (err: any) {
      if (err instanceof NewsMacroListError) {
        res.status(400).json({ error: err.message, code: err.code });
      } else if (err instanceof NewsMacroUnavailableError) {
        res.status(503).json({ error: 'DATA_UNAVAILABLE', details: err.message });
      } else {
        res.status(500).json({ error: 'INTERNAL_ERROR' });
      }
    }
  });

  return router;
}
