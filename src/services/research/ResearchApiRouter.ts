import { Router, type Request, type Response } from 'express';
import { AuditEngine } from '../../lib/research/AuditEngine.ts';
import { ResearchRepository } from '../../lib/db/research/ResearchRepository.ts';
import { db } from '../../db/index.ts';
import { researchExperiments, decisionJournal } from '../../db/schema.ts';
import { desc, eq } from 'drizzle-orm';

export function createResearchApiRouter(): Router {
  const router = Router();

  // Audit / Certification endpoint
  router.post('/certify', (req: Request, res: Response) => {
    try {
      const {
        pitValid = true,
        noLookahead = true,
        survivorshipControlled = true,
        costPresent = true,
        oosTested = true,
        reproducible = true,
        accountingValid = true,
        limitationsDocumented = true,
      } = req.body || {};

      const status = AuditEngine.certify({
        pitValid: Boolean(pitValid),
        noLookahead: Boolean(noLookahead),
        survivorshipControlled: Boolean(survivorshipControlled),
        costPresent: Boolean(costPresent),
        oosTested: Boolean(oosTested),
        reproducible: Boolean(reproducible),
        accountingValid: Boolean(accountingValid),
        limitationsDocumented: Boolean(limitationsDocumented),
      });

      return res.json({
        status,
        certified: status === 'CERTIFIED',
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Certification evaluation failed' });
    }
  });

  // Calculate Performance Metrics
  router.post('/metrics', (req: Request, res: Response) => {
    try {
      const {
        initialCapital = 100000000,
        equity = [],
        tradeReturns = [],
        turnover = 0,
        exposure = 0,
      } = req.body || {};

      const metrics = AuditEngine.metrics({
        initialCapital: Number(initialCapital),
        equity: Array.isArray(equity) ? equity : [],
        tradeReturns: Array.isArray(tradeReturns) ? tradeReturns : [],
        turnover: Number(turnover),
        exposure: Number(exposure),
      });

      return res.json({ success: true, metrics });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to compute metrics' });
    }
  });

  // Experiments CRUD
  router.get('/experiments', async (_req: Request, res: Response) => {
    try {
      if (!db) {
        return res.json({ success: true, data: [] });
      }
      const list = await db.select().from(researchExperiments).orderBy(desc(researchExperiments.createdAt)).limit(50);
      return res.json({ success: true, data: list });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to list experiments' });
    }
  });

  router.get('/experiments/:id', async (req: Request, res: Response) => {
    try {
      if (!db) {
        return res.status(404).json({ error: 'Experiment not found' });
      }
      const rows = await db.select().from(researchExperiments).where(eq(researchExperiments.experimentId, req.params.id)).limit(1);
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Experiment not found' });
      }
      return res.json({ success: true, data: rows[0] });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to fetch experiment' });
    }
  });

  // Decision Journal integration
  router.get('/decisions', async (_req: Request, res: Response) => {
    try {
      if (!db) {
        return res.json({ success: true, data: [] });
      }
      const entries = await db.select().from(decisionJournal).orderBy(desc(decisionJournal.createdAt)).limit(50);
      return res.json({ success: true, data: entries });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to list decision journal entries' });
    }
  });

  return router;
}
