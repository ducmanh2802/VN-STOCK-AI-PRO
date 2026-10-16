import type { Order, OrderSide, OrderType } from '../../lib/trading/types/trading.ts';
import type { TradingEngine } from '../../lib/trading/engine/TradingEngine.ts';
import { getRealtimeQuote } from '../market/realMarketDataService.ts';
import type { StockQuote } from '../../types/stock.ts';
import { RiskGuard } from '../../lib/trading/risk/RiskGuard.ts';
import { PositionSizer } from '../../lib/trading/risk/PositionSizer.ts';

export interface PaperOrderSubmission {
  symbol: string;
  side: OrderSide;
  quantity: number;
  orderType: OrderType;
  limitPrice?: number;
  clientOrderId?: string;
  stopLoss?: number;
  targetPrice?: number;
}

export interface PaperOrderTrace {
  simulationAssertionPassed: boolean;
  marketDataVerified: boolean;
  riskGuardPassed: boolean;
  riskManagerPassed: boolean;
  positionSizerPassed: boolean;
  executed: boolean;
  details: string[];
}

export interface PaperOrderResult {
  success: boolean;
  code: string;
  message: string;
  order?: Order | null;
  trace: PaperOrderTrace;
}

export interface PaperOrderRiskBoundaryOptions {
  getQuote?: (symbol: string) => Promise<StockQuote>;
}

export class PaperOrderRiskBoundary {
  private engine: TradingEngine;
  private getQuoteFn: (symbol: string) => Promise<StockQuote>;

  constructor(engine: TradingEngine, options: PaperOrderRiskBoundaryOptions = {}) {
    this.engine = engine;
    this.getQuoteFn = options.getQuote ?? getRealtimeQuote;
  }

  async submit(submission: PaperOrderSubmission): Promise<PaperOrderResult> {
    const trace: PaperOrderTrace = {
      simulationAssertionPassed: false,
      marketDataVerified: false,
      riskGuardPassed: false,
      riskManagerPassed: false,
      positionSizerPassed: false,
      executed: false,
      details: [],
    };

    // 1. Simulation assertion: paper broker only
    const broker = this.engine.getBroker();
    if (!broker.isSimulation) {
      trace.details.push('Live execution disallowed; broker is not simulation');
      return {
        success: false,
        code: 'SIMULATION_REQUIRED',
        message: 'Direct live trading is disallowed. Only paper simulation mode is enabled.',
        trace,
      };
    }
    trace.simulationAssertionPassed = true;

    // 2. Risk parameters check for BUY orders
    if (submission.side === 'BUY') {
      if (!submission.stopLoss || !submission.targetPrice) {
        trace.details.push('BUY order missing protective stopLoss or targetPrice');
        return {
          success: false,
          code: 'RISK_PARAMETERS_REQUIRED',
          message: 'Both stopLoss and targetPrice must be explicitly provided for BUY orders.',
          trace,
        };
      }
      if (submission.stopLoss <= 0 || submission.targetPrice <= 0) {
        trace.details.push('stopLoss or targetPrice is non-positive');
        return {
          success: false,
          code: 'INVALID_RISK_PARAMETERS',
          message: 'stopLoss and targetPrice must be positive numbers.',
          trace,
        };
      }
    }

    // 3. Fetch verified market quote
    let quote: StockQuote;
    try {
      quote = await this.getQuoteFn(submission.symbol);
      if (!quote || typeof quote.price !== 'number' || quote.price <= 0) {
        trace.details.push('Quote missing or invalid');
        return {
          success: false,
          code: 'INVALID_MARKET_DATA',
          message: `Unable to verify valid market price for ${submission.symbol}.`,
          trace,
        };
      }
      trace.marketDataVerified = true;
    } catch (err: any) {
      trace.details.push(`Market data error: ${err.message}`);
      return {
        success: false,
        code: 'DATA_UNAVAILABLE',
        message: `Realtime quote unavailable for ${submission.symbol}: ${err.message}`,
        trace,
      };
    }

    // 4. Validate through RiskGuard
    const guard = new RiskGuard();
    const effectivePrice = submission.limitPrice ?? quote.price;
    const account = await this.engine.getAccount();
    const positions = await this.engine.getPositions();
    const currentExposure = positions.reduce(
      (sum, p) => sum + (p.marketValue || p.quantity * (p.currentPrice || p.averageCost || 0)),
      0
    );

    const guardResult = guard.evaluate({
      symbol: submission.symbol,
      signal: submission.side === 'BUY' ? 'BUY' : 'SELL',
      entryPrice: effectivePrice,
      stopLoss: submission.stopLoss ?? effectivePrice * 0.95,
      targetPrice: submission.targetPrice ?? effectivePrice * 1.1,
      currentPrice: effectivePrice,
      accountEquity: account.equity,
      availableCash: account.availableCash,
      currentExposure,
      openPositionsCount: positions.length,
      emergencyStop: this.engine.isEmergencyStopActive(),
      tradingEnabled: this.engine.isTradingEnabled(),
    });

    if (guardResult.authorization !== 'AUTHORIZED_FOR_PAPER_TRADING') {
      trace.details.push(`RiskGuard rejected: ${guardResult.reason}`);
      return {
        success: false,
        code: guardResult.code ?? 'RISK_GUARD_BLOCKED',
        message: guardResult.reason,
        trace,
      };
    }
    trace.riskGuardPassed = true;
    trace.riskManagerPassed = true;

    // 5. Position Sizer
    if (submission.side === 'BUY') {
      const sizing = PositionSizer.calculate({
        equity: account.equity,
        availableCash: account.availableCash,
        entryPrice: effectivePrice,
        stopLossPrice: submission.stopLoss ?? effectivePrice * 0.95,
      });

      if (!sizing.canTrade || submission.quantity > sizing.quantity) {
        trace.details.push(`Requested quantity ${submission.quantity} exceeds max allowed ${sizing.quantity}`);
        return {
          success: false,
          code: 'POSITION_SIZE_EXCEEDED',
          message: `Requested quantity exceeds maximum risk-adjusted size (${sizing.quantity} shares). Reason: ${sizing.reason || 'Sizing limit exceeded'}`,
          trace,
        };
      }
    }
    trace.positionSizerPassed = true;

    // 6. Submit order to OrderManager / PaperBroker
    try {
      const orderResult = await this.engine.getOrderManager().submitOrder({
        symbol: submission.symbol,
        side: submission.side,
        type: submission.orderType,
        quantity: submission.quantity,
        limitPrice: submission.limitPrice,
        clientOrderId: submission.clientOrderId,
      });

      if (!orderResult.success || !orderResult.order) {
        trace.details.push(`Broker submission failed: ${orderResult.error?.message}`);
        return {
          success: false,
          code: orderResult.error?.code ?? 'ORDER_SUBMISSION_FAILED',
          message: orderResult.error?.message ?? 'Failed to submit order to broker.',
          order: orderResult.order ?? null,
          trace,
        };
      }

      trace.executed = true;
      trace.details.push(`Order submitted successfully with id ${orderResult.order.id}`);

      return {
        success: true,
        code: 'ORDER_SUBMITTED',
        message: 'Order submitted and authorized for paper trading.',
        order: orderResult.order,
        trace,
      };
    } catch (err: any) {
      trace.details.push(`Execution error: ${err.message}`);
      return {
        success: false,
        code: 'EXECUTION_ERROR',
        message: err.message || 'Execution error during order submission',
        trace,
      };
    }
  }
}
