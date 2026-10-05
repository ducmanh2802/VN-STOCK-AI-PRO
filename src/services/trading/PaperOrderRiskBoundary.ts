/**
 * P0-01 REMEDIATION — PAPER ORDER RISK BOUNDARY
 * ============================================
 * The single authoritative composition layer between the HTTP trading surface
 * and the paper broker. It exists because the previous path
 * (`TradingApiRouter` -> `OrderManager.submitOrder` -> `PaperBroker`) reached the
 * broker with no RiskGuard, no RiskManager and no PositionSizer.
 *
 * REQUIRED ORDER OF EVALUATION (fail-closed at every step):
 *
 *   simulation-only assertion
 *          |
 *          v
 *   real market-data acquisition (no synthetic fallback)
 *          |
 *          v
 *   RiskGuard.evaluate            <- first line of defense, EVERY order
 *          |
 *          v
 *   RiskManager.checkRisk         <- capital-allocating gate (opens exposure)
 *          |
 *          v
 *   PositionSizer.calculate       <- quantity authority (capital ceiling bound)
 *          |
 *          v
 *   OrderManager.submitDecision   <- decision -> order
 *          |
 *          v
 *   PaperBroker.submitOrder       <- simulation-only broker
 *
 * DESIGN CONSTRAINTS HONOURED HERE
 * - No risk logic is duplicated: every verdict comes from the certified engines
 *   (`RiskGuard`, `RiskManager`, `PositionSizer`). This file only *assembles* them.
 * - No second `PositionSizer` is created. The instance used is the engine-owned
 *   authoritative `RiskManager` plus the single static `PositionSizer.calculate`.
 * - No broker submission is possible without a prior approved verdict.
 * - A non-simulation broker fails closed BEFORE any risk evaluation or submission.
 *
 * SIDE-AWARE GATING (documented, deliberate)
 * `RiskGuard` authorizes both openings and exits, and is invoked for 100% of orders.
 * `RiskManager` + `PositionSizer` size *new capital*: an exit order (`SELL`) frees
 * cash and allocates none, and `RiskManager.checkRisk` structurally rejects any
 * symbol that already has an open position (`POSITION_LIMIT`). Running the capital
 * gate on an exit would therefore reject every legitimate de-risking order, so exits
 * are gated by `RiskGuard` plus the short-sell position-sufficiency rule, which is
 * independently re-enforced inside `PaperBroker.submitOrderSync`.
 */

import { RiskGuard } from '../../lib/trading/risk/RiskGuard.ts';
import { PositionSizer } from '../../lib/trading/risk/PositionSizer.ts';
import { TradingDataValidator } from '../../lib/trading/validation/TradingDataValidator.ts';
import type { TradingEngine } from '../../lib/trading/engine/TradingEngine.ts';
import type {
  Order,
  OrderType,
  ValidationErrorCode,
} from '../../lib/trading/types/trading.ts';
import type { OrderResult } from '../../lib/trading/execution/BrokerAdapter.ts';
import type {
  BrokerAccount,
  BrokerPosition,
} from '../../lib/trading/execution/BrokerAdapter.ts';
import { getRealtimeQuote, type RealtimeQuote } from '../market/realMarketDataService.ts';

/** Canonical reason a submitted quantity collapsed to zero. */
export type OrderZeroCause =
  | 'ZERO_BY_RISK'
  | 'ZERO_BY_SIZING'
  | 'ZERO_BY_LIQUIDITY'
  | 'ZERO_BY_DATA';

/** Per-engine invocation proof, surfaced on every response (success and failure). */
export interface RiskGateInvocation {
  riskGuard: boolean;
  riskManager: boolean;
  positionSizer: boolean;
  paperBroker: boolean;
}

export interface OrderRiskTrace {
  /** True only when the connected adapter declares itself a simulation. */
  simulationOnly: boolean;
  gates: RiskGateInvocation;
  requestedQuantity: number;
  riskApprovedQuantity: number;
  submittedQuantity: number;
  positionSizeReduced: boolean;
  /** Non-null only when the quantity collapsed to zero. */
  zeroCause: OrderZeroCause | null;
  /** Human/audit explanation of which engines were evaluated and why. */
  notes: string[];
}

