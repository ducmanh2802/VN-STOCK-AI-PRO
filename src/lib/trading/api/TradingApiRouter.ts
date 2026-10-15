import { Router, type Request, type Response } from 'express';
import type { OrderType, OrderSide } from '../types/trading.ts';
import type { TradingEngine } from '../engine/TradingEngine.ts';
import { getRealtimeQuote, type RealtimeQuote } from '../../../services/market/realMarketDataService.ts';
import { PortfolioRiskMetrics } from '../risk/PortfolioRiskMetrics.ts';
import {
  PaperOrderRiskBoundary,
  type PaperOrderResult,
} from '../../../services/trading/PaperOrderRiskBoundary.ts';

interface ApiError {
  code: string;
  message: string;
}

export interface TradingOrderRequest {
  symbol?: unknown;
  side?: unknown;
  quantity?: unknown;
  orderType?: unknown;
  limitPrice?: unknown;
  clientOrderId?: unknown;
  /** Protective stop in VND. Mandatory for BUY — never synthesized server-side. */
  stopLoss?: unknown;
  /** Profit target in VND. Mandatory for BUY — never synthesized server-side. */
  targetPrice?: unknown;
}

export function validateTradingOrder(body: TradingOrderRequest): ApiError | null {
  const symbol = typeof body.symbol === 'string' ? body.symbol.trim().toUpperCase() : '';
  if (!symbol || !/^[A-Z0-9_.]{1,20}$/.test(symbol)) {
    return { code: 'INVALID_SYMBOL', message: 'symbol must be a valid ticker (e.g. HPG, FPT).' };
  }
  if (body.side !== 'BUY' && body.side !== 'SELL') {
    return { code: 'INVALID_ORDER', message: 'side must be BUY or SELL.' };
  }
  if (
    typeof body.quantity !== 'number' ||
    !Number.isInteger(body.quantity) ||
    body.quantity <= 0 ||
    body.quantity < 100 ||
    body.quantity % 100 !== 0
  ) {
    return { code: 'INVALID_QUANTITY', message: 'quantity must be an integer board lot of at least 100 shares (multiple of 100).' };
  }
  if (body.orderType !== 'MARKET' && body.orderType !== 'LIMIT') {
    return { code: 'INVALID_ORDER', message: 'orderType must be MARKET or LIMIT.' };
  }
  if (body.orderType === 'LIMIT') {
    if (typeof body.limitPrice !== 'number' || !Number.isFinite(body.limitPrice) || body.limitPrice <= 0) {
      return { code: 'INVALID_PRICE', message: 'LIMIT order requires a positive finite limit price in VND.' };
    }
  }
  if (body.clientOrderId !== undefined) {
    if (typeof body.clientOrderId !== 'string' || !body.clientOrderId.trim()) {
      return { code: 'INVALID_ORDER', message: 'clientOrderId must be a non-empty string when provided.' };
    }
  }
  // Protective envelope: shape-checked here, evaluated authoritatively by RiskGuard.
  // A BUY without it is refused fail-closed by the boundary rather than synthesized.
  for (const field of ['stopLoss', 'targetPrice'] as const) {
    const value = body[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return { code: 'INVALID_PRICE', message: `${field} must be a positive finite number in VND when provided.` };
    }
  }
  return null;
}

const fail = (res: Response, status: number, error: ApiError, data?: unknown) =>
  res.status(status).json({ success: false, error, data });

export interface TradingApiRouterOptions {
  getQuoteFn?: (symbol: string) => Promise<RealtimeQuote>;
  /** Overrides the risk boundary. Tests may inject a boundary over a fake engine. */
  riskBoundary?: PaperOrderRiskBoundary;
}

/** Maps a boundary rejection onto the closest HTTP status without losing the code. */
function statusForBoundary(code: string): number {
  switch (code) {
    case 'DATA_UNAVAILABLE':
    case 'STALE_DATA':
    case 'INVALID_MARKET_DATA':
      return 503;
    case 'RISK_PARAMETERS_REQUIRED':
      return 422;
    default:
      return 409;
  }
}

/**
 * Paper-trading HTTP surface. It owns **no** trading state and **no** risk logic.
 *
 * P0-01 SECURITY CONTRACT — the only path from HTTP to the broker is
 * `PaperOrderRiskBoundary.submit`, which enforces, fail-closed and in order:
 *   simulation-only assertion -> real market data -> RiskGuard
 *   -> RiskManager -> PositionSizer -> OrderManager -> PaperBroker.
 * A rejected or zero-sized decision never reaches `PaperBroker.submitOrder`.
 * Every response carries `riskTrace` proving which engines actually ran.
 */
