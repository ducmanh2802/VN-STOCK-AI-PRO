import { Router, type Request, type Response } from 'express';
import type { OrderType } from '../types/trading.ts';
import type { TradingEngine } from '../engine/TradingEngine.ts';

interface ApiError { code: string; message: string; }
export interface TradingOrderRequest { symbol?: unknown; side?: unknown; quantity?: unknown; orderType?: unknown; }

export function validateTradingOrder(body: TradingOrderRequest): ApiError | null {
  const symbol = typeof body.symbol === 'string' ? body.symbol.trim().toUpperCase() : '';
  if (!/^[A-Z0-9_.]{1,20}$/.test(symbol)) return { code: 'INVALID_SYMBOL', message: 'symbol must be a valid ticker.' };
  if (body.side !== 'BUY' && body.side !== 'SELL') return { code: 'INVALID_ORDER', message: 'side must be BUY or SELL.' };
  if (!Number.isInteger(body.quantity) || (body.quantity as number) < 100 || (body.quantity as number) % 100 !== 0) {
    return { code: 'INVALID_QUANTITY', message: 'quantity must be an integer board lot of at least 100 shares.' };
  }
  if (body.orderType !== 'MARKET' && body.orderType !== 'LIMIT') return { code: 'INVALID_ORDER', message: 'orderType must be MARKET or LIMIT.' };
  return null;
}

const fail = (res: Response, status: number, error: ApiError) => res.status(status).json({ success: false, error });

/**
 * Paper-trading HTTP surface. It delegates all state reads and mutations to
 * TradingEngine/OrderManager/BrokerAdapter; the router owns no trading state.
 */
export function createTradingApiRouter(engine: TradingEngine): Router {
  const router = Router();
  router.get('/status', (_req, res) => res.json({ success: true, data: {
    tradingEnabled: engine.isTradingEnabled(), emergencyStop: engine.isEmergencyStopActive(),
    brokerMode: 'PAPER', session: 'validated by TradingEngine',
  }}));
  router.get('/portfolio', async (_req, res) => res.json({ success: true, data: await engine.getAccount() }));
  router.get('/positions', async (_req, res) => res.json({ success: true, data: await engine.getPositions() }));
  router.get('/orders', async (_req, res) => res.json({ success: true, data: await engine.getOrderManager().getAllOrders() }));

  router.post('/order', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as TradingOrderRequest;
    const invalid = validateTradingOrder(body);
    if (invalid) return fail(res, 400, invalid);
    const symbol = (body.symbol as string).trim().toUpperCase();
    const result = await engine.runTradingCycle({
      symbol,
      orderType: body.orderType as OrderType,
      sellQuantity: body.side === 'SELL' ? body.quantity as number : undefined,
    });
    if (result.status !== 'TRADED') {
      return fail(res, result.rejectionCode === 'DATA_UNAVAILABLE' ? 503 : 409, {
        code: result.rejectionCode ?? 'NO_TRADE', message: result.reason ?? 'Trade was not executed.',
      });
    }
    return res.status(201).json({ success: true, data: result });
  });

  router.post('/cancel', async (req: Request, res: Response) => {
    const orderId = typeof req.body?.orderId === 'string' ? req.body.orderId.trim() : '';
    if (!orderId) return fail(res, 400, { code: 'INVALID_ORDER', message: 'orderId is required.' });
    const result = await engine.getOrderManager().cancelOrder(orderId);
    if (!result.success) return fail(res, 409, result.error ?? { code: 'INVALID_ORDER', message: 'Cancellation failed.' });
    return res.json({ success: true, data: result.order });
  });
  return router;
}