export interface PaperOrderRequest {
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  orderType: OrderType;
  limitPrice?: number | null;
  clientOrderId?: string | null;
  /** Caller-supplied protective stop. Required for BUY; never synthesized here. */
  stopLoss?: number | null;
  /** Caller-supplied profit target. Required for BUY; never synthesized here. */
  targetPrice?: number | null;
}

export interface PaperOrderResult {
  success: boolean;
  code: string;
  message: string;
  order?: Order;
  trace: OrderRiskTrace;
}

export interface PaperOrderRiskBoundaryOptions {
  /** Defaults to the real VPS/KBS quote service. Injected in tests. */
  getQuote?: (symbol: string) => Promise<RealtimeQuote>;
  /**
   * Authoritative guard instance. Defaults to `RiskGuard` with the repository
   * `DEFAULT_RISK_GUARD_POLICY`. `minimumConfidence` is deliberately disabled:
   * a direct operator order carries no model confidence score, and inventing one
   * would be fabricating risk metadata.
   */
  riskGuard?: RiskGuard;
}

const emptyTrace = (requestedQuantity: number, simulationOnly: boolean): OrderRiskTrace => ({
  simulationOnly,
  gates: { riskGuard: false, riskManager: false, positionSizer: false, paperBroker: false },
  requestedQuantity,
  riskApprovedQuantity: 0,
  submittedQuantity: 0,
  positionSizeReduced: false,
  zeroCause: null,
  notes: [],
});

/**
 * Canonical classifier for "why did the quantity collapse to zero".
 *
 * The verdict is classified by the *layer that produced it*, so a caller can tell
 * a risk-policy rejection from a liquidity constraint, a data-provenance failure
 * and a board-lot/risk-budget sizing failure. Exported for direct unit testing.
 */
export const classifyZeroCause = (
  code: ValidationErrorCode | 'APPROVED' | 'SUCCESS' | string
): OrderZeroCause => {
  switch (code) {
    // Liquidity / capital-availability constraints.
    case 'INSUFFICIENT_CASH':
    case 'EXPOSURE_LIMIT_EXCEEDED':
    case 'EXCESSIVE_EXPOSURE':
      return 'ZERO_BY_LIQUIDITY';
    // Market-data provenance, freshness or validity.
    case 'DATA_UNAVAILABLE':
    case 'STALE_DATA':
    case 'INVALID_MARKET_DATA':
    case 'INVALID_PRICE':
    case 'MARKET_CLOSED':
      return 'ZERO_BY_DATA';
    // Board-lot / risk-budget sizing collapsed the size below one tradable lot.
    case 'INVALID_LOT_SIZE':
    case 'INVALID_QUANTITY':
    case 'INVALID_CAPITAL':
    case 'EXCESSIVE_RISK':
    case 'INVALID_RISK_REWARD':
    case 'INVALID_STOP_LOSS':
      return 'ZERO_BY_SIZING';
    // Everything else is a risk-policy rejection.
    default:
      return 'ZERO_BY_RISK';
  }
};

/** @deprecated Internal alias kept short for readability at call sites. */
const zeroCauseFor = classifyZeroCause;

export class PaperOrderRiskBoundary {
  private readonly engine: TradingEngine;
  private readonly getQuote: (symbol: string) => Promise<RealtimeQuote>;
  private readonly riskGuard: RiskGuard;

  constructor(
    engine: TradingEngine,
    options: PaperOrderRiskBoundaryOptions = {}
  ) {
    this.engine = engine;
    this.getQuote = options.getQuote ?? getRealtimeQuote;
    this.riskGuard = options.riskGuard ?? new RiskGuard({ minimumConfidence: undefined });
  }

