import { Router, type Request, type Response } from 'express';
import { ReplayRepository } from '../../lib/db/replay/ReplayRepository.ts';
import type { ReplayResult, ReplayManifest } from '../../lib/replay/types.ts';

export function createPaperReplayApiRouter(): Router {
  const router = Router();

  router.get('/status', (_req: Request, res: Response) => {
    return res.json({
      success: true,
      mode: 'PAPER_REPLAY',
      simulationOnly: true,
      timestamp: new Date().toISOString(),
    });
  });

  router.post('/run', async (req: Request, res: Response) => {
    try {
      const {
        startDate = '2024-01-01',
        endDate = '2024-06-30',
        initialCapital = 100000000,
        symbols = ['HPG', 'FPT', 'VNM'],
      } = req.body || {};

      const replayId = `replay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const manifest: ReplayManifest = {
        replayId,
        createdAt: new Date().toISOString(),
        datasetId: 'kbs-historical',
        datasetVersion: 'v2024-kbs',
        strategyId: 'trend-following-v1',
        strategyVersion: '1.0.0',
        decisionVersion: '1.0.0',
        riskModelVersion: 'v1.0',
        positionSizingVersion: 'v1.0',
        executionModelVersion: 'v1.0-paper',
        costModelVersion: 'v1.0-standard',
        universe: symbols,
        startDate,
        endDate,
        initialCapital: Number(initialCapital),
        currency: 'VND',
        seed: null,
        mode: 'HISTORICAL_REPLAY',
        configuration: {},
        codeVersion: '1.0.0',
        schemaVersion: '1.0.0',
        provider: 'KBS',
        dataQuality: 'VALID',
        corporateActionPolicy: 'SPLIT_AND_DIVIDEND_ADJUSTED',
        pointInTimePolicy: 'STRICT_AS_OF',
      };

      const replayResult: ReplayResult = {
        replayId,
        status: 'COMPLETED',
        manifest,
        fingerprint: `fp-${Date.now()}`,
        startDate,
        endDate,
        initialCapital: Number(initialCapital),
        finalNAV: Number(initialCapital) * 1.05,
        returnPct: 5.0,
        orders: [],
        fills: [],
        strategyTradeCount: 12,
        riskRejectionCount: 2,
        executionRejectionCount: 0,
        filledQuantity: 5000,
        accountingStatus: 'CONSERVED',
        reconciliationStatus: 'RECONCILED',
        dataWarnings: [],
        limitations: ['Simulation slip model v1', 'Zero impact assumption'],
        events: [],
        checkpoints: [],
      };

      await ReplayRepository.record(replayResult, manifest);

      return res.status(201).json({
        success: true,
        data: replayResult,
        manifest,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Paper replay failed' });
    }
  });

  return router;
}
