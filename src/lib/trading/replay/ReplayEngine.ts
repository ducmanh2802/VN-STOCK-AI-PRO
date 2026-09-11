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
} from './types.ts';
import { ReplayValidator } from './ReplayValidator.ts';
import { ReplayResultFactory } from './ReplayResult.ts';

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
    const strategyVersion = options.strategyVersion ?? snapshot.versions?.strategyVersion ?? intent.strategyVersion ?? 'v1.0.0';
    const riskPolicyVersion = options.riskPolicyVersion ?? snapshot.versions?.riskPolicyVersion ?? intent.riskPolicyVersion ?? 'v1.0.0';

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
      skipSessionValidation: true,
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
        initialAccount: initialAccountClone,
        initialTradingCosts: request.tradingCosts,
      });

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

    // 6. If originalExecution is provided, compare against original
    if (request.originalExecution) {
      const origSummary = ReplayResultFactory.summarizeExecution(request.originalExecution);
      const executionMismatches = ReplayResultFactory.compareExecutions(origSummary, run1.summary);

      if (executionMismatches.length > 0) {
        return ReplayResultFactory.mismatch(snapshot.snapshotId, origSummary, run1.summary, executionMismatches);
      }

      return ReplayResultFactory.success(snapshot.snapshotId, origSummary, run1.summary);
    }

    // 7. No original provided - replay succeeded cleanly and deterministically
    return ReplayResultFactory.success(snapshot.snapshotId, undefined, run1.summary);
  }
}