  /**
   * Runs the mandatory safety chain and, only on approval, submits to the paper
   * broker. Never throws for business rejections; always returns a trace.
   */
  async submit(request: PaperOrderRequest): Promise<PaperOrderResult> {
    const symbol = request.symbol.trim().toUpperCase();
    const requestedQuantity = request.quantity;

    // ── Gate 0: real-execution boundary. Fail closed before anything else. ──
    const broker = this.engine.getBroker();
    const trace = emptyTrace(requestedQuantity, broker.isSimulation === true);
    if (broker.isSimulation !== true) {
      trace.zeroCause = 'ZERO_BY_RISK';
      trace.notes.push(
        'REAL_EXECUTION_REFUSED: connected broker adapter is not a simulation; no risk evaluation or submission performed.'
      );
      return {
        success: false,
        code: 'REAL_EXECUTION_REFUSED',
        message:
          'Execution refused: the connected broker adapter is not a simulation adapter. Fail-closed before submission.',
        trace,
      };
    }

    // ── Gate 0b: idempotency replay. Not a risk gate; the broker is the source
    //    of truth but a replay must not re-consume a risk budget. ──
    if (request.clientOrderId) {
      const existing = await this.engine
        .getOrderManager()
        .getAllOrders()
        .then((all) => all.find((o) => o.clientOrderId === request.clientOrderId));
      if (existing) {
        trace.notes.push(`IDEMPOTENT_REPLAY: clientOrderId '${request.clientOrderId}' already known.`);
        return {
          success: false,
          code:
            existing.status === 'FILLED'
              ? 'ORDER_ALREADY_FILLED'
              : existing.status === 'CANCELLED'
                ? 'ORDER_ALREADY_CANCELLED'
                : 'DUPLICATE_ORDER',
          message: `Lệnh với clientOrderId '${request.clientOrderId}' đã tồn tại (trạng thái: ${existing.status}).`,
          order: existing,
          trace,
        };
      }
    }

    // ── Gate 1: real market data. No synthetic fallback, fail closed. ──
    const marketData = await this.acquireMarketData(symbol);
    if (marketData.status === 'ERROR') {
      trace.zeroCause = 'ZERO_BY_DATA';
      trace.notes.push(`MARKET_DATA_ERROR ${marketData.code}: ${marketData.message}`);
      return {
        success: false,
        code: marketData.code,
        message: marketData.message,
        trace,
      };
    }
    const quote = marketData.quote;
    trace.notes.push(
      `MARKET_DATA_OK: source=${quote.source} fetchedAt=${quote.quote.fetchedAt} crossCheck=${quote.crossCheck.status}.`
    );

    // Feed the verified tick into the broker so its own price/limit checks run
    // against the same observation the risk chain validated.
    const brokerWithTicks = broker as { processMarketData?: (tick: unknown) => void };
    if (typeof brokerWithTicks.processMarketData === 'function') {
      brokerWithTicks.processMarketData({
        symbol,
        price: quote.quote.lastPrice,
        referencePrice: quote.quote.referencePrice,
        ceilingPrice: quote.quote.ceilingPrice,
        floorPrice: quote.quote.floorPrice,
        volume: quote.quote.matchedVolumeShares ?? 0,
        timestamp: new Date(quote.quote.fetchedAt).getTime(),
      });
    }

    // ── Account context: authoritative broker state only. ──
    const account = await this.engine.getAccount();
    const positions = await this.engine.getPositions();
    const context = this.buildRiskContext(account, positions);

    const entryPrice =
      request.orderType === 'LIMIT' && typeof request.limitPrice === 'number'
        ? request.limitPrice
        : quote.quote.lastPrice;

    // ── Gate 2: RiskGuard — invoked for EVERY order (opens and exits). ──
    const riskParams = this.resolveRiskEnvelope(request, quote.quote.lastPrice, trace);
    if (riskParams.status === 'ERROR') {
      trace.zeroCause = 'ZERO_BY_RISK';
      trace.notes.push(`RISK_PARAMETERS_ERROR ${riskParams.code}: ${riskParams.message}`);
      return { success: false, code: riskParams.code, message: riskParams.message, trace };
    }

    trace.gates.riskGuard = true;
    const guardResult = this.riskGuard.evaluate({
      symbol,
      signal: request.side,
      entryPrice,
      stopLoss: riskParams.stopLoss,
      targetPrice: riskParams.targetPrice,
      currentPrice: quote.quote.lastPrice,
      accountEquity: context.accountEquity,
      availableCash: context.availableCash,
      currentExposure: context.currentExposure,
      openPositionsCount: context.openPositionsCount,
      dailyRealizedLoss: context.dailyRealizedLoss,
      existingSymbols: context.existingSymbols,
      emergencyStop: context.emergencyStop,
      tradingEnabled: context.tradingEnabled,
      ceilingPrice: quote.quote.ceilingPrice,
      floorPrice: quote.quote.floorPrice,
      timestamp: quote.quote.fetchedAt,
    });

    if (!guardResult.approved || guardResult.authorization !== 'AUTHORIZED_FOR_PAPER_TRADING') {
      const guardCode = guardResult.code === 'APPROVED' ? 'INVALID_SIGNAL' : guardResult.code;
      trace.zeroCause = classifyZeroCause(guardCode);
      trace.notes.push(
        `RISKGUARD_BLOCKED: ${guardResult.authorization} code=${guardCode} (${guardResult.reason})`
      );
      return {
        success: false,
        code: guardCode,
        message: guardResult.reason,
        trace,
      };
    }
    trace.notes.push(`RISKGUARD_AUTHORIZED: ${guardResult.reason}`);

    // ── Venue rule: Vietnam bans naked short selling. Evaluated before the
    //    capital gate so an exit that cannot exist never reaches the broker. ──
    if (request.side === 'SELL') {
      const held = positions.find((p) => p.symbol.trim().toUpperCase() === symbol);
      if (!held || held.availableQuantity < requestedQuantity) {
        trace.zeroCause = 'ZERO_BY_SIZING';
        trace.notes.push(
          `SHORT_SELL_BLOCKED: available=${held?.availableQuantity ?? 0} requested=${requestedQuantity}.`
        );
        return {
          success: false,
          code: 'INSUFFICIENT_POSITION',
          message: `Không đủ số lượng cổ phiếu để bán. Khả dụng: ${held?.availableQuantity ?? 0}, yêu cầu: ${requestedQuantity} (Quy định TTCK VN: Nghiêm cấm bán khống).`,
          trace,
        };
      }
      trace.notes.push(
        'EXIT_ORDER: RiskManager/PositionSizer are capital-allocation gates and are not applicable to a de-risking SELL; RiskGuard authorized the exit.'
      );
    } else {
      // ── Gate 3: RiskManager (invokes PositionSizer internally). ──
      trace.gates.riskManager = true;
      const riskManager = this.engine.getRiskManager();
      const riskConfig = riskManager.getConfig();
      const signal = {
        symbol,
        signal: request.side as 'BUY',
        entryPrice,
        targetPrice: riskParams.targetPrice,
        stopLoss: riskParams.stopLoss,
        timestamp: quote.quote.fetchedAt,
        dataSource: quote.source,
      };
      const marketSnapshot = {
        symbol,
        price: quote.quote.lastPrice,
        open: quote.quote.openPrice,
        high: quote.quote.highPrice,
        low: quote.quote.lowPrice,
        close: quote.quote.referencePrice,
        volume: quote.quote.matchedVolumeShares,
        referencePrice: quote.quote.referencePrice,
        ceilingPrice: quote.quote.ceilingPrice,
        floorPrice: quote.quote.floorPrice,
        timestamp: quote.quote.fetchedAt,
        dataSource: quote.source,
      };

      const riskCheck = riskManager.checkRisk(signal, marketSnapshot, context, requestedQuantity);
      if (!riskCheck.approved) {
        const code = riskCheck.code === 'APPROVED' ? 'INVALID_SIGNAL' : riskCheck.code;
        trace.zeroCause = classifyZeroCause(code);
        trace.notes.push(`RISKMANAGER_BLOCKED: code=${code} (${riskCheck.reason})`);
        return { success: false, code, message: riskCheck.reason, trace };
      }
      trace.notes.push(`RISKMANAGER_APPROVED: ${riskCheck.reason}`);

      // ── Gate 4: PositionSizer — quantity authority under the risk ceiling. ──
      trace.gates.positionSizer = true;
      const sizing = PositionSizer.calculate({
        equity: context.accountEquity,
        availableCash: context.availableCash,
        entryPrice,
        stopLossPrice: riskParams.stopLoss,
        maxRiskPerTradeRate: riskConfig.maxRiskPerTradeRate,
        lotSize: riskConfig.lotSize,
        buyFeeRate: riskConfig.buyFeeRate,
        slippageRate: riskConfig.slippageRate,
        existingExposure: context.currentExposure,
        maxPortfolioExposureRate: riskConfig.maxPortfolioExposureRate,
        capitalCeiling: riskCheck.metrics?.riskApprovedCapital,
        requestedQuantity,
      });

      if (!sizing.canTrade || sizing.quantity < riskConfig.lotSize) {
        const code = sizing.code === 'SUCCESS' ? 'INVALID_QUANTITY' : sizing.code;
        trace.riskApprovedQuantity = sizing.quantity;
        trace.zeroCause = zeroCauseFor(code);
        trace.notes.push(`POSITIONSIZER_ZERO: code=${code} (${sizing.reason ?? 'quantity below minimum board lot'})`);
        return { success: false, code, message: sizing.reason ?? 'Position sizing produced no tradable quantity.', trace };
      }

      // The operator asked for `requestedQuantity`; risk approved `sizing.quantity`.
      // Never submit more than requested and never more than risk approved.
      //
      // RiskGuard additionally caps a single position at `maxPositionPercent` (20 %) of
      // equity and publishes the capped figure as `metrics.approvedQuantity`.
      // PositionSizer has no such parameter, so without this third term the 20 %
      // concentration rule was computed and then discarded, leaving the 80 % portfolio
      // exposure cap as the only concentration limit actually reaching the broker.
      const guardApprovedQuantity = guardResult.metrics?.approvedQuantity;
      const concentrationCap =
        typeof guardApprovedQuantity === 'number' && Number.isFinite(guardApprovedQuantity) && guardApprovedQuantity > 0
          ? guardApprovedQuantity
          : Number.POSITIVE_INFINITY;
      const submittedQuantity = Math.min(requestedQuantity, sizing.quantity, concentrationCap);
      const positionSizeReduced = submittedQuantity < requestedQuantity;
      if (submittedQuantity < sizing.quantity) {
        trace.notes.push(
          `POSITION_CONCENTRATION_CAP: submitted=${submittedQuantity} capped from ${sizing.quantity} by maxPositionPercent=${this.riskGuard.getPolicy().maxPositionPercent}%.`
        );
      }
      if (positionSizeReduced) {
        trace.notes.push(
          `POSITION_SIZE_REDUCED: requested=${requestedQuantity} approved=${sizing.quantity} submitted=${submittedQuantity}.`
        );
      }
      trace.riskApprovedQuantity = sizing.quantity;
      trace.submittedQuantity = submittedQuantity;
      trace.positionSizeReduced = positionSizeReduced;

      return this.dispatch(request, symbol, submittedQuantity, trace);
    }

    // Exit path: quantity is the operator request, gated by RiskGuard above.
    trace.riskApprovedQuantity = requestedQuantity;
    trace.submittedQuantity = requestedQuantity;
    return this.dispatch(request, symbol, requestedQuantity, trace);
  }

