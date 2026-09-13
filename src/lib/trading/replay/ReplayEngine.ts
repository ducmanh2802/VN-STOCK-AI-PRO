import type { TradingMarketData } from '../types/trading.ts';
import type { RiskGuardPolicy } from '../types/risk.ts';
import type { BrokerAccount } from '../execution/BrokerAdapter.ts';
import type { InvestmentRecommendation } from '../../../types/recommendation.ts';
import type { MarketSnapshot } from '../snapshot/types.ts';
import { PaperExecutionEngine } from '../paper/PaperExecutionEngine.ts';
import { PaperBroker } from '../paper/PaperBroker.ts';
import { PaperTradeLedger } from '../paper/PaperTradeLedger.ts';
import type {
  ReplayRequest,
  ReplayResult,
  OrderIntent,
  ExecutionContextBinding,
  ReplayEvent,
} from './types.ts';
import type { OrderStatus } from '../types/trading.ts';
import { ReplayValidator } from './ReplayValidator.ts';
import { ReplayResultFactory } from './ReplayResult.ts';
import { OrderStateMachine } from './OrderStateMachine.ts';

export class ReplayEngine {
  /**
   * Helper to bind an OrderIntent directly to a MarketSnapshot with context metadata.
   */
  static bindOrderIntent(
    snapshot: MarketSnapshot,
    intent: OrderIntent,
    options: {
      strategyVersion?: string;
      riskPolicyVersion?: string;
      recommendationId?: string;
    } = {}
  ): { orderIntent: OrderIntent; executionContext: ExecutionContextBinding } {
    const marketDataSnapshotId = snapshot.snapshotId;
    const recommendationId = options.recommendationId ?? snapshot.recommendation?.recommendationId ?? intent.recommendationId;
    const strategyVersion = options.strategyVersion ?? snapshot.versions?.strategyVersion ?? intent.strategyVersion;
    const riskPolicyVersion = options.riskPolicyVersion ?? snapshot.versions?.riskPolicyVersion ?? intent.riskPolicyVersion;

    const executionContext: ExecutionContextBinding = Object.freeze({
      marketDataSnapshotId,
      recommendationId,
      strategyVersion,
      riskPolicyVersion,
    });

    const boundOrderIntent: OrderIntent = Object.freeze({
      ...intent,
      marketDataSnapshotId,
      recommendationId,
      strategyVersion,
      riskPolicyVersion,
    });

    return {
      orderIntent: boundOrderIntent,
      executionContext,
    };
  }

  /**
   * Replays an execution deterministically and verifies consistency.
   * Fail-closed, pure, non-mutating.
   */
  static replay(request: ReplayRequest): ReplayResult {
    return new ReplayEngine().replay(request);
  }

