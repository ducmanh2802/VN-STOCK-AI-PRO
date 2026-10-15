/**
 * PHASE 31 — ALERTS API ROUTER
 * ==============================
 * Production entrypoint for the Alert Engine (Product-03).
 * The Alert Engine evaluates user-defined rules against market observations.
 * Rules are read-only; evaluation is deterministic and never mutates state.
 *
 * Routes:
 *   GET  /api/alerts/list      — rule listing (empty until UI populated)
 *   POST /api/alerts/evaluate — evaluate a set of alert rules against an observation.
 */
import { Router, type Request, type Response } from 'express';
import { AlertEngine } from '../../lib/product/alerts/AlertEngine.ts';
import type { AlertRule, Observation } from '../../lib/product/alerts/AlertEngine.ts';

const router = Router();

/**
 * GET /api/alerts/list — discovery surface for the Alerts UI.
 */
router.get('/list', (_req: Request, res: Response) => {
  res.json({ rules: [], count: 0 });
});

/**
 * POST /api/alerts/evaluate — evaluate alert rules against an observation.
 *
 * The payload contains an observation (instrument, price, as-of) and a set of
 * alert rules. The engine returns matching alerts with severities (CRITICAL/WARNING/INFO).
 *
 * Validation is fail-closed: missing or malformed payload returns a typed 400.
 */
router.post('/evaluate', async (req: Request, res: Response) => {
  const body = req.body ?? {};

  const instrumentId = typeof body.instrumentId === 'string' ? body.instrumentId.trim().toUpperCase() : '';
  if (!instrumentId) {
    return res.status(400).json({ error: 'MISSING_FIELD', code: 'instrumentId is required' });
  }

  const price = typeof body.price === 'number' && Number.isFinite(body.price) ? body.price : null;
  const previousPrice = typeof body.previousPrice === 'number' && Number.isFinite(body.previousPrice) ? body.previousPrice : null;
  const asOf = typeof body.asOf === 'string' ? body.asOf.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    return res.status(400).json({ error: 'INVALID_DATE', code: 'asOf must be YYYY-MM-DD' });
  }
  const dataValid = typeof body.dataValid === 'boolean' ? body.dataValid : true;

  const observation: Observation = {
    instrumentId,
    price,
    previousPrice,
    asOf,
    dataValid,
  };

  const rules = body.rules;
  if (!Array.isArray(rules)) {
    return res.status(400).json({ error: 'MISSING_FIELD', code: 'rules array is required' });
  }

  try {
    const alerts = AlertEngine.evaluateRules(rules as readonly AlertRule[], observation);
    res.json({ alerts, advisoryOnly: true });
  } catch (error: any) {
    console.error('Error in POST /api/alerts/evaluate:', error);
    return res.status(500).json({
      error: 'ALERT_EVALUATION_FAILED',
      advisoryOnly: true,
      ...(process.env.NODE_ENV !== 'production' ? { dev: error.message } : {}),
    });
  }
});

export function createAlertApiRouter() {
  return router;
}