  /** Last step: the only place a broker submission may occur. */
  private async dispatch(
    request: PaperOrderRequest,
    symbol: string,
    quantity: number,
    trace: OrderRiskTrace
  ): Promise<PaperOrderResult> {
    trace.gates.paperBroker = true;
    trace.notes.push(
      `PAPERBROKER_SUBMIT: symbol=${symbol} side=${request.side} quantity=${quantity} type=${request.orderType}.`
    );

    const orderManager = this.engine.getOrderManager();
    const result: OrderResult = await orderManager.submitOrder({
      symbol,
      side: request.side,
      type: request.orderType,
      quantity,
      limitPrice: request.orderType === 'LIMIT' ? (request.limitPrice ?? null) : null,
      clientOrderId: request.clientOrderId ?? undefined,
    });

    if (!result.success) {
      return {
        success: false,
        code: result.error?.code ?? result.order?.rejectionCode ?? 'ORDER_REJECTED',
        message: result.error?.message ?? result.order?.rejectedReason ?? 'Order rejected by the paper broker.',
        order: result.order,
        trace,
      };
    }

    return {
      success: true,
      code: 'APPROVED',
      message: 'Order passed the full risk chain and was accepted by the paper broker.',
      order: result.order,
      trace,
    };
  }

  /**
   * Resolves the protective envelope from caller-supplied risk parameters only.
   * A BUY without an explicit stop loss and target is rejected fail-closed;
   * inventing `entry x 1.15 / entry x 0.95` would fabricate risk metadata.
   */
  private resolveRiskEnvelope(
    request: PaperOrderRequest,
    lastPrice: number,
    trace: OrderRiskTrace
  ):
    | { status: 'OK'; stopLoss: number; targetPrice: number }
    | { status: 'ERROR'; code: string; message: string } {
    if (request.side !== 'BUY') {
      return { status: 'OK', stopLoss: 0, targetPrice: 0 };
    }
    const stopLoss = typeof request.stopLoss === 'number' ? request.stopLoss : null;
    const targetPrice = typeof request.targetPrice === 'number' ? request.targetPrice : null;
    if (stopLoss === null || targetPrice === null) {
      void lastPrice;
      return {
        status: 'ERROR',
        code: 'RISK_PARAMETERS_REQUIRED',
        message:
          'BUY orders require an explicit stopLoss and targetPrice (VND). The system never synthesizes protective levels; submit the real risk envelope.',
      };
    }
    if (!Number.isFinite(stopLoss) || !Number.isFinite(targetPrice) || stopLoss <= 0 || targetPrice <= 0) {
      return {
        status: 'ERROR',
        code: 'INVALID_STOP_LOSS',
        message: 'stopLoss and targetPrice must both be positive finite numbers in VND.',
      };
    }
    void trace;
    return { status: 'OK', stopLoss, targetPrice };
  }

