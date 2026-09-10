/**
 * PHASE 18.4 — TRADING ENGINE (ORCHESTRATION CORE)
 * ================================================
 * Deterministic coordinator for automated trading workflows.
 *
 * Exact Pipeline:
 *   REAL KBS/VPS MARKET DATA (or injected)
 *          ↓
 *   TradingDataValidator
 *          ↓
 *   RecommendationEngine (or supplied recommendation)
 *          ↓
 *   RiskManager
 *          ↓
 *   PositionSizer
 *          ↓
 *   OrderManager
 *          ↓
 *   BrokerAdapter (PaperBroker)
 *          ↓
 *   Portfolio / Transactions
 *
 * STRICT GOVERNANCE:
 *   - Orchestration ONLY — does not calculate indicators, scores, or accounting directly.
 *   - Fail-closed on missing, stale, or invalid market data.
 *   - Reuses existing modules without bypassing or rewriting them.
 *   - Enforces Vietnamese market rules, safety switches, and no-short-selling.
 */

import type {
  Order,
  OrderType,
  TradingMarketData,
  TradingSignal,
  TradeDecision,
  ValidationErrorCode,
} from '../types/trading.ts';
import type {
  RiskConfig,
  RiskContext,
} from '../types/risk.ts';
import type {
  BrokerAdapter,
  BrokerAccount,
  BrokerPosition,
  OrderResult,
} from '../execution/BrokerAdapter.ts';
import type { SimulationMarketTick } from '../paper/PaperBrokerTypes.ts';
import { OrderManager } from '../execution/OrderManager.ts';
import { RiskManager } from '../risk/RiskManager.ts';
import { PositionSizer } from '../risk/PositionSizer.ts';
import { TradingDataValidator } from '../validation/TradingDataValidator.ts';
import {
  getRealtimeQuote,
  MarketDataUnavailableError,
} from '../../../services/market/realMarketDataService.ts';
import type {
  InvestmentHorizon,
  InvestmentRecommendation,
} from '../../../types/recommendation.ts';
import type {
  TradingEngineConfig,
  TradingCycleOptions,
  TradingCycleResult,
} from './TradingEngineTypes.ts';
import { TradeCapitalAllocation } from '../capitalAllocation/TradeCapitalAllocation.ts';

export class TradingEngine {
  private broker: BrokerAdapter;
  private orderManager: OrderManager;
  private riskManager: RiskManager;
  private config: TradingEngineConfig;
  private activeLocks: Set<string> = new Set();
  private auditHistory: TradingCycleResult[] = [];
  private emergencyStopActive: boolean;
  private tradingEnabled: boolean;

  constructor(config: TradingEngineConfig) {
    this.config = {
      defaultHorizon: 'SHORT_TERM',
      skipSessionValidation: false,
      tradingEnabled: true,
      emergencyStop: false,
      maxPriceDeviationPercent: 3.0,
      ...config,
    };

    this.broker = config.broker;
    this.orderManager = config.orderManager ?? new OrderManager({ broker: this.broker });
    this.riskManager = new RiskManager(config.riskConfig);
    this.emergencyStopActive = Boolean(config.emergencyStop);
    this.tradingEnabled = config.tradingEnabled ?? true;
  }

  /**
   * Retrieves the current OrderManager instance.
   */
  getOrderManager(): OrderManager {
    return this.orderManager;
  }

  /**
   * Retrieves the current BrokerAdapter instance (PaperBroker).
   */
  getBroker(): BrokerAdapter {
    return this.broker;
  }

  /**
   * Retrieves the RiskManager instance.
   */
  getRiskManager(): RiskManager {
    return this.riskManager;
  }

  /**
   * Master switch: Toggle automated trading on/off.
   */
  setTradingEnabled(enabled: boolean): void {
    this.tradingEnabled = enabled;
    const b = this.broker as { setTradingEnabled?: (enabled: boolean) => void };
    if (typeof b.setTradingEnabled === 'function') {
      b.setTradingEnabled(enabled);
    }
  }

  /**
   * Checks if automated trading is enabled.
   */
  isTradingEnabled(): boolean {
    return this.tradingEnabled;
  }

