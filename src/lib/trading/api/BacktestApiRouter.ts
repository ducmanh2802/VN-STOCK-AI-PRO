/**
 * BACKTEST HTTP SURFACE
 * =====================
 * Read-only, side-effect-free endpoint that runs the certified Phase 18.2
 * `BacktestEngine` against REAL KBS historical bars.
 *
 * Contracts:
 *   - Zero synthetic data: candles come from `BacktestDataProvider` (KBS) only.
 *   - Zero tampering with the cost model: commission / tax / slippage / lot size
 *     stay at the canonical Vietnamese defaults baked into `BacktestEngine`.
 *   - Fail-closed validation: every rejected request answers with a stable
 *     error code instead of silently substituting defaults for bad input.
 *   - Advisory only: a backtest result is research output. It never places an
 *     order and never bypasses RiskGuard / TradingEngine.
 */

import { Router, type Request, type Response } from 'express';
import type { InvestmentHorizon } from '../../../types/recommendation.ts';
import { BacktestDataProvider } from '../backtest/BacktestDataProvider.ts';
import { BacktestEngine } from '../backtest/BacktestEngine.ts';
import { BacktestDataError, type BacktestResult } from '../backtest/BacktestTypes.ts';

export interface BacktestRunRequest {
  symbol?: unknown;
  strategy?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  initialCapital?: unknown;
}

export interface BacktestApiError {
  code: string;
  message: string;
}

/** Hard ceiling on the requested window so one call cannot pin the provider. */
export const MAX_BACKTEST_DAYS = 3653; // ~10 years
export const MIN_BARS_REQUIRED = 30;

const HORIZONS: readonly InvestmentHorizon[] = ['SHORT_TERM', 'MEDIUM_TERM', 'LONG_TERM'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value: unknown): string | null {
  if (typeof value !== 'string' || !ISO_DATE.test(value.trim())) return null;
  const trimmed = value.trim();
  return Number.isNaN(new Date(`${trimmed}T00:00:00Z`).getTime()) ? null : trimmed;
}

function daysBetween(start: string, end: string): number {
  const s = Date.parse(`${start}T00:00:00Z`);
  const e = Date.parse(`${end}T00:00:00Z`);
  return Math.round((e - s) / 86_400_000);
}

function isoDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/**
 * Fail-closed request validation. Returns `null` when the request is valid,
 * otherwise the first stable error code + human-readable message.
 */
export function validateBacktestRequest(
  body: BacktestRunRequest
): { error: BacktestApiError; status: number } | null {
  const symbol = typeof body.symbol === 'string' ? body.symbol.trim().toUpperCase() : '';
  if (!symbol || !/^[A-Z0-9_.]{1,20}$/.test(symbol)) {
    return {
      status: 400,
      error: { code: 'INVALID_SYMBOL', message: 'symbol must be a valid ticker (e.g. HPG, FPT).' },
    };
  }

  if (body.strategy !== undefined && !HORIZONS.includes(body.strategy as InvestmentHorizon)) {
    return {
      status: 400,
      error: {
        code: 'INVALID_STRATEGY',
        message: `strategy must be one of ${HORIZONS.join(', ')}.`,
      },
    };
  }

  const capital = body.initialCapital;
  if (
    typeof capital !== 'number' ||
    !Number.isFinite(capital) ||
    !Number.isInteger(capital) ||
    capital <= 0
  ) {
    return {
      status: 400,
      error: {
        code: 'INVALID_CAPITAL',
        message: 'initialCapital must be a positive integer amount in VND.',
      },
    };
  }

  const start = body.startDate === undefined ? null : parseDate(body.startDate);
  const end = body.endDate === undefined ? null : parseDate(body.endDate);
  if (body.startDate !== undefined && start === null) {
    return {
      status: 400,
      error: { code: 'INVALID_DATE', message: 'startDate must be an ISO date (YYYY-MM-DD).' },
    };
  }
  if (body.endDate !== undefined && end === null) {
    return {
      status: 400,
      error: { code: 'INVALID_DATE', message: 'endDate must be an ISO date (YYYY-MM-DD).' },
    };
  }

  const resolvedStart = start ?? isoDaysAgo(730);
  const resolvedEnd = end ?? isoDaysAgo(0);

  if (daysBetween(resolvedStart, resolvedEnd) <= 0) {
    return {
      status: 400,
      error: { code: 'INVALID_RANGE', message: 'endDate must be after startDate.' },
    };
  }
  if (daysBetween(resolvedStart, resolvedEnd) > MAX_BACKTEST_DAYS) {
    return {
      status: 400,
      error: {
        code: 'RANGE_TOO_LARGE',
        message: `Requested window exceeds ${MAX_BACKTEST_DAYS} days (~10 years).`,
      },
    };
  }

  return null;
}

