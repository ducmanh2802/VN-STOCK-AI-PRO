/**
 * P1-09 REMEDIATION — PAPER REPLAY API ROUTER
 * ============================================
 * Gives the paper-replay lane a real production entrypoint. Before this router
 * existed, `PaperReplayEngine`, `PaperReplayService` and `ReplayRepository` had
 * zero non-test callers and `server.ts` had no `/replay/*` route at all.
 *
 * SAFETY CONTRACT
 * - Simulation only. A replay whose execution port is not a simulation is refused
 *   with `EXECUTION_BLOCKED` before a single bar is processed.
 * - No bars => `DATA_UNAVAILABLE`. There is no synthetic bar generation anywhere
 *   in this path.
 * - Persistence is reported truthfully; a replay is never recorded as durable
 *   when no database was reached.
 */
import { Router, type Request, type Response } from 'express';
import { PaperReplayService } from './PaperReplayService.ts';
import { ReplayRepository } from '../../lib/db/replay/ReplayRepository.ts';
import type { ReplayRunInput, ReplayPorts } from '../../lib/replay/PaperReplayEngine.ts';
import type { ReplayManifest } from '../../lib/replay/types.ts';

const replay = new PaperReplayService();

const fail = (res: Response, status: number, code: string, detail: string) =>
  res.status(status).json({ success: false, error: { code, message: detail } });

export function createPaperReplayApiRouter(): Router {
  const router = Router();

  /**
   * Paper-only assertion. Exposed so a caller can verify the execution-port
   * contract before attempting a run; it never inspects live credentials.
   */
  router.post('/assert-paper-only', (req: Request, res: Response) => {
    const ports = req.body?.ports as ReplayPorts | undefined;
    if (!ports || typeof ports !== 'object' || !ports.executionPort) {
      return fail(res, 400, 'MISSING_FIELD', 'ports.executionPort is required.');
    }
    const result = replay.assertPaperOnly(ports);
    return res.status(result.ok ? 200 : 409).json({
      success: result.ok,
      paperOnly: result.ok,
      reason: result.reason,
    });
  });

  /**
   * Runs a replay and persists the run. This is the production caller of
   * `PaperReplayEngine.run` and `ReplayRepository.record`.
   */
  router.post('/runs', async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const input = body.input as ReplayRunInput | undefined;
    if (!input || typeof input !== 'object') {
      return fail(res, 400, 'MISSING_FIELD', 'input (ReplayRunInput) is required.');
    }
    if (!Array.isArray(input.bars) || input.bars.length === 0) {
      // Fail closed: no bars means no replay. Nothing is generated.
      return res.status(422).json({
        success: false,
        error: {
          code: 'DATA_UNAVAILABLE',
          message: 'A replay requires real historical bars. The system never synthesizes a bar series.',
        },
      });
    }
    const manifest = body.manifest as ReplayManifest | undefined;
    if (!manifest) {
      return fail(res, 400, 'MISSING_FIELD', 'manifest (ReplayManifest) is required.');
    }

    // Hard safety gate before any processing.
    if (input.ports?.executionPort?.isSimulation === false) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'EXECUTION_BLOCKED',
          message: 'The execution port is not a simulation. Replay refused fail-closed.',
        },
      });
    }

    try {
      const result = replay.run(input);
      let persisted = false;
      try {
        await ReplayRepository.record(result, manifest);
        persisted = true;
      } catch (error: any) {
        console.error('[PaperReplayApiRouter] replay persistence failed:', error?.message ?? error);
      }
      return res.json({
        success: result.status !== 'FAILED',
        replayId: manifest.replayId,
        status: result.status,
        persisted,
        result,
      });
    } catch (error: any) {
      return fail(res, 400, 'REPLAY_REJECTED', error?.message ?? 'Replay rejected by PaperReplayEngine.');
    }
  });

  /** State-machine transition check, useful for the UI and for audit. */
  router.get('/transitions', (req: Request, res: Response) => {
    const from = String(req.query.from ?? '');
    const to = String(req.query.to ?? '');
    if (!from || !to) {
      return fail(res, 400, 'MISSING_FIELD', 'from and to query parameters are required.');
    }
    return res.json({
      success: true,
      from,
      to,
      allowed: replay.canTransition(from as never, to as never),
    });
  });

  return router;
}