  /**
   * Master Emergency Stop: Blocks all new orders and cancels open pending orders.
   * NEVER liquidates existing positions.
   */
  async setEmergencyStop(active: boolean): Promise<void> {
    this.emergencyStopActive = active;
    const b = this.broker as { setEmergencyStop?: (active: boolean) => void };
    if (typeof b.setEmergencyStop === 'function') {
      b.setEmergencyStop(active);
    }

    if (active) {
      await this.orderManager.cancelAllOpenOrders();
    }
  }

  /**
   * Checks if emergency stop is active.
   */
  isEmergencyStopActive(): boolean {
    return this.emergencyStopActive;
  }

  /**
   * Retrieves audit trail of trading cycle decisions.
   */
  getAuditHistory(symbol?: string): TradingCycleResult[] {
    if (symbol) {
      const sym = symbol.toUpperCase().trim();
      return this.auditHistory.filter((res) => res.symbol === sym);
    }
    return [...this.auditHistory];
  }

  /**
   * Convenience getter for current broker account state.
   */
  async getAccount(): Promise<BrokerAccount> {
    return this.broker.getAccount();
  }

  /**
   * Convenience getter for open positions.
   */
  async getPositions(): Promise<BrokerPosition[]> {
    return this.broker.getPositions();
  }

  /**
   * Runs a complete deterministic trading cycle for a given stock symbol.
   */
  async runTradingCycle(options: TradingCycleOptions): Promise<TradingCycleResult> {
    const symbol = options.symbol.toUpperCase().trim();
    const timestamp = new Date().toISOString();

    // 0. Concurrency Lock per symbol
    if (this.activeLocks.has(symbol)) {
      const duplicateRes: TradingCycleResult = {
        status: 'REJECTED',
        symbol,
        action: 'NO_TRADE',
        rejectionCode: 'DUPLICATE_ORDER',
        reason: `A trading cycle is already in progress for symbol ${symbol}. Re-entrant execution blocked.`,
        timestamp,
      };
      this.recordAudit(duplicateRes);
      return duplicateRes;
    }

    this.activeLocks.add(symbol);

    try {
      return await this.executeCycle(symbol, options, timestamp);
    } finally {
      this.activeLocks.delete(symbol);
    }
  }

  /**
   * Runs trading cycles sequentially across a list of symbols.
   */
  async runBatchCycle(
    symbols: string[],
    options?: Omit<TradingCycleOptions, 'symbol'>
  ): Promise<TradingCycleResult[]> {
    const results: TradingCycleResult[] = [];
    for (const sym of symbols) {
      try {
        const res = await this.runTradingCycle({ ...options, symbol: sym });
        results.push(res);
      } catch (err) {
        const errorResult: TradingCycleResult = {
          status: 'ERROR',
          symbol: sym.toUpperCase().trim(),
          action: 'NO_TRADE',
          rejectionCode: 'DATA_UNAVAILABLE',
          reason: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        };
        this.recordAudit(errorResult);
        results.push(errorResult);
      }
    }
    return results;
  }

