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

/**
 * P0-03 / P1-11 — REFERENCE RISK-ENVELOPE MULTIPLIERS FOR THE LEGACY DETERMINISTIC
 * REPLAY HARNESS.
 *
 * These are named harness constants, not valuation logic. They exist so the state
 * machine, risk gates and financial-conservation invariants can run when the
 * recorded order intent carries no risk envelope. Every signal derived from them
 * is tagged with a HARNESS_DERIVED_RISK_ENVELOPE warning, and the previously
 * hardcoded riskReward / expectedReturn constants are now computed from them.
 *
 * This is the ONLY place in the repository where a target/stop may be derived from
 * a price, and it is a test-harness-only path: no HTTP route reaches it.
 */
export const REPLAY_TARGET_MULTIPLE = 1.15;
export const REPLAY_STOP_MULTIPLE = 0.93;

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
          // The legacy deterministic harness reconstructs a decision from a
          // MarketSnapshot. When the recorded order intent carries no risk envelope,
          // it derives a REFERENCE envelope from the observed price so the state
          // machine, risk gates and conservation invariants can run deterministically.
          //
          // P0-03 / P1-11: this derivation is explicitly a harness contract, not a
          // certified valuation:
          //   - the previously hardcoded `riskReward: 2.14` and `expectedReturn: 15`
          //     are removed; both are now COMPUTED from the levels actually used;
          //   - a warning always names the derivation, so a replay can never be read
          //     as evidence that the strategy really produced these levels;
          //   - no consumer of this harness treats the derived levels as a decision.
          targetPrice: orderIntent.targetPrice ?? Math.round(quote.last * REPLAY_TARGET_MULTIPLE),
          stopLoss: orderIntent.stopLoss ?? Math.round(quote.last * REPLAY_STOP_MULTIPLE),
          riskReward:
            orderIntent.targetPrice != null && orderIntent.stopLoss != null
              ? Number(
                  (
                    (orderIntent.targetPrice - quote.last) /
                    (quote.last - orderIntent.stopLoss)
                  ).toFixed(2)
                )
              : Number(
                  ((quote.last * REPLAY_TARGET_MULTIPLE - quote.last) /
                    (quote.last - quote.last * REPLAY_STOP_MULTIPLE)).toFixed(2)
                ),
          expectedReturn: orderIntent.targetPrice != null
            ? Number((((orderIntent.targetPrice - quote.last) / quote.last) * 100).toFixed(2))
            : Number((REPLAY_TARGET_MULTIPLE * 100).toFixed(2)),
          holdingPeriod: 14,
          reasons: ['Deterministic Replay Execution from MarketSnapshot'],
          warnings:
            orderIntent.targetPrice == null || orderIntent.stopLoss == null
              ? [
                  'HARNESS_DERIVED_RISK_ENVELOPE: the recorded order intent carries no target/stop, so the replay derived a reference envelope from the observed price (target x' +
                    String(REPLAY_TARGET_MULTIPLE) +
                    ', stop x' +
                    String(REPLAY_STOP_MULTIPLE) +
                    '). These levels are a harness contract, NOT a certified valuation or a recorded decision.',
                ]
              : [],
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