/** Resolves validated (or defaulted) window + capital from a raw request body. */
export function resolveBacktestRequest(body: BacktestRunRequest) {
  const symbol = (body.symbol as string).trim().toUpperCase();
  const strategy = (body.strategy as InvestmentHorizon | undefined) ?? 'SHORT_TERM';
  const startDate = parseDate(body.startDate) ?? isoDaysAgo(730);
  const endDate = parseDate(body.endDate) ?? isoDaysAgo(0);
  const initialCapital = body.initialCapital as number;
  return { symbol, strategy, startDate, endDate, initialCapital };
}

const MAX_TRADES_RETURNED = 300;

function serializeResult(result: BacktestResult) {
  const tradeHistory = result.tradeHistory.slice(-MAX_TRADES_RETURNED);
  return {
    ...result,
    tradeHistory,
    tradeHistoryTruncated: result.tradeHistory.length > tradeHistory.length,
    totalTradeCount: result.tradeHistory.length,
  };
}

export function createBacktestApiRouter(): Router {
  const router = Router();

  router.get('/strategies', (_req: Request, res: Response) => {
    res.json({
      strategies: HORIZONS,
      costModel: {
        note: 'Canonical Vietnamese statutory cost model — fixed server-side, never client-supplied.',
        buyCommissionPct: 0.15,
        sellCommissionPct: 0.15,
        sellTaxPct: 0.1,
        slippagePct: 0.1,
        boardLot: 100,
        antiLookahead: 'CLOSE[t] -> OPEN[t+1]',
      },
    });
  });

  router.post('/run', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as BacktestRunRequest;
    const invalid = validateBacktestRequest(body);
    if (invalid) {
      return res.status(invalid.status).json({ success: false, error: invalid.error });
    }

    const { symbol, strategy, startDate, endDate, initialCapital } = resolveBacktestRequest(body);

    try {
      const candles = await BacktestDataProvider.getHistoricalData(symbol, startDate, endDate);
      if (candles.length < MIN_BARS_REQUIRED) {
        return res.status(503).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_DATA',
            message: `Only ${candles.length} real bars returned; at least ${MIN_BARS_REQUIRED} are required for a meaningful run.`,
          },
        });
      }

      const engine = new BacktestEngine({
        symbol,
        startDate,
        endDate,
        initialCapital,
        strategy,
      });
      const result = await engine.run(candles);

      return res.json({
        success: true,
        dataStatus: 'OK',
        dataSource: 'KBS',
        provenance: {
          symbol,
          strategy,
          startDate,
          endDate,
          requestedBars: candles.length,
          firstBar: String(candles[0].timestamp),
          lastBar: String(candles[candles.length - 1].timestamp),
          engine: 'BacktestEngine/Phase18.2',
          antiLookahead: 'CLOSE[t] -> OPEN[t+1]',
          boardLot: 100,
        },
        result: serializeResult(result),
        retrievedAt: new Date().toISOString(),
      });
    } catch (error) {
      const code = error instanceof BacktestDataError ? error.code : 'DATA_UNAVAILABLE';
      const message = error instanceof Error ? error.message : 'Backtest execution failed';
      // A provider failure is an honest "no data" answer — 503, never a fake result.
      return res.status(503).json({
        success: false,
        error: { code: String(code), message },
      });
    }
  });

  return router;
}