export function createTradingApiRouter(
  engine: TradingEngine,
  options: TradingApiRouterOptions = {}
): Router {
  const router = Router();
  const riskBoundary =
    options.riskBoundary ??
    new PaperOrderRiskBoundary(engine, options.getQuoteFn ? { getQuote: options.getQuoteFn } : {});

  router.get('/status', (_req, res) =>
    res.json({
      success: true,
      data: {
        tradingEnabled: engine.isTradingEnabled(),
        emergencyStop: engine.isEmergencyStopActive(),
        brokerMode: 'PAPER',
        isSimulation: engine.getBroker().isSimulation,
        paperTradingOnly: true,
        liveTradingEnabled: false,
        session: 'validated by TradingEngine & TradingDataValidator',
      },
    })
  );

  router.get('/portfolio', async (_req, res) => {
    try {
      const account = await engine.getAccount();
      return res.json({ success: true, data: account });
    } catch (err: any) {
      return fail(res, 500, { code: 'PORTFOLIO_ERROR', message: err.message || 'Failed to fetch account state' });
    }
  });

  router.get('/positions', async (_req, res) => {
    try {
      const positions = await engine.getPositions();
      return res.json({ success: true, data: positions });
    } catch (err: any) {
      return fail(res, 500, { code: 'POSITIONS_ERROR', message: err.message || 'Failed to fetch positions' });
    }
  });

  router.get('/orders', async (_req, res) => {
    try {
      const orders = await engine.getOrderManager().getAllOrders();
      return res.json({ success: true, data: orders });
    } catch (err: any) {
      return fail(res, 500, { code: 'ORDERS_ERROR', message: err.message || 'Failed to fetch orders' });
    }
  });

  // P0-01: the router is wiring only. Every risk verdict comes from the boundary,
  // which drives RiskGuard -> RiskManager -> PositionSizer before the broker.
  router.post('/order', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as TradingOrderRequest;
    const invalid = validateTradingOrder(body);
    if (invalid) return fail(res, 400, invalid);

    const outcome: PaperOrderResult = await riskBoundary.submit({
      symbol: (body.symbol as string).trim().toUpperCase(),
      side: body.side as OrderSide,
      quantity: body.quantity as number,
      orderType: body.orderType as OrderType,
      limitPrice: typeof body.limitPrice === 'number' ? body.limitPrice : undefined,
      clientOrderId: typeof body.clientOrderId === 'string' ? body.clientOrderId.trim() : undefined,
      stopLoss: typeof body.stopLoss === 'number' ? body.stopLoss : undefined,
      targetPrice: typeof body.targetPrice === 'number' ? body.targetPrice : undefined,
    });

    if (!outcome.success) {
      return fail(
        res,
        statusForBoundary(outcome.code),
        { code: outcome.code, message: outcome.message },
        { order: outcome.order ?? null, riskTrace: outcome.trace }
      );
    }

    return res.status(201).json({
      success: true,
      data: outcome.order,
      riskTrace: outcome.trace,
    });
  });

  router.post('/cancel', async (req: Request, res: Response) => {
    const orderId = typeof req.body?.orderId === 'string' ? req.body.orderId.trim() : '';
    if (!orderId) return fail(res, 400, { code: 'INVALID_ORDER', message: 'orderId is required.' });
    const result = await engine.getOrderManager().cancelOrder(orderId);
    if (!result.success) {
      return fail(res, 409, result.error ?? { code: 'INVALID_ORDER', message: 'Cancellation failed.' });
    }
    return res.json({ success: true, data: result.order });
  });

  // Server-authoritative risk metrics. The frontend must never compute these.
  // Missing/insufficient inputs yield value=null + explicit status (fail-closed).
  router.get('/risk-metrics', async (_req, res) => {
    try {
      const account = await engine.getAccount();
      const report = PortfolioRiskMetrics.compute({
        account,
        policy: {
          maxPositionPercent: 20,
          maxPortfolioExposurePercent: 80,
          maxRiskPerTradePercent: 1,
          dailyLossLimitPercent: 3,
          minimumCashPercent: 10,
        },
        stressShocks: { mild: 0.03, moderate: 0.06, severe: 0.1 },
        // No historical returns / equity telemetry is wired in the process-local paper runtime:
        // VaR & drawdown therefore report INSUFFICIENT_DATA (value=null) fail-closed.
      });
      return res.json({ success: true, data: report });
    } catch (err: any) {
      return fail(res, 500, {
        code: 'RISK_METRICS_ERROR',
        message: err.message || 'Failed to compute risk metrics',
      });
    }
  });

  return router;
}