  /** Fetches and shape-validates the authoritative quote. Fails closed. */
  private async acquireMarketData(
    symbol: string
  ): Promise<
    | { status: 'OK'; quote: RealtimeQuote }
    | { status: 'ERROR'; code: string; message: string }
  > {
    let quote: RealtimeQuote;
    try {
      quote = await this.getQuote(symbol);
    } catch (err) {
      return {
        status: 'ERROR',
        code: 'DATA_UNAVAILABLE',
        message: `Dịch vụ dữ liệu giá thị trường cho ${symbol} hiện không sẵn sàng. Lệnh giao dịch thất bại có chủ đích (Fail-closed).`,
      };
    }
    if (!quote || quote.dataStatus !== 'OK' || !quote.quote) {
      return {
        status: 'ERROR',
        code: 'DATA_UNAVAILABLE',
        message: `Không có dữ liệu giá thị trường thật cho mã ${symbol}. Lệnh giao dịch thất bại có chủ đích (Fail-closed).`,
      };
    }
    if (!Number.isFinite(quote.quote.lastPrice) || quote.quote.lastPrice <= 0) {
      return {
        status: 'ERROR',
        code: 'INVALID_MARKET_DATA',
        message: `Giá thị trường cho ${symbol} không hợp lệ (${quote.quote.lastPrice}). Lệnh giao dịch thất bại có chủ đích (Fail-closed).`,
      };
    }
    // Provenance is mandatory: without a real source timestamp freshness cannot
    // be computed, so the order is refused rather than assumed fresh.
    const sourceTs = new Date(quote.quote.fetchedAt).getTime();
    if (!Number.isFinite(sourceTs)) {
      return {
        status: 'ERROR',
        code: 'DATA_UNAVAILABLE',
        message: `Dữ liệu ${symbol} không có timestamp nguồn hợp lệ nên không thể xác định độ mới. Lệnh giao dịch thất bại có chủ đích (Fail-closed).`,
      };
    }
    return { status: 'OK', quote };
  }

