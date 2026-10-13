/**
 * PHASE 31 — SCENARIO API ROUTER
 * ===============================
 * Production entrypoint for the Scenario Engine (Product-02).
 * The Scenario Engine is a pure, deterministic what-if engine that explores
 * hypothetical portfolio movements via price shocks, allocation deltas, and
 * macro notes. It never mutates real state and all outputs carry provenance.
 *
 * Routes:
 *   GET  /api/scenario/list    — scenario discovery (empty until UI populated)
 *   POST /api/scenario/evaluate— evaluate a what-if scenario against a
 *                              baseline portfolio position set.
 */
import { Router, type Request, type Response } from 'express';
import { ScenarioEngine } from '../../lib/product/scenario/ScenarioEngine.ts';
import type { PortfolioPositionInput } from '../../portfolio/types.ts';
import type { ScenarioAssumption, ScenarioAssumptionKind } from '../../lib/product/scenario/ScenarioEngine.ts';

const router = Router();

/**
 * GET /api/scenario/list — discovery surface for the Scenario UI.
 */
router.get('/list', (_req: Request, res: Response) => {
  res.json({ scenarios: [], count: 0 });
});

/**
 * POST /api/scenario/evaluate — evaluate a what-if scenario.
 *
 * The payload contains a baseline portfolio (positions) and a set of assumptions
 * (price shocks, allocation deltas, cash moves, macro notes). The engine returns
 * a ScenarioResult with baseline/shocked snapshots, differences, and provenance.
 *
 * Validation is fail-closed: missing or malformed fields return a typed 400.
 */
router.post('/evaluate', async (req: Request, res: Response) => {
  const body = req.body ?? {};

  const asOfDate = typeof body.asOfDate === 'string' ? body.asOfDate.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
    return res.status(400).json({ error: 'INVALID_DATE', code: 'asOfDate must be YYYY-MM-DD' });
  }

  const baseline = body.baseline;
  if (!Array.isArray(baseline) || baseline.length === 0) {
    return res.status(400).json({ error: 'MISSING_FIELD', code: 'baseline positions array is required' });
  }

  // Normalize baseline positions to upper-symbol format
  const normalizedPositions: readonly PortfolioPositionInput[] = baseline.map((p: any) => ({
    symbol: String(p.symbol?.trim()?.toUpperCase() ?? '').replace(/\s+/g, '') || '',
    quantity: typeof p.quantity === 'number' ? p.quantity : 0,
    markPrice: typeof p.markPrice === 'number' && Number.isFinite(p.markPrice) ? p.markPrice : null,
    assetClass: typeof p.assetClass === 'string' ? p.assetClass.trim().toUpperCase() : 'EQUITY',
  })).filter((p): p is PortfolioPositionInput => !!p.symbol) as readonly PortfolioPositionInput[];

  if (normalizedPositions.length === 0) {
    return res.status(400).json({ error: 'INVALID_BASELINE', code: 'baseline must contain at least one valid position' });
  }

  const assumptions = body.assumptions;
  if (!Array.isArray(assumptions)) {
    return res.status(400).json({ error: 'MISSING_FIELD', code: 'assumptions array is required' });
  }

  // Normalize assumptions
  const normalizedAssumptions = assumptions.map((a: any) => {
    let kind: ScenarioAssumptionKind;
    if (typeof a.kind === 'string') {
      const upper = a.kind.trim().toUpperCase();
      if (['PRICE_SHOCK', 'ALLOCATION_DELTA', 'CASH_MOVE', 'MACRO_NOTE'].includes(upper)) {
        kind = upper as ScenarioAssumptionKind;
      } else {
        kind = 'PRICE_SHOCK' as ScenarioAssumptionKind;
      }
    } else {
      kind = 'PRICE_SHOCK' as ScenarioAssumptionKind;
    }
    return {
      kind,
      target: typeof a.target === 'string' ? a.target.trim() : '',
      value: typeof a.value === 'number' && Number.isFinite(a.value) ? a.value : 0,
      label: typeof a.label === 'string' ? a.label.trim() : '',
    };
  });

  try {
    const result = ScenarioEngine.run({
      baseline: normalizedPositions as readonly PortfolioPositionInput[],
      assumptions: normalizedAssumptions as readonly ScenarioAssumption[],
      asOfDate,
    });
    res.json({
      result,
      advisoryOnly: true,
    });
  } catch (error: any) {
    console.error('Error in POST /api/scenario/evaluate:', error);
    return res.status(500).json({
      error: 'SCENARIO_EVALUATION_FAILED',
      advisoryOnly: true,
      ...(process.env.NODE_ENV !== 'production' ? { dev: error.message } : {}),
    });
  }
});

export function createScenarioApiRouter() {
  return router;
}