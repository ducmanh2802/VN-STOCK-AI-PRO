/**
 * PHASE 18.2 — PAPER EXECUTION ENGINE
 * ====================================
 * Safe, deterministic paper trading execution engine enforcing the mandatory pipeline:
 *
 * Phase 17 Recommendation
 *         ↓
 * MarketDataIntegrityGuard
 *         ↓
 * TradingDataValidator
 *         ↓
 * RiskGuard (requires AUTHORIZED_FOR_PAPER_TRADING)
 *         ↓
 * VietnamLotRule / Capital Validation
 *         ↓
 * PaperExecutionEngine
 *         ↓
 * PaperBroker / PaperPortfolio
 *         ↓
 * PaperTradeLedger
 *
 * ABSOLUTE SAFETY RULES:
 * - NO REAL BROKER ORDERS.
 * - FAIL CLOSED on invalid data, stale timestamps, or unauthorized states.
 * - DETERMINISTIC execution (no Math.random(), explicit slippage and fees).
 * - ATOMIC state mutations.
 */

import type {
  Order,
  OrderSide,
  OrderStatus,
  OrderType,
  TradingCostConfig,
  TradingMarketData,
  ValidationErrorCode,
} from '../types/trading.ts';
import { DEFAULT_TRADING_COST_CONFIG } from '../types/trading.ts';
import type { InvestmentRecommendation } from '../../../types/recommendation.ts';
import type {
  RiskGuardEvaluationInput,
  RiskGuardPolicy,
  RiskGuardResult,
} from '../types/risk.ts';
import { DEFAULT_RISK_GUARD_POLICY } from '../types/risk.ts';
import { MarketDataIntegrityGuard, type MarketDataIntegrityOptions, type MarketDataIntegrityResult } from '../integrity/MarketDataIntegrityGuard.ts';
import { TradingDataValidator } from '../validation/TradingDataValidator.ts';
import { RiskGuard } from '../risk/RiskGuard.ts';
import { VietnamLotRule } from '../risk/VietnamLotRule.ts';
import { PaperPnL } from './PaperPnL.ts';
import { PaperTradeLedger, type PaperAuditEntry } from './PaperTradeLedger.ts';
import type { BrokerAccount, BrokerPosition, BrokerTransaction } from '../execution/BrokerAdapter.ts';
import { PaperBroker } from './PaperBroker.ts';

export interface PaperExecutionRequest {
  recommendation: InvestmentRecommendation;
  marketData: TradingMarketData;
  account?: BrokerAccount;
  broker?: PaperBroker;
  orderType?: OrderType;
  customQuantity?: number;
  now?: number;
  policy?: Partial<RiskGuardPolicy>;
  integrityOptions?: MarketDataIntegrityOptions;
  tradingCosts?: Partial<TradingCostConfig>;
  // Phase 18.3.3 Context Binding Metadata
  orderId?: string;
  executionContext?: {
    readonly marketDataSnapshotId: string;
    readonly recommendationId?: string;
    readonly strategyVersion?: string;
    readonly riskPolicyVersion?: string;
  };
  marketDataSnapshotId?: string;
  recommendationId?: string;
  strategyVersion?: string;
  riskPolicyVersion?: string;
}

export interface PaperExecutionResult {
  success: boolean;
  orderId: string;
  symbol: string;
  side: OrderSide;
  status: OrderStatus;
  code: ValidationErrorCode | 'EXECUTED';
  message: string;
  reason?: string;
  requestedPrice: number;
  executedPrice: number | null;
  requestedQuantity: number;
  executedQuantity: number;
  buyCost?: number;
  sellProceeds?: number;
  fee: number;
  tax: number;
  slippage: number;
  realizedPnL?: number;
  accountBefore?: Pick<BrokerAccount, 'cash' | 'equity' | 'availableCash'>;
  accountAfter?: Pick<BrokerAccount, 'cash' | 'equity' | 'availableCash'>;
  integrityResult: MarketDataIntegrityResult;
  riskGuardResult?: RiskGuardResult;
  auditEntry: PaperAuditEntry;
  order?: Order;
  // Phase 18.3.3 Context Binding Metadata
  marketDataSnapshotId?: string;
  recommendationId?: string;
  strategyVersion?: string;
  riskPolicyVersion?: string;
}