  /**
   * Instance replay method.
   */
  replay(request: ReplayRequest): ReplayResult {
    const snapshotId = request?.snapshot?.snapshotId ?? request?.executionContext?.marketDataSnapshotId ?? 'UNKNOWN_SNAPSHOT';

    // 1. Fail-closed Pre-Validation
    const validation = ReplayValidator.validate(request);
    if (!validation.isValid) {
      return ReplayResultFactory.invalid(snapshotId, validation.mismatches, validation.error);
    }

    const { snapshot, orderIntent, executionContext } = request;

    // 2. Synthesize TradingMarketData exclusively from immutable MarketSnapshot
    const quote = snapshot.quote;
    const marketTimestamp = new Date(quote.timestamp).getTime();
    const replayNow = request.customNow ?? marketTimestamp;

    const marketData: TradingMarketData = {
      symbol: snapshot.instrument.symbol,
      price: quote.last,
      open: quote.open ?? null,
      high: quote.high ?? null,
      low: quote.low ?? null,
      close: quote.close ?? null,
      volume: quote.volume ?? null,
      referencePrice: quote.reference ?? null,
      ceilingPrice: quote.ceiling ?? null,
      floorPrice: quote.floor ?? null,
      timestamp: marketTimestamp,
      dataSource: snapshot.source.provider,
    };

    // 3. Synthesize or Clone InvestmentRecommendation
    const recommendation: InvestmentRecommendation = orderIntent.recommendation
      ? { ...orderIntent.recommendation }
      : {
          symbol: snapshot.instrument.symbol,
          strategy: (snapshot.recommendation?.horizon as any) ?? 'SHORT_TERM',
          signal: orderIntent.side === 'SELL' ? 'SELL' : 'BUY',
          score: (orderIntent.score ?? snapshot.recommendation?.confidence ?? 85) as number,
          confidence: (orderIntent.confidence as any) ?? 'HIGH',
          entryPrice: quote.last,
          targetPrice: orderIntent.targetPrice ?? (orderIntent.side === 'BUY' ? Math.round(quote.last * 1.15) : Math.round(quote.last * 0.85)),
          stopLoss: orderIntent.stopLoss ?? (orderIntent.side === 'BUY' ? Math.round(quote.last * 0.93) : Math.round(quote.last * 1.07)),
          riskReward: 2.14,
          expectedReturn: 15,
          holdingPeriod: 14,
          reasons: ['Deterministic Replay Execution from MarketSnapshot'],
          warnings: [],
          currency: 'VND',
          generatedAt: snapshot.capturedAt,
          asOfDate: snapshot.market.tradingDate,
          scoreBreakdown: {
            technical: null,
            fundamental: null,
            momentum: null,
            moneyFlow: null,
            valuation: null,
            risk: null,
          },
          evidence: [],
        };

    const policy: Partial<RiskGuardPolicy> = {
      maxStaleTimeMs: Number.MAX_SAFE_INTEGER,
      ...request.policy,
    };

    // Helper to create isolated sandbox
    const runIsolatedExecution = () => {
      const sandboxLedger = new PaperTradeLedger();
      const initialAccountClone: BrokerAccount = request.initialAccount
        ? JSON.parse(JSON.stringify(request.initialAccount))
        : {
            accountId: 'REPLAY_SANDBOX',
            currency: 'VND',
            cash: 500_000_000,
            reservedCash: 0,
            availableCash: 500_000_000,
            marketValue: 0,
            equity: 500_000_000,
            realizedPnL: 0,
            unrealizedPnL: 0,
            positions: [],
            openOrders: [],
            updatedAt: snapshot.capturedAt,
          };

      const sandboxBroker = new PaperBroker({
        accountId: initialAccountClone.accountId,
        initialCash: initialAccountClone.cash,
        currency: initialAccountClone.currency,
        tradingCosts: request.tradingCosts,
        skipSessionValidation: true,
      });

      if (initialAccountClone.positions && initialAccountClone.positions.length > 0) {
        for (const pos of initialAccountClone.positions) {
          sandboxBroker.seedPosition({
            symbol: pos.symbol,
            quantity: pos.quantity,
            averageCost: pos.averageCost ?? (pos as any).averageBuyPrice ?? pos.currentPrice ?? quote.last,
          });
        }
      }

      const sandboxEngine = new PaperExecutionEngine({
        ledger: sandboxLedger,
        policy,
        tradingCosts: request.tradingCosts,
      });

      const execResult = sandboxEngine.execute({
        recommendation,
        marketData,
        account: initialAccountClone,
        broker: sandboxBroker,
        orderType: orderIntent.orderType ?? 'MARKET',
        customQuantity: orderIntent.quantity,
        now: replayNow,
        policy,
        tradingCosts: request.tradingCosts,
        orderId: 'REPLAY_EXEC_' + snapshot.snapshotId.slice(0, 8),
        executionContext,
        marketDataSnapshotId: executionContext.marketDataSnapshotId,
        recommendationId: executionContext.recommendationId,
        strategyVersion: executionContext.strategyVersion,
        riskPolicyVersion: executionContext.riskPolicyVersion,
      });

      return {
        execResult,
        summary: ReplayResultFactory.summarizeExecution(execResult),
      };
    };

    // 4. Run Execution Iteration 1
    const run1 = runIsolatedExecution();

    // 5. Run Execution Iteration 2 (Determinism verification)
    const run2 = runIsolatedExecution();

    const determinismMismatches = ReplayResultFactory.compareExecutions(run1.summary, run2.summary);
    if (determinismMismatches.length > 0) {
      return ReplayResultFactory.nonDeterministic(snapshot.snapshotId, run1.summary, run2.summary, determinismMismatches);
    }

    // Compute canonical or sequential state & event histories
    let stateHistory: OrderStatus[];
    let eventHistory: readonly ReplayEvent[];

    if (request.eventSequence) {
      stateHistory = ['NEW', ...request.eventSequence.map(e => e.nextState)];
      eventHistory = request.eventSequence;
    } else {
      const orderId = 'REPLAY_EXEC_' + snapshot.snapshotId.slice(0, 8);
      const isFilled = run1.summary.status === 'FILLED';
      eventHistory = OrderStateMachine.buildCanonicalSequence({
        orderId,
        snapshotId: snapshot.snapshotId,
        quantity: run1.summary.executedQuantity || orderIntent.quantity || 100,
        price: run1.summary.executedPrice ?? quote.last,
        fee: run1.summary.fee,
        tax: run1.summary.tax,
        timestamp: replayNow,
        isFilled,
        rejectionReason: !isFilled ? run1.summary.code : undefined,
      });
      stateHistory = isFilled
        ? ['NEW', 'VALIDATED', 'AUTHORIZED', 'SUBMITTED', 'FILLED', 'SETTLED']
        : ['NEW', 'VALIDATED', 'AUTHORIZED', 'REJECTED'];
    }

    // 6. If originalExecution is provided, compare against original
    if (request.originalExecution) {
      const origSummary = ReplayResultFactory.summarizeExecution(request.originalExecution);
      const executionMismatches = ReplayResultFactory.compareExecutions(origSummary, run1.summary);

      if (executionMismatches.length > 0) {
        return ReplayResultFactory.mismatch(snapshot.snapshotId, origSummary, run1.summary, executionMismatches, {
          stateHistory,
          eventHistory,
        });
      }

      return ReplayResultFactory.success(snapshot.snapshotId, origSummary, run1.summary, {
        stateHistory,
        eventHistory,
      });
    }

    // 7. No original provided - replay succeeded cleanly and deterministically
    return ReplayResultFactory.success(snapshot.snapshotId, undefined, run1.summary, {
      stateHistory,
      eventHistory,
    });
  }
}
