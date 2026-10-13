/**
 * GET /api/canonical-data/ingestion/status — read-only view of the EOD ingestion:
 * scheduler state, the latest runs, the last COMPLETE run, and how many supported
 * symbols hold a bar for the last final session. There is deliberately no trigger
 * endpoint: runs start only from the scheduler or the backfill CLI.
 */
import { Router, type Request, type Response } from 'express';
import { checkDatabaseConnectivity } from '../../db/databaseHealth.ts';
import { CanonicalMarketDataRepository } from '../../lib/db/data/CanonicalMarketDataRepository.ts';
import { IngestionRunRepository } from '../../lib/db/data/IngestionRunRepository.ts';
import { lastFinalizedSession } from '../../lib/data/vnTradingCalendar.ts';
import { EOD_DAILY_BARS_JOB, supportedTargets } from './DailyBarIngestionJob.ts';
import type { EodIngestionScheduler } from './EodIngestionScheduler.ts';
import { AUTHORITATIVE_DAILY_SERIES } from './kbsDailyObservations.ts';

export function createIngestionStatusRouter(options: { scheduler: EodIngestionScheduler | null; now?: () => Date }): Router {
  const router = Router();
  const now = options.now ?? (() => new Date());

  router.get('/status', async (_req: Request, res: Response) => {
    const scheduler = options.scheduler?.status() ?? { enabled: false, running: false, nextRunAt: null, blockedReason: null, lastResult: null };
    const health = await checkDatabaseConnectivity({ timeoutMs: 1_500 });
    if (health.state !== 'CONNECTED') {
      return res.status(503).json({ dataStatus: 'DATA_UNAVAILABLE', databaseState: health.state, scheduler });
    }
    try {
      const at = now();
      const lastFinal = lastFinalizedSession(at);
      const targets = supportedTargets();
      const [runs, lastComplete, present] = await Promise.all([
        IngestionRunRepository.latestRuns(EOD_DAILY_BARS_JOB, 5),
        IngestionRunRepository.latestRunWithStatus(EOD_DAILY_BARS_JOB, 'COMPLETE'),
        lastFinal
          ? CanonicalMarketDataRepository.instrumentsWithDailyBar({
              tradingDate: lastFinal,
              instrumentIds: targets.map((t) => t.instrumentId),
              series: AUTHORITATIVE_DAILY_SERIES,
              asOf: at,
            })
          : Promise.resolve(new Set<string>()),
      ]);
      return res.json({
        dataStatus: 'OK',
        databaseState: health.state,
        scheduler,
        lastFinalSession: lastFinal,
        coverage: {
          expectedSymbols: targets.length,
          symbolsWithLastFinalSession: present.size,
          missingSymbols: targets.filter((t) => !present.has(t.instrumentId)).map((t) => t.symbol),
        },
        lastCompleteRun: lastComplete,
        recentRuns: runs,
      });
    } catch (error) {
      console.error('[ingestion-status] read failed:', (error as { code?: string }).code ?? (error as Error).message);
      return res.status(503).json({ dataStatus: 'DATA_UNAVAILABLE', databaseState: 'UNAVAILABLE', scheduler });
    }
  });

  return router;
}