  /** Builds the risk context exclusively from authoritative broker state. */
  private buildRiskContext(
    account: BrokerAccount,
    positions: readonly BrokerPosition[]
  ): {
    accountEquity: number;
    availableCash: number;
    currentExposure: number;
    openPositionsCount: number;
    dailyRealizedLoss: number;
    tradingEnabled: boolean;
    emergencyStop: boolean;
    isMarketOpen: boolean;
    existingSymbols: string[];
  } {
    const exposure = positions.reduce(
      (sum, p) => sum + (p.marketValue ?? p.quantity * (p.currentPrice ?? p.averageCost)),
      0
    );
    return {
      accountEquity: account.equity > 0 ? account.equity : account.cash + exposure,
      availableCash: account.availableCash,
      currentExposure: exposure,
      openPositionsCount: positions.filter((p) => p.quantity > 0).length,
      dailyRealizedLoss: account.realizedPnL < 0 ? -account.realizedPnL : 0,
      tradingEnabled: this.engine.isTradingEnabled(),
      emergencyStop: this.engine.isEmergencyStopActive(),
      // Reuse the engine's own session policy rather than re-deciding it here.
      isMarketOpen: this.engine.respectsMarketSession()
        ? TradingDataValidator.checkVnMarketSession().isOpen
        : true,
      existingSymbols: positions
        .filter((p) => p.quantity > 0)
        .map((p) => p.symbol.trim().toUpperCase()),
    };
  }
}

export type { PaperOrderRiskBoundary as PaperOrderBoundary };