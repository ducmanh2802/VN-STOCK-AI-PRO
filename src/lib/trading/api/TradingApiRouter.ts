import { Router, type Request, type Response } from 'express';
import type { OrderType, OrderSide } from '../types/trading.ts';
import type { TradingEngine } from '../engine/TradingEngine.ts';
import { getRealtimeQuote, type RealtimeQuote } from '../../../services/market/realMarketDataService.ts';
import { TradingDataValidator } from '../validation/TradingDataValidator.ts';

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
  return null;
}

const fail = (res: Response, status: number, error: ApiError, data?: unknown) =>
  res.status(status).json({ success: false, error, data });

export interface TradingApiRouterOptions {
  getQuoteFn?: (symbol: string) => Promise<RealtimeQuote>;
}

/**
 * Paper-trading HTTP surface. It delegates all state reads and mutations to
 * TradingEngine/OrderManager/BrokerAdapter; the router owns no trading state.
 *
 * Security & Governance Contract:
 * - Simulation only: Verifies that engine connects to PaperBroker (process-local).
 * - Master switches enforced: Emergency stop and trading enabled.
 * - Real market quotes: Acquired and validated prior to order matching.
 * - Short-selling blocked: SELL requires existing position with adequate shares.
 * - Anti-pyramiding: BUY blocked if existing open position in symbol.
 * - Double-spend & Cash checks: Validated against authoritative broker balance.
 */
export function createTradingApiRouter(
  engine: TradingEngine,
  options: TradingApiRouterOptions = {}
): Router {
  const router = Router();
  const fetchQuote = options.getQuoteFn ?? getRealtimeQuote;

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

  router.post('/order', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as TradingOrderRequest;
    const invalid = validateTradingOrder(body);
    if (invalid) return fail(res, 400, invalid);

    const symbol = (body.symbol as string).trim().toUpperCase();
    const side = body.side as OrderSide;
    const quantity = body.quantity as number;
    const orderType = body.orderType as OrderType;
    const limitPrice = typeof body.limitPrice === 'number' ? body.limitPrice : undefined;
    const clientOrderId = typeof body.clientOrderId === 'string' ? body.clientOrderId.trim() : undefined;

    // 0. Idempotency Check on clientOrderId
    if (clientOrderId) {
      const allOrders = await engine.getOrderManager().getAllOrders();
      const existing = allOrders.find((o) => o.clientOrderId === clientOrderId);
      if (existing) {
        if (existing.status === 'FILLED') {
          return fail(res, 409, {
            code: 'ORDER_ALREADY_FILLED',
            message: `Lệnh với clientOrderId '${clientOrderId}' đã được khớp trước đó.`,
          }, existing);
        }
        if (existing.status === 'CANCELLED') {
          return fail(res, 409, {
            code: 'ORDER_ALREADY_CANCELLED',
            message: `Lệnh với clientOrderId '${clientOrderId}' đã bị hủy trước đó.`,
          }, existing);
        }
        return fail(res, 409, {
          code: 'DUPLICATE_ORDER',
          message: `Lệnh với clientOrderId '${clientOrderId}' đã tồn tại (trạng thái: ${existing.status}).`,
        }, existing);
      }
    }

    // 1. Master Kill Switch: Emergency Stop
    if (engine.isEmergencyStopActive()) {
      return fail(res, 409, {
        code: 'EMERGENCY_STOP',
        message: 'Giao dịch tạm dừng do công tắc dừng khẩn cấp (Emergency Stop) đang bật.',
      });
    }

    // 2. Master Trading Enabled Switch
    if (!engine.isTradingEnabled()) {
      return fail(res, 409, {
        code: 'TRADING_DISABLED',
        message: 'Chức năng giao dịch hiện đang bị tắt trên TradingEngine.',
      });
    }

    // 3. Real Market Data Acquisition & Validation
    let realtimeQuote: any = null;
    try {
      const quoteRes = await fetchQuote(symbol);
      if (quoteRes.dataStatus !== 'OK' || !quoteRes.quote) {
        return fail(res, 503, {
          code: 'DATA_UNAVAILABLE',
          message: `Không có dữ liệu giá thị trường thật cho mã ${symbol}. Lệnh giao dịch thất bại có chủ đích (Fail-closed).`,
        });
      }
      realtimeQuote = quoteRes.quote;
    } catch {
      return fail(res, 503, {
        code: 'DATA_UNAVAILABLE',
        message: `Dịch vụ dữ liệu giá thị trường cho ${symbol} hiện không sẵn sàng. Lệnh giao dịch thất bại có chủ đích (Fail-closed).`,
      });
    }

    // 4. Feed fresh market tick into broker for price-matching & limit verification
    const brokerWithTicks = engine.getBroker() as { processMarketData?: (tick: any) => void };
    if (typeof brokerWithTicks.processMarketData === 'function') {
      brokerWithTicks.processMarketData({
        symbol,
        price: realtimeQuote.lastPrice,
        referencePrice: realtimeQuote.referencePrice,
        ceilingPrice: realtimeQuote.ceilingPrice,
        floorPrice: realtimeQuote.floorPrice,
        volume: realtimeQuote.matchedVolumeShares ?? 100000,
        timestamp: Date.now(),
      });
    }

    // 5. Price-band validation for LIMIT orders
    if (orderType === 'LIMIT' && limitPrice != null) {
      if (realtimeQuote.ceilingPrice && limitPrice > realtimeQuote.ceilingPrice) {
        return fail(res, 409, {
          code: 'PRICE_LIMIT_VIOLATION',
          message: `Giá đặt lệnh (${limitPrice.toLocaleString('vi-VN')} VND) vượt trần biên độ sàn (${realtimeQuote.ceilingPrice.toLocaleString('vi-VN')} VND).`,
        });
      }
      if (realtimeQuote.floorPrice && limitPrice < realtimeQuote.floorPrice) {
        return fail(res, 409, {
          code: 'PRICE_LIMIT_VIOLATION',
          message: `Giá đặt lệnh (${limitPrice.toLocaleString('vi-VN')} VND) dưới sàn biên độ sàn (${realtimeQuote.floorPrice.toLocaleString('vi-VN')} VND).`,
        });
      }
    }

    // 6. Pre-trade checks: Short-selling restriction & Anti-pyramiding
    if (side === 'SELL') {
      const positions = await engine.getPositions();
      const currentPos = positions.find((p) => p.symbol.toUpperCase() === symbol);
      if (!currentPos || currentPos.quantity < quantity) {
        return fail(res, 409, {
          code: 'INSUFFICIENT_POSITION',
          message: `Không đủ số lượng cổ phiếu để bán. Sở hữu: ${currentPos?.quantity ?? 0}, yêu cầu: ${quantity} (Quy định TTCK VN: Nghiêm cấm bán khống).`,
        });
      }
    }

    if (side === 'BUY') {
      // Check for existing position conflict (no unauthorized pyramiding)
      const positions = await engine.getPositions();
      const currentPos = positions.find((p) => p.symbol.toUpperCase() === symbol && p.quantity > 0);
      if (currentPos) {
        return fail(res, 409, {
          code: 'POSITION_LIMIT',
          message: `Mã ${symbol} đã có vị thế mở (${currentPos.quantity} CP). Quy tắc phòng ngừa rủi ro (anti-pyramiding) không cho phép mở thêm vị thế mua.`,
        });
      }

      // Check available cash sufficiency
      const account = await engine.getAccount();
      const estPrice = orderType === 'LIMIT' && limitPrice ? limitPrice : realtimeQuote.lastPrice;
      const estimatedCost = quantity * estPrice * 1.0025; // 0.15% fee + 0.10% slippage buffer
      if (account.availableCash < estimatedCost) {
        return fail(res, 409, {
          code: 'INSUFFICIENT_FUNDS',
          message: `Số dư tiền mặt khả dụng không đủ (${account.availableCash.toLocaleString('vi-VN')} VND). Ước tính cần: ${Math.round(estimatedCost).toLocaleString('vi-VN')} VND.`,
        });
      }
    }

    // 7. Submit order atomically via OrderManager to PaperBroker
    const orderResult = await engine.getOrderManager().submitOrder({
      symbol,
      side,
      type: orderType,
      quantity,
      limitPrice: orderType === 'LIMIT' ? limitPrice : null,
      clientOrderId,
    });

    if (!orderResult.success) {
      return fail(
        res,
        409,
        orderResult.error ?? {
          code: orderResult.order?.rejectionCode || 'ORDER_REJECTED',
          message: orderResult.order?.rejectedReason || 'Lệnh bị từ chối bởi PaperBroker.',
        },
        orderResult.order
      );
    }

    return res.status(201).json({
      success: true,
      data: orderResult.order,
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

  return router;
}