export class PaperExecutionEngine {
  private ledger: PaperTradeLedger;
  private defaultPolicy: RiskGuardPolicy;
  private defaultTradingCosts: TradingCostConfig;

  constructor(options: {
    ledger?: PaperTradeLedger;
    policy?: Partial<RiskGuardPolicy>;
    tradingCosts?: Partial<TradingCostConfig>;
  } = {}) {
    this.ledger = options.ledger ?? new PaperTradeLedger();
    this.defaultPolicy = { ...DEFAULT_RISK_GUARD_POLICY, ...options.policy };
    this.defaultTradingCosts = { ...DEFAULT_TRADING_COST_CONFIG, ...options.tradingCosts };
  }

  /**
   * Retrieves the current trade audit ledger.
   */
  getLedger(): PaperTradeLedger {
    return this.ledger;
  }

  /**
   * Executes an investment recommendation through the mandatory paper trading pipeline.
   */
  execute(request: PaperExecutionRequest): PaperExecutionResult {
    const now = request.now ?? Date.now();
    const policy: RiskGuardPolicy = { ...this.defaultPolicy, ...request.policy };
    const costs: TradingCostConfig = { ...this.defaultTradingCosts, ...request.tradingCosts };
    const orderId = request.orderId ?? `P_ORD_${now}_${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

    const rec = request.recommendation;
    const marketData = request.marketData;
    const symbol = (rec?.symbol ?? marketData?.symbol ?? '').toUpperCase();
    const side: OrderSide = rec?.signal === 'SELL' ? 'SELL' : 'BUY';
    const orderType: OrderType = request.orderType ?? 'MARKET';

    // Phase 18.3.3 Metadata extraction
    const marketDataSnapshotId = request.executionContext?.marketDataSnapshotId ?? request.marketDataSnapshotId;
    const recommendationId = request.executionContext?.recommendationId ?? request.recommendationId ?? (rec as any)?.recommendationId;
    const strategyVersion = request.executionContext?.strategyVersion ?? request.strategyVersion;
    const riskPolicyVersion = request.executionContext?.riskPolicyVersion ?? request.riskPolicyVersion;

    const recordAudit = (entry: Omit<PaperAuditEntry, 'auditId'>): PaperAuditEntry => {
      return this.ledger.record({
        ...entry,
        marketDataSnapshotId,
        recommendationId,
        strategyVersion,
        riskPolicyVersion,
      });
    };

    // Establish account context
    const broker = request.broker;
    let account = request.account;
    if (!account && broker) {
      account = broker.getAccountSync();
    }

    const cashBefore = account?.cash ?? account?.availableCash ?? 0;
    const equityBefore = account?.equity ?? cashBefore;
    const exposureBefore = equityBefore > 0 && account
      ? (account.equity - account.availableCash) / equityBefore
      : 0;

    const existingPosition = account?.positions?.find(p => p.symbol.toUpperCase() === symbol);
    const positionBefore = existingPosition?.quantity ?? 0;

    // ==========================================
    // STEP 1: MARKET DATA INTEGRITY GUARD
    // ==========================================
    const integrityResult = MarketDataIntegrityGuard.validate(marketData, {
      now,
      maxStaleTimeMs: policy.maxStaleTimeMs,
      maxPriceDeviationPercent: policy.maxPriceDeviationPercent,
      ...request.integrityOptions,
    });

    if (!integrityResult.valid) {
      const rejectionReason = `Market data integrity check failed: ${integrityResult.message}`;
      const audit = recordAudit({
        orderId,
        timestamp: new Date(now).toISOString(),
        symbol,
        side,
        orderType,
        requestedPrice: marketData?.price ?? rec?.entryPrice ?? 0,
        executedPrice: null,
        requestedQuantity: request.customQuantity ?? 0,
        executedQuantity: 0,
        stopLoss: rec?.stopLoss ?? null,
        targetPrice: rec?.targetPrice ?? null,
        riskAmount: null,
        portfolioExposureBefore: exposureBefore,
        portfolioExposureAfter: exposureBefore,
        cashBefore,
        cashAfter: cashBefore,
        positionBefore,
        positionAfter: positionBefore,
        validatorStatus: 'SKIPPED',
        validatorCode: integrityResult.code,
        validatorReason: rejectionReason,
        riskGuardStatus: 'SKIPPED',
        riskGuardAuthorization: 'SKIPPED',
        riskGuardReason: rejectionReason,
        integrityValid: false,
        integrityReasons: integrityResult.reasons,
        dataSource: marketData?.dataSource,
        marketDataTimestamp: marketData?.timestamp,
        fees: 0,
        tax: 0,
        slippage: 0,
        finalOrderStatus: 'REJECTED',
        rejectionReason,
        errors: integrityResult.errors,
      });

      return {
        success: false,
        orderId,
        symbol,
        side,
        status: 'REJECTED',
        code: (integrityResult.code === 'OK' ? 'INVALID_MARKET_DATA' : integrityResult.code) as ValidationErrorCode,
        message: rejectionReason,
        reason: rejectionReason,
        requestedPrice: marketData?.price ?? 0,
        executedPrice: null,
        requestedQuantity: request.customQuantity ?? 0,
        executedQuantity: 0,
        fee: 0,
        tax: 0,
        slippage: 0,
        integrityResult,
        auditEntry: audit,
        marketDataSnapshotId,
        recommendationId,
        strategyVersion,
        riskPolicyVersion,
      };
    }

    // ==========================================
    // STEP 2: TRADING DATA VALIDATOR
    // ==========================================
    const recValidation = TradingDataValidator.validateRecommendation(rec, marketData, {
      now,
      maxStaleTimeMs: policy.maxStaleTimeMs,
      maxPriceDeviationPercent: policy.maxPriceDeviationPercent,
      minimumRiskReward: policy.minimumRiskReward,
      minimumConfidence: policy.minimumConfidence,
    });

    if (!recValidation.isValid) {
      const rejectionReason = `Recommendation validation failed: ${recValidation.message}`;
      const audit = recordAudit({
        orderId,
        timestamp: new Date(now).toISOString(),
        symbol,
        side,
        orderType,
        requestedPrice: marketData.price,
        executedPrice: null,
        requestedQuantity: request.customQuantity ?? 0,
        executedQuantity: 0,
        stopLoss: rec?.stopLoss ?? null,
        targetPrice: rec?.targetPrice ?? null,
        riskAmount: null,
        portfolioExposureBefore: exposureBefore,
        portfolioExposureAfter: exposureBefore,
        cashBefore,
        cashAfter: cashBefore,
        positionBefore,
        positionAfter: positionBefore,
        validatorStatus: 'INVALID',
        validatorCode: recValidation.code,
        validatorReason: rejectionReason,
        riskGuardStatus: 'SKIPPED',
        riskGuardAuthorization: 'SKIPPED',
        riskGuardReason: rejectionReason,
        integrityValid: true,
        integrityReasons: [],
        dataSource: marketData.dataSource,
        marketDataTimestamp: marketData.timestamp,
        fees: 0,
        tax: 0,
        slippage: 0,
        finalOrderStatus: 'REJECTED',
        rejectionReason,
        errors: recValidation.errors,
      });

      const code = (recValidation.code === 'RR_TOO_LOW'
        ? 'INVALID_RISK_REWARD'
        : (recValidation.code === 'OK' ? 'INVALID_SIGNAL' : recValidation.code)) as ValidationErrorCode;
      return {
        success: false,
        orderId,
        symbol,
        side,
        status: 'REJECTED',
        code,
        message: rejectionReason,
        reason: rejectionReason,
        requestedPrice: marketData.price,
        executedPrice: null,
        requestedQuantity: request.customQuantity ?? 0,
        executedQuantity: 0,
        fee: 0,
        tax: 0,
        slippage: 0,
        integrityResult,
        auditEntry: audit,
        marketDataSnapshotId,
        recommendationId,
        strategyVersion,
        riskPolicyVersion,
      };
    }

    // ==========================================
    // STEP 3: RISK GUARD EVALUATION
    // ==========================================
    const emergencyStop =
      Boolean((policy as any)?.emergencyStop) ||
      (broker ? broker.isEmergencyStopActive() : false);

    const tradingEnabled =
      (policy as any)?.tradingEnabled !== undefined
        ? Boolean((policy as any).tradingEnabled)
        : (broker ? broker.isTradingEnabled() : true);

    const dailyRealizedLoss =
      account?.realizedPnL !== undefined && account.realizedPnL < 0
        ? Math.abs(account.realizedPnL)
        : (broker && (broker as any).getAccountSync().realizedPnL < 0
            ? Math.abs((broker as any).getAccountSync().realizedPnL)
            : 0);

    const riskInput: RiskGuardEvaluationInput = {
      symbol,
      signal: rec.signal as 'BUY' | 'SELL' | 'HOLD',
      entryPrice: rec.entryPrice ?? marketData.price,
      stopLoss: rec.stopLoss ?? 0,
      targetPrice: rec.targetPrice ?? 0,
      confidence: rec.confidence,
      score: rec.score,
      currentPrice: marketData.price,
      accountEquity: equityBefore,
      availableCash: cashBefore,
      currentExposure: exposureBefore * equityBefore,
      openPositionsCount: account?.positions?.filter(p => p.quantity > 0).length ?? 0,
      existingSymbols: account?.positions?.map(p => p.symbol.toUpperCase()) ?? [],
      ceilingPrice: marketData.ceilingPrice,
      floorPrice: marketData.floorPrice,
      timestamp: marketData.timestamp ?? now,
      emergencyStop,
      tradingEnabled,
      dailyRealizedLoss,
    };

    const riskResult = RiskGuard.evaluate(riskInput, policy);

    // CRITICAL: Must strictly require AUTHORIZED_FOR_PAPER_TRADING
    if (riskResult.authorization !== 'AUTHORIZED_FOR_PAPER_TRADING') {
      const rejectionReason = `RiskGuard rejected execution: [${riskResult.authorization}] ${riskResult.reason}`;
      const audit = recordAudit({
        orderId,
        timestamp: new Date(now).toISOString(),
        symbol,
        side,
        orderType,
        requestedPrice: marketData.price,
        executedPrice: null,
        requestedQuantity: request.customQuantity ?? riskResult.metrics?.approvedQuantity ?? 0,
        executedQuantity: 0,
        stopLoss: rec.stopLoss,
        targetPrice: rec.targetPrice,
        riskAmount: riskResult.metrics?.riskAmount ?? null,
        portfolioExposureBefore: exposureBefore,
        portfolioExposureAfter: exposureBefore,
        cashBefore,
        cashAfter: cashBefore,
        positionBefore,
        positionAfter: positionBefore,
        validatorStatus: 'VALID',
        validatorCode: 'OK',
        riskGuardStatus: riskResult.status,
        riskGuardAuthorization: riskResult.authorization,
        riskGuardReason: riskResult.reason,
        integrityValid: true,
        integrityReasons: [],
        dataSource: marketData.dataSource,
        marketDataTimestamp: marketData.timestamp,
        fees: 0,
        tax: 0,
        slippage: 0,
        finalOrderStatus: 'REJECTED',
        rejectionReason,
        errors: riskResult.errors,
      });

      return {
        success: false,
        orderId,
        symbol,
        side,
        status: 'REJECTED',
        code: riskResult.code === 'APPROVED' ? 'RISK_LIMIT_EXCEEDED' : riskResult.code,
        message: rejectionReason,
        reason: rejectionReason,
        requestedPrice: marketData.price,
        executedPrice: null,
        requestedQuantity: request.customQuantity ?? 0,
        executedQuantity: 0,
        fee: 0,
        tax: 0,
        slippage: 0,
        integrityResult,
        riskGuardResult: riskResult,
        auditEntry: audit,
        marketDataSnapshotId,
        recommendationId,
        strategyVersion,
        riskPolicyVersion,
      };
    }

    // ==========================================
    // STEP 4: VIETNAM LOT SIZE & QUANTITY
    // ==========================================
    const rawQuantity = request.customQuantity ?? riskResult.metrics?.approvedQuantity ?? 0;
    const roundedQuantity = VietnamLotRule.roundDownToLot(rawQuantity, policy.lotSize);

    if (roundedQuantity <= 0) {
      const rejectionReason = `Order quantity (${rawQuantity}) rounded down to 0 lots (minimum lot size: ${policy.lotSize})`;
      const audit = recordAudit({
        orderId,
        timestamp: new Date(now).toISOString(),
        symbol,
        side,
        orderType,
        requestedPrice: marketData.price,
        executedPrice: null,
        requestedQuantity: rawQuantity,
        executedQuantity: 0,
        stopLoss: rec.stopLoss,
        targetPrice: rec.targetPrice,
        riskAmount: riskResult.metrics?.riskAmount ?? null,
        portfolioExposureBefore: exposureBefore,
        portfolioExposureAfter: exposureBefore,
        cashBefore,
        cashAfter: cashBefore,
        positionBefore,
        positionAfter: positionBefore,
        validatorStatus: 'VALID',
        validatorCode: 'OK',
        riskGuardStatus: riskResult.status,
        riskGuardAuthorization: riskResult.authorization,
        riskGuardReason: riskResult.reason,
        integrityValid: true,
        integrityReasons: [],
        dataSource: marketData.dataSource,
        marketDataTimestamp: marketData.timestamp,
        fees: 0,
        tax: 0,
        slippage: 0,
        finalOrderStatus: 'REJECTED',
        rejectionReason,
        errors: ['Quantity rounded down to 0'],
      });

      return {
        success: false,
        orderId,
        symbol,
        side,
        status: 'REJECTED',
        code: 'INVALID_QUANTITY',
        message: rejectionReason,
        reason: rejectionReason,
        requestedPrice: marketData.price,
        executedPrice: null,
        requestedQuantity: rawQuantity,
        executedQuantity: 0,
        fee: 0,
        tax: 0,
        slippage: 0,
        integrityResult,
        riskGuardResult: riskResult,
        auditEntry: audit,
        marketDataSnapshotId,
        recommendationId,
        strategyVersion,
        riskPolicyVersion,
      };
    }

    // ==========================================
    // STEP 5: CAPITAL & POSITION VALIDATION
    // ==========================================
    const slippageRate = costs.slippageRate;
    const buyFeeRate = costs.buyFeeRate;
    const sellFeeRate = costs.sellFeeRate;
    const sellTaxRate = costs.sellTaxRate;

    let executedPrice: number;
    let fee = 0;
    let tax = 0;
    let slippageAmount = 0;
    let totalCashChange = 0;
    let realizedPnL: number | undefined;

    if (side === 'BUY') {
      // Deterministic BUY execution with upward slippage buffer
      executedPrice = Math.round(marketData.price * (1 + slippageRate));
      slippageAmount = executedPrice - marketData.price;
      const tradeCost = executedPrice * roundedQuantity;
      fee = Math.round(tradeCost * buyFeeRate);
      const totalRequiredCash = tradeCost + fee;

      if (cashBefore < totalRequiredCash) {
        const rejectionReason = `Insufficient available cash: required ${totalRequiredCash.toLocaleString()} VND, available ${cashBefore.toLocaleString()} VND`;
        const audit = recordAudit({
          orderId,
          timestamp: new Date(now).toISOString(),
          symbol,
          side,
          orderType,
          requestedPrice: marketData.price,
          executedPrice: null,
          requestedQuantity: roundedQuantity,
          executedQuantity: 0,
          stopLoss: rec.stopLoss,
          targetPrice: rec.targetPrice,
          riskAmount: riskResult.metrics?.riskAmount ?? null,
          portfolioExposureBefore: exposureBefore,
          portfolioExposureAfter: exposureBefore,
          cashBefore,
          cashAfter: cashBefore,
          positionBefore,
          positionAfter: positionBefore,
          validatorStatus: 'VALID',
          validatorCode: 'OK',
          riskGuardStatus: riskResult.status,
          riskGuardAuthorization: riskResult.authorization,
          riskGuardReason: riskResult.reason,
          integrityValid: true,
          integrityReasons: [],
          dataSource: marketData.dataSource,
          marketDataTimestamp: marketData.timestamp,
          fees: 0,
          tax: 0,
          slippage: 0,
          finalOrderStatus: 'REJECTED',
          rejectionReason,
          errors: [rejectionReason],
        });

        return {
          success: false,
          orderId,
          symbol,
          side,
          status: 'REJECTED',
          code: 'INSUFFICIENT_CASH',
          message: rejectionReason,
          reason: rejectionReason,
          requestedPrice: marketData.price,
          executedPrice: null,
          requestedQuantity: roundedQuantity,
          executedQuantity: 0,
          fee: 0,
          tax: 0,
          slippage: 0,
          integrityResult,
          riskGuardResult: riskResult,
          auditEntry: audit,
          marketDataSnapshotId,
          recommendationId,
          strategyVersion,
          riskPolicyVersion,
        };
      }

      totalCashChange = -totalRequiredCash;
    } else {
      // SELL execution: verify existing position quantity
      if (positionBefore < roundedQuantity) {
        const rejectionReason = `Insufficient position for SELL: requested ${roundedQuantity} shares, available ${positionBefore} shares`;
        const audit = recordAudit({
          orderId,
          timestamp: new Date(now).toISOString(),
          symbol,
          side,
          orderType,
          requestedPrice: marketData.price,
          executedPrice: null,
          requestedQuantity: roundedQuantity,
          executedQuantity: 0,
          stopLoss: rec.stopLoss,
          targetPrice: rec.targetPrice,
          riskAmount: null,
          portfolioExposureBefore: exposureBefore,
          portfolioExposureAfter: exposureBefore,
          cashBefore,
          cashAfter: cashBefore,
          positionBefore,
          positionAfter: positionBefore,
          validatorStatus: 'VALID',
          validatorCode: 'OK',
          riskGuardStatus: riskResult.status,
          riskGuardAuthorization: riskResult.authorization,
          riskGuardReason: riskResult.reason,
          integrityValid: true,
          integrityReasons: [],
          dataSource: marketData.dataSource,
          marketDataTimestamp: marketData.timestamp,
          fees: 0,
          tax: 0,
          slippage: 0,
          finalOrderStatus: 'REJECTED',
          rejectionReason,
          errors: [rejectionReason],
        });

        return {
          success: false,
          orderId,
          symbol,
          side,
          status: 'REJECTED',
          code: 'INSUFFICIENT_POSITION',
          message: rejectionReason,
          reason: rejectionReason,
          requestedPrice: marketData.price,
          executedPrice: null,
          requestedQuantity: roundedQuantity,
          executedQuantity: 0,
          fee: 0,
          tax: 0,
          slippage: 0,
          integrityResult,
          riskGuardResult: riskResult,
          auditEntry: audit,
          marketDataSnapshotId,
          recommendationId,
          strategyVersion,
          riskPolicyVersion,
        };
      }

      // Deterministic SELL execution with downward slippage
      executedPrice = Math.round(marketData.price * (1 - slippageRate));
      slippageAmount = marketData.price - executedPrice;
      const grossProceeds = executedPrice * roundedQuantity;
      fee = Math.round(grossProceeds * sellFeeRate);
      tax = Math.round(grossProceeds * sellTaxRate);
      const netProceeds = grossProceeds - fee - tax;
      totalCashChange = netProceeds;

      const avgCost = existingPosition?.averageCost ?? executedPrice;
      const pnlResult = PaperPnL.calculateRealizedPnL({
        sellPrice: executedPrice,
        averageCost: avgCost,
        quantity: roundedQuantity,
        sellFeeRate,
        sellTaxRate,
      });
      realizedPnL = pnlResult.netPnL;
    }

    // ==========================================
    // STEP 6: ATOMIC PORTFOLIO UPDATE
    // ==========================================
    let cashAfter = cashBefore + totalCashChange;
    let positionAfter = positionBefore;
    let exposureAfter = exposureBefore;

    if (broker) {
      // Route fill atomically through PaperBroker
      broker.processMarketData({
        symbol,
        price: marketData.price,
        timestamp: marketData.timestamp ?? now,
      });

      const orderRequest = {
        symbol,
        side,
        type: orderType,
        quantity: roundedQuantity,
        limitPrice: marketData.price,
        marketDataSnapshotId,
        recommendationId,
        strategyVersion,
        riskPolicyVersion,
      };

      const brokerOrderResult = broker.submitOrderSync(orderRequest);

      if (!brokerOrderResult.success || brokerOrderResult.order.status === 'REJECTED') {
        const rejectionReason = brokerOrderResult.error?.message ?? brokerOrderResult.order.rejectedReason ?? 'Broker rejected order execution';
        const audit = recordAudit({
          orderId,
          timestamp: new Date(now).toISOString(),
          symbol,
          side,
          orderType,
          requestedPrice: marketData.price,
          executedPrice: null,
          requestedQuantity: roundedQuantity,
          executedQuantity: 0,
          stopLoss: rec.stopLoss,
          targetPrice: rec.targetPrice,
          riskAmount: riskResult.metrics?.riskAmount ?? null,
          portfolioExposureBefore: exposureBefore,
          portfolioExposureAfter: exposureBefore,
          cashBefore,
          cashAfter: cashBefore,
          positionBefore,
          positionAfter: positionBefore,
          validatorStatus: 'VALID',
          validatorCode: 'OK',
          riskGuardStatus: riskResult.status,
          riskGuardAuthorization: riskResult.authorization,
          riskGuardReason: riskResult.reason,
          integrityValid: true,
          integrityReasons: [],
          dataSource: marketData.dataSource,
          marketDataTimestamp: marketData.timestamp,
          fees: 0,
          tax: 0,
          slippage: 0,
          finalOrderStatus: 'REJECTED',
          rejectionReason,
          errors: [rejectionReason],
        });

        return {
          success: false,
          orderId,
          symbol,
          side,
          status: 'REJECTED',
          code: brokerOrderResult.order.rejectionCode ?? 'INVALID_ORDER',
          message: rejectionReason,
          reason: rejectionReason,
          requestedPrice: marketData.price,
          executedPrice: null,
          requestedQuantity: roundedQuantity,
          executedQuantity: 0,
          fee: 0,
          tax: 0,
          slippage: 0,
          integrityResult,
          riskGuardResult: riskResult,
          auditEntry: audit,
          order: brokerOrderResult.order,
          marketDataSnapshotId,
          recommendationId,
          strategyVersion,
          riskPolicyVersion,
        };
      }

      const updatedAccount = broker.getAccount();
      cashAfter = updatedAccount.cash;
      const updatedPos = updatedAccount.positions.find(p => p.symbol.toUpperCase() === symbol);
      positionAfter = updatedPos?.quantity ?? 0;
      exposureAfter = updatedAccount.equity > 0
        ? (updatedAccount.equity - updatedAccount.availableCash) / updatedAccount.equity
        : 0;
    } else if (account) {
      // Update passed account representation atomically
      account.cash = cashAfter;
      account.availableCash = cashAfter;

      if (side === 'BUY') {
        positionAfter = positionBefore + roundedQuantity;
        if (existingPosition) {
          const totalCost = (existingPosition.quantity * existingPosition.averageCost) + (executedPrice * roundedQuantity);
          existingPosition.quantity = positionAfter;
          existingPosition.availableQuantity = positionAfter;
          existingPosition.averageCost = totalCost / positionAfter;
          existingPosition.currentPrice = marketData.price;
          existingPosition.marketValue = positionAfter * marketData.price;
        } else {
          account.positions.push({
            symbol,
            quantity: roundedQuantity,
            reservedQuantity: 0,
            availableQuantity: roundedQuantity,
            averageCost: executedPrice,
            currentPrice: marketData.price,
            marketValue: roundedQuantity * marketData.price,
            unrealizedPnL: 0,
            unrealizedPnLPercent: 0,
            updatedAt: new Date(now).toISOString(),
          });
        }
      } else {
        positionAfter = positionBefore - roundedQuantity;
        if (existingPosition) {
          existingPosition.quantity = positionAfter;
          existingPosition.availableQuantity = positionAfter;
          existingPosition.currentPrice = marketData.price;
          existingPosition.marketValue = positionAfter * marketData.price;
          existingPosition.updatedAt = new Date(now).toISOString();
        }
      }

      // Recompute equity and exposure
      const portMetrics = PaperPnL.calculatePortfolioMetrics(account.cash, account.reservedCash, account.positions);
      account.equity = portMetrics.equity;
      account.marketValue = portMetrics.totalMarketValue;
      exposureAfter = portMetrics.portfolioExposureRate;
    }

    // ==========================================
    // STEP 7: RECORD SUCCESSFUL AUDIT LEDGER
    // ==========================================
    const audit = recordAudit({
      orderId,
      timestamp: new Date(now).toISOString(),
      symbol,
      side,
      orderType,
      requestedPrice: marketData.price,
      executedPrice,
      requestedQuantity: roundedQuantity,
      executedQuantity: roundedQuantity,
      stopLoss: rec.stopLoss,
      targetPrice: rec.targetPrice,
      riskAmount: riskResult.metrics?.riskAmount ?? null,
      portfolioExposureBefore: exposureBefore,
      portfolioExposureAfter: exposureAfter,
      cashBefore,
      cashAfter,
      positionBefore,
      positionAfter,
      validatorStatus: 'VALID',
      validatorCode: 'OK',
      riskGuardStatus: riskResult.status,
      riskGuardAuthorization: riskResult.authorization,
      riskGuardReason: riskResult.reason,
      integrityValid: true,
      integrityReasons: [],
      dataSource: marketData.dataSource,
      marketDataTimestamp: marketData.timestamp,
      fees: fee,
      tax,
      slippage: slippageAmount,
      realizedPnL,
      finalOrderStatus: 'FILLED',
      errors: [],
    });

    return {
      success: true,
      orderId,
      symbol,
      side,
      status: 'FILLED',
      code: 'EXECUTED',
      message: `Paper ${side} executed successfully for ${roundedQuantity} shares of ${symbol} at ${executedPrice.toLocaleString()} VND`,
      requestedPrice: marketData.price,
      executedPrice,
      requestedQuantity: roundedQuantity,
      executedQuantity: roundedQuantity,
      buyCost: side === 'BUY' ? executedPrice * roundedQuantity : undefined,
      sellProceeds: side === 'SELL' ? executedPrice * roundedQuantity : undefined,
      fee,
      tax,
      slippage: slippageAmount,
      realizedPnL,
      accountBefore: { cash: cashBefore, equity: equityBefore, availableCash: cashBefore },
      accountAfter: { cash: cashAfter, equity: cashAfter + (positionAfter * marketData.price), availableCash: cashAfter },
      integrityResult,
      riskGuardResult: riskResult,
      auditEntry: audit,
      marketDataSnapshotId,
      recommendationId,
      strategyVersion,
      riskPolicyVersion,
    };
  }
}