  /**
   * Internal execution pipeline.
   */
  private async executeCycle(
    symbol: string,
    options: TradingCycleOptions,
    timestamp: string
  ): Promise<TradingCycleResult> {
    const horizon = options.horizon ?? this.config.defaultHorizon ?? 'SHORT_TERM';

    // 1. Check Master Safety Switches First
    if (this.isEmergencyStopActive()) {
      const res: TradingCycleResult = {
        status: 'NO_TRADE',
        symbol,
        action: 'NO_TRADE',
        rejectionCode: 'EMERGENCY_STOP',
        reason: 'Emergency stop is active: all new orders are strictly blocked.',
        timestamp,
      };
      this.recordAudit(res);
      return res;
    }

    if (!this.isTradingEnabled()) {
      const res: TradingCycleResult = {
        status: 'NO_TRADE',
        symbol,
        action: 'NO_TRADE',
        rejectionCode: 'TRADING_DISABLED',
        reason: 'Automated trading is currently disabled by master switch.',
        timestamp,
      };
      this.recordAudit(res);
      return res;
    }

    // 2. Obtain Market Data
    let marketData: TradingMarketData;
    if (options.marketData) {
      marketData = options.marketData;
    } else {
      try {
        const liveQuote = await getRealtimeQuote(symbol);
        const q = liveQuote.quote;
        marketData = {
          symbol,
          price: q.lastPrice,
          open: q.openPrice,
          high: q.highPrice,
          low: q.lowPrice,
          close: q.lastPrice,
          volume: q.matchedVolumeShares ?? null,
          referencePrice: q.referencePrice,
          ceilingPrice: q.ceilingPrice,
          floorPrice: q.floorPrice,
          timestamp: q.fetchedAt ? new Date(q.fetchedAt).getTime() : Date.now(),
          dataSource: 'VPS',
        };
      } catch (err) {
        const isUnavailable =
          err instanceof MarketDataUnavailableError ||
          (err instanceof Error && err.name === 'MarketDataUnavailableError');
        const res: TradingCycleResult = {
          status: 'REJECTED',
          symbol,
          action: 'NO_TRADE',
          rejectionCode: 'DATA_UNAVAILABLE',
          reason: isUnavailable
            ? (err as Error).message
            : `Market data retrieval failed: ${err instanceof Error ? err.message : String(err)}`,
          timestamp,
        };
        this.recordAudit(res);
        return res;
      }
    }

    // 3. Validate Market Data via TradingDataValidator
    const marketValidation = TradingDataValidator.validateMarketData(marketData, {
      maxStaleTimeMs: this.riskManager.getConfig().maxStaleTimeMs,
    });
    if (!marketValidation.isValid) {
      const res: TradingCycleResult = {
        status: 'REJECTED',
        symbol,
        action: 'NO_TRADE',
        marketData,
        rejectionCode: marketValidation.code === 'OK' ? 'DATA_UNAVAILABLE' : marketValidation.code,
        reason: marketValidation.message,
        timestamp,
      };
      this.recordAudit(res);
      return res;
    }

    // 3b. Update broker's internal tick cache so market orders can be executed accurately
    const brokerWithTicks = this.broker as { processMarketData?: (tick: SimulationMarketTick) => void };
    if (typeof brokerWithTicks.processMarketData === 'function') {
      brokerWithTicks.processMarketData(marketData);
    }

    // 4. Validate Market Session
    const sessionInfo = TradingDataValidator.checkVnMarketSession(marketData.timestamp ?? Date.now());
    if (!this.config.skipSessionValidation && !sessionInfo.isOpen) {
      const res: TradingCycleResult = {
        status: 'NO_TRADE',
        symbol,
        action: 'NO_TRADE',
        marketData,
        rejectionCode: 'MARKET_CLOSED',
        reason: `Vietnamese stock market is closed (${sessionInfo.sessionName}). Orders cannot be created outside trading sessions.`,
        timestamp,
      };
      this.recordAudit(res);
      return res;
    }

    // 5. Obtain Recommendation
    let recommendation: InvestmentRecommendation;
    if (options.recommendation) {
      recommendation = options.recommendation;
    } else {
      const res: TradingCycleResult = {
        status: 'REJECTED', symbol, action: 'NO_TRADE', marketData,
        rejectionCode: 'DATA_UNAVAILABLE',
        reason: 'No RecommendationEngine result was supplied. TradingEngine will not fabricate missing analysis inputs or a recommendation.',
        timestamp,
      };
      this.recordAudit(res);
      return res;
    }

    // 6. Tradable Signal Decision Check
    if (recommendation.signal === 'HOLD') {
      const res: TradingCycleResult = {
        status: 'NO_TRADE',
        symbol,
        action: 'HOLD',
        marketData,
        recommendation,
        reason: 'Recommendation is HOLD. No trade generated.',
        timestamp,
      };
      this.recordAudit(res);
      return res;
    }

    if (recommendation.signal !== 'BUY' && recommendation.signal !== 'SELL') {
      const res: TradingCycleResult = {
        status: 'NO_TRADE',
        symbol,
        action: 'NO_TRADE',
        marketData,
        recommendation,
        reason: `Signal "${recommendation.signal}" is non-tradable.`,
        timestamp,
      };
      this.recordAudit(res);
      return res;
    }

    // 7. Context Preparation from Broker
    const account = await this.broker.getAccount();
    const positions = await this.broker.getPositions();
    const openPositions = positions.filter((p) => p.quantity > 0);
    const existingSymbols = openPositions.map((p) => p.symbol.toUpperCase());
    const currentExposure = account.marketValue;

    const isMarketOpen = this.config.skipSessionValidation ? true : sessionInfo.isOpen;
    const riskContext: RiskContext = {
      accountEquity: account.equity,
      availableCash: account.availableCash,
      currentExposure,
      openPositionsCount: openPositions.length,
      dailyRealizedLoss: Math.max(0, -account.realizedPnL),
      tradingEnabled: this.isTradingEnabled(),
      emergencyStop: this.isEmergencyStopActive(),
      isMarketOpen,
      existingSymbols,
    };

    // ==========================================
    // 8A. BUY FLOW
    // ==========================================
    if (recommendation.signal === 'BUY') {
      // Check for active open orders (idempotency protection)
      const openOrders = await this.orderManager.getOpenOrders(symbol);
      if (openOrders.length > 0) {
        const res: TradingCycleResult = {
          status: 'NO_TRADE',
          symbol,
          action: 'BUY',
          marketData,
          recommendation,
          rejectionCode: 'DUPLICATE_ORDER',
          reason: `Pending open order already exists for ${symbol} (Order ID: ${openOrders[0].id}). Duplicate order blocked.`,
          timestamp,
        };
        this.recordAudit(res);
        return res;
      }

      // Check for existing position conflict (no pyramiding)
      if (existingSymbols.includes(symbol)) {
        const res: TradingCycleResult = {
          status: 'NO_TRADE',
          symbol,
          action: 'BUY',
          marketData,
          recommendation,
          rejectionCode: 'POSITION_LIMIT',
          reason: `Position already exists for symbol ${symbol}. Pyramiding / duplicate positions are restricted.`,
          timestamp,
        };
        this.recordAudit(res);
        return res;
      }

      // Construct TradingSignal
      const entryPrice = recommendation.entryPrice ?? marketData.price;
      const targetPrice = recommendation.targetPrice ?? Math.round(entryPrice * 1.15);
      const stopLoss = recommendation.stopLoss ?? Math.round(entryPrice * 0.95);
      const riskReward =
        recommendation.riskReward ??
        (entryPrice > stopLoss && stopLoss > 0
          ? Number(((targetPrice - entryPrice) / (entryPrice - stopLoss)).toFixed(2))
          : 2.0);

      const tradingSignal: TradingSignal = {
        symbol,
        signal: 'BUY',
        confidence: recommendation.confidence,
        score: recommendation.score,
        entryPrice,
        targetPrice,
        stopLoss,
        riskReward,
        strategy: recommendation.strategy,
        timestamp: marketData.timestamp,
        reasons: recommendation.reasons,
        dataSource: marketData.dataSource ?? 'REAL',
      };

      // Validate Candidate
      const candidateValidation = TradingDataValidator.validateCandidate(marketData, tradingSignal, {
        isMarketOpen,
        maxStaleTimeMs: this.riskManager.getConfig().maxStaleTimeMs,
        minimumRiskReward: this.riskManager.getConfig().minimumRiskReward,
        maxPriceDeviationPercent: this.config.maxPriceDeviationPercent ?? 3.0,
      });

      if (!candidateValidation.isValid) {
        const res: TradingCycleResult = {
          status: 'REJECTED',
          symbol,
          action: 'BUY',
          marketData,
          recommendation,
          signal: tradingSignal,
          rejectionCode:
            candidateValidation.code === 'OK' ? 'INVALID_SIGNAL' : candidateValidation.code,
          reason: candidateValidation.message,
          timestamp,
        };
        this.recordAudit(res);
        return res;
      }

      // Run RiskManager
      const riskCheck = this.riskManager.checkRisk(tradingSignal, marketData, riskContext);
      if (!riskCheck.approved) {
        const res: TradingCycleResult = {
          status: 'NO_TRADE',
          symbol,
          action: 'BUY',
          marketData,
          recommendation,
          signal: tradingSignal,
          riskCheck,
          rejectionCode: riskCheck.code === 'APPROVED' ? undefined : riskCheck.code,
          reason: riskCheck.reason,
          timestamp,
        };
        this.recordAudit(res);
        return res;
      }

      // Phase 19.3A: Capital Allocation within the risk-approved ceiling.
      // RiskManager owns the approved capital ceiling; TradeCapitalAllocation
      // derives usable allocation capital (cash / exposure / risk capped).
      const riskConfig = this.riskManager.getConfig();
      const riskApprovedCapital = riskCheck.metrics?.riskApprovedCapital ?? 0;
      const capitalAllocation = TradeCapitalAllocation.allocate({
        account: {
          equity: account.equity,
          availableCash: account.availableCash,
          marketValue: currentExposure,
        },
        recommendation,
        riskDecision: riskCheck,
        riskConfig,
        riskApprovedCapital,
      });

      if (capitalAllocation.status !== 'ALLOCATED') {
        const res: TradingCycleResult = {
          status: 'NO_TRADE',
          symbol,
          action: 'BUY',
          marketData,
          recommendation,
          signal: tradingSignal,
          riskCheck,
          capitalAllocation,
          rejectionCode: 'INSUFFICIENT_CASH',
          reason: capitalAllocation.reason,
          timestamp,
        };
        this.recordAudit(res);
        return res;
      }

      // Run PositionSizer (quantity authority) under the allocation capital ceiling
      const sizing = PositionSizer.calculate({
        equity: riskContext.accountEquity,
        availableCash: riskContext.availableCash,
        entryPrice: tradingSignal.entryPrice,
        stopLossPrice: tradingSignal.stopLoss,
        maxRiskPerTradeRate: riskConfig.maxRiskPerTradeRate,
        lotSize: riskConfig.lotSize,
        buyFeeRate: riskConfig.buyFeeRate,
        slippageRate: riskConfig.slippageRate,
        existingExposure: riskContext.currentExposure,
        maxPortfolioExposureRate: riskConfig.maxPortfolioExposureRate,
        capitalCeiling: capitalAllocation.allocationCapital,
      });

      if (!sizing.canTrade || sizing.quantity < 100) {
        const res: TradingCycleResult = {
          status: 'NO_TRADE',
          symbol,
          action: 'BUY',
          marketData,
          recommendation,
          signal: tradingSignal,
          riskCheck,
          positionSizing: sizing,
          rejectionCode: sizing.code === 'SUCCESS' ? 'INVALID_QUANTITY' : sizing.code,
          reason: sizing.reason || 'Calculated position size is less than minimum board lot of 100 shares',
          timestamp,
        };
        this.recordAudit(res);
        return res;
      }

      // Build TradeDecision
      const tradeDecision: TradeDecision = {
        decision: 'APPROVED_TRADE',
        symbol,
        signal: 'BUY',
        quantity: sizing.quantity,
        entryPrice: tradingSignal.entryPrice,
        stopLossPrice: tradingSignal.stopLoss,
        targetPrice: tradingSignal.targetPrice,
        riskRewardRatio: tradingSignal.riskReward ?? 2.0,
        totalCapitalRequirement: sizing.totalCapitalRequirement,
        timestamp,
      };

      // Submit through OrderManager
      const orderType: OrderType = options.orderType ?? 'MARKET';
      const limitPrice = options.limitPrice ?? (orderType === 'LIMIT' ? tradingSignal.entryPrice : undefined);

      const orderResult: OrderResult = await this.orderManager.submitDecision(tradeDecision, {
        orderType,
        limitPrice,
        clientOrderId: options.clientOrderId,
      });

      const res: TradingCycleResult = {
        status: orderResult.success ? 'TRADED' : 'REJECTED',
        symbol,
        action: 'BUY',
        marketData,
        recommendation,
        signal: tradingSignal,
        riskCheck,
        capitalAllocation,
        positionSizing: sizing,
        tradeDecision,
        order: orderResult.order,
        orderResult,
        reason: orderResult.success
          ? `BUY order successfully ${orderResult.order.status.toLowerCase()} for ${sizing.quantity} shares of ${symbol}`
          : orderResult.error?.message ?? 'Order submission failed',
        rejectionCode: orderResult.error?.code,
        timestamp,
      };
      this.recordAudit(res);
      return res;
    }

    // ==========================================
    // 8B. SELL FLOW
    // ==========================================
    // Check existing position in Broker (STRICT: NO SHORT SELLING)
    const position = await this.broker.getPosition(symbol);
    if (!position || position.quantity <= 0 || position.availableQuantity < 100) {
      const res: TradingCycleResult = {
        status: 'NO_TRADE',
        symbol,
        action: 'SELL',
        marketData,
        recommendation,
        rejectionCode: 'INSUFFICIENT_POSITION',
        reason: `Cannot execute SELL: No available position for symbol ${symbol} (available: ${position?.availableQuantity ?? 0}). Short selling is strictly prohibited.`,
        timestamp,
      };
      this.recordAudit(res);
      return res;
    }

    // Determine Sell Quantity
    let sellQty = position.availableQuantity;
    if (typeof options.sellQuantity === 'number' && options.sellQuantity > 0) {
      const requestedLot = Math.floor(options.sellQuantity / 100) * 100;
      if (requestedLot > position.availableQuantity) {
        const res: TradingCycleResult = {
          status: 'NO_TRADE',
          symbol,
          action: 'SELL',
          marketData,
          recommendation,
          rejectionCode: 'INSUFFICIENT_POSITION',
          reason: `Requested sell quantity (${options.sellQuantity}) exceeds available position (${position.availableQuantity})`,
          timestamp,
        };
        this.recordAudit(res);
        return res;
      }
      if (requestedLot < 100) {
        const res: TradingCycleResult = {
          status: 'NO_TRADE',
          symbol,
          action: 'SELL',
          marketData,
          recommendation,
          rejectionCode: 'INVALID_QUANTITY',
          reason: `Sell quantity (${options.sellQuantity}) is less than standard board lot of 100 shares`,
          timestamp,
        };
        this.recordAudit(res);
        return res;
      }
      sellQty = requestedLot;
    }

    // Exchange Price Limit Sanity Check
    if (marketData.ceilingPrice && marketData.price > marketData.ceilingPrice) {
      const res: TradingCycleResult = {
        status: 'REJECTED',
        symbol,
        action: 'SELL',
        marketData,
        recommendation,
        rejectionCode: 'PRICE_LIMIT_VIOLATION',
        reason: `Current price (${marketData.price}) exceeds daily ceiling price (${marketData.ceilingPrice})`,
        timestamp,
      };
      this.recordAudit(res);
      return res;
    }

    if (marketData.floorPrice && marketData.price < marketData.floorPrice) {
      const res: TradingCycleResult = {
        status: 'REJECTED',
        symbol,
        action: 'SELL',
        marketData,
        recommendation,
        rejectionCode: 'PRICE_LIMIT_VIOLATION',
        reason: `Current price (${marketData.price}) is below daily floor price (${marketData.floorPrice})`,
        timestamp,
      };
      this.recordAudit(res);
      return res;
    }

    // Construct TradingSignal for SELL
    const sellSignal: TradingSignal = {
      symbol,
      signal: 'SELL',
      confidence: recommendation.confidence,
      score: recommendation.score,
      entryPrice: marketData.price,
      targetPrice: 0,
      stopLoss: 0,
      riskReward: 0,
      strategy: recommendation.strategy,
      timestamp: marketData.timestamp,
      reasons: recommendation.reasons,
      dataSource: marketData.dataSource ?? 'REAL',
    };

    // Build TradeDecision for SELL
    const tradeDecision: TradeDecision = {
      decision: 'APPROVED_TRADE',
      symbol,
      signal: 'SELL',
      quantity: sellQty,
      entryPrice: marketData.price,
      stopLossPrice: 0,
      targetPrice: 0,
      riskRewardRatio: 0,
      totalCapitalRequirement: 0,
      timestamp,
    };

    // Submit order through OrderManager
    const orderType: OrderType = options.orderType ?? 'MARKET';
    const limitPrice = options.limitPrice;

    const orderResult: OrderResult = await this.orderManager.submitDecision(tradeDecision, {
      orderType,
      limitPrice,
      clientOrderId: options.clientOrderId,
    });

    const res: TradingCycleResult = {
      status: orderResult.success ? 'TRADED' : 'REJECTED',
      symbol,
      action: 'SELL',
      marketData,
      recommendation,
      signal: sellSignal,
      tradeDecision,
      order: orderResult.order,
      orderResult,
      reason: orderResult.success
        ? `SELL order successfully ${orderResult.order.status.toLowerCase()} for ${sellQty} shares of ${symbol}`
        : orderResult.error?.message ?? 'Sell order submission failed',
      rejectionCode: orderResult.error?.code,
      timestamp,
    };
    this.recordAudit(res);
    return res;
  }

  /**
   * Internal audit record appender.
   */
  private recordAudit(result: TradingCycleResult): void {
    this.auditHistory.unshift(result);
    // Keep a maximum of 500 audit logs in memory
    if (this.auditHistory.length > 500) {
      this.auditHistory.pop();
    }
  }
}
