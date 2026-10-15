/**
 * PHASE 25 — STRATEGY SIGNAL API ROUTER
 * ======================================
 * The first production entrypoint for the multi-asset StrategyIntelligenceService.
 * Before this router existed, the entire Phase 21–25 intelligence cluster
 * (StrategyContextAggregator → Derivatives/ETF/Corporate-Actions/Earnings/
 * Capital-Cycle/Macro-Regime snapshot services) was reachable only from tests:
 * the engines were certified per-domain while having zero non-test callers.
 *
 * This router is ADVISORY ONLY. A strategy signal never places an order and never
 * mutates a position: it is a deterministic, provenance-stamped recommendation
 * built from real upstream snapshots. Execution remains exclusively behind the
 * protected trading boundary (RiskGuard / TradingEngine / PositionSizer).
 *
 * Routes:
 *   GET  /api/strategy/list    — registered strategy generators (id, name, class).
 *   POST /api/strategy/signal  — evaluate one strategy against its context.
 */
import { Router, type Request, type Response } from 'express';
import { StrategyIntelligenceService } from './StrategyIntelligenceService.ts';
import { StrategyFactory } from '../../lib/strategy/StrategyFactory.ts';
import type { AssetClass, StrategyParameters } from '../../lib/strategy/types.ts';

const ASSET_CLASSES: readonly AssetClass[] = ['EQUITY', 'DERIVATIVE', 'ETF', 'CROSS_ASSET'];

const isValidAssetClass = (value: unknown): value is AssetClass =>
  typeof value === 'string' && (ASSET_CLASSES as readonly string[]).includes(value);

export function createStrategyApiRouter(): Router {
  const router = Router();

  /**
   * GET /api/strategy/list — discovery surface for the Strategy Lab UI.
   * Exposes only metadata; execution goes through POST /signal.
   */
  router.get('/list', (_req: Request, res: Response) => {
    const strategies = StrategyFactory.getAllStrategies().map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      assetClass: s.assetClass,
      defaultParameters: s.defaultParameters,
    }));
    res.json({ strategies, count: strategies.length });
  });

  /**
   * POST /api/strategy/signal — evaluate a registered multi-asset strategy.
   *
   * Validation is explicit and fail-closed: an unregistered strategy id returns a
   * fail-closed signal (never a 500), a malformed payload returns a typed 400.
   */
  router.post('/signal', async (req: Request, res: Response) => {
    const body = req.body ?? {};

    const strategyId = typeof body.strategyId === 'string' ? body.strategyId.trim() : '';
    const symbol = typeof body.symbol === 'string' ? body.symbol.trim().toUpperCase() : '';

    if (!strategyId) {
      return res.status(400).json({ error: 'MISSING_FIELD', code: 'strategyId is required' });
    }
    if (!/^[A-Z0-9_.]{1,40}$/.test(strategyId)) {
      return res.status(400).json({ error: 'INVALID_STRATEGY_ID', code: 'strategyId format is invalid' });
    }
    if (!symbol || !/^[A-Z0-9_.]{1,20}$/.test(symbol)) {
      return res.status(400).json({ error: 'MISSING_FIELD', code: 'symbol is required and must match ^[A-Z0-9_.]{1,20}$' });
    }

    if (body.asOfDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(body.asOfDate))) {
      return res.status(400).json({ error: 'INVALID_DATE', code: 'asOfDate must be YYYY-MM-DD' });
    }
    if (body.assetClass !== undefined && !isValidAssetClass(body.assetClass)) {
      return res.status(400).json({ error: 'INVALID_ASSET_CLASS', code: `assetClass must be one of ${ASSET_CLASSES.join(', ')}` });
    }
    if (body.currentPrice !== undefined && body.currentPrice !== null && typeof body.currentPrice !== 'number') {
      return res.status(400).json({ error: 'INVALID_PRICE', code: 'currentPrice must be a number or null' });
    }
    if (body.parameters !== undefined && (typeof body.parameters !== 'object' || body.parameters === null || Array.isArray(body.parameters))) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS', code: 'parameters must be a plain object' });
    }

    try {
      const signal = await StrategyIntelligenceService.evaluateSignal({
        strategyId,
        symbol,
        assetClass: body.assetClass,
        asOfDate: body.asOfDate,
        currentPrice: body.currentPrice,
        parameters: body.parameters as StrategyParameters | undefined,
        forceRefresh: body.forceRefresh === true,
      });
      return res.json({
        signal,
        advisoryOnly: true,
        executionBoundary: 'protected trading stack; strategy signals cannot place orders',
      });
    } catch (error: any) {
      console.error('Error in POST /api/strategy/signal:', error);
      return res.status(500).json({
        error: 'STRATEGY_EVALUATION_FAILED',
        advisoryOnly: true,
        ...(process.env.NODE_ENV !== 'production' && error instanceof Error ? { dev: error.message } : {}),
      });
    }
  });

  return router;
}