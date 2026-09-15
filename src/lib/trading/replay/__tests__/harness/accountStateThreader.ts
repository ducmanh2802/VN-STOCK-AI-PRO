/**
 * Account State Threader for Single-Event Replay Chaining
 * =======================================================
 * Pure, deterministic function that applies a single ReplayResult
 * onto an incoming BrokerAccount to produce the strictly valid next BrokerAccount
 * and a corresponding synthetic PaperAuditEntry for downstream reconciliation.
 * 
 * Invariants:
 * - Pure: Never mutates the incoming account object (deep clone).
 * - Exact Financial Conservation: Adheres 100% to PaperBroker's cost basis, fee, and tax semantics.
 * - Idempotent on Rejection: Rejections, invalid inputs, or failures leave account state untouched.
 */

import type { BrokerAccount, BrokerPosition } from '../../../execution/BrokerAdapter.ts';
import type { MarketSnapshot } from '../../../snapshot/types.ts';
import type { ReplayResult, OrderIntent, ExecutionContextBinding } from '../../types.ts';
import type { PaperAuditEntry } from '../../../paper/PaperTradeLedger.ts';

export interface StateThreadOutcome {
  readonly nextAccount: BrokerAccount;
  readonly auditEntry?: PaperAuditEntry;
}

export class AccountStateThreader {
  /**
   * Clones a BrokerAccount deeply and cleanly.
   */
  static cloneAccount(account: BrokerAccount): BrokerAccount {
    return {
      accountId: account.accountId,
      currency: account.currency,
      cash: account.cash,
      reservedCash: account.reservedCash,
      availableCash: account.availableCash,
      marketValue: account.marketValue,
      equity: account.equity,
      realizedPnL: account.realizedPnL,
      unrealizedPnL: account.unrealizedPnL,
      positions: account.positions.map((p) => ({ ...p })),
      openOrders: account.openOrders ? [...account.openOrders] : [],
      updatedAt: account.updatedAt,
    };
  }

  /**
   * Applies a ReplayResult to a BrokerAccount and returns the updated state.
   */
  static applyReplayResult(
    accountBefore: BrokerAccount,
    replayResult: ReplayResult,
    orderIntent: OrderIntent,
    snapshot: MarketSnapshot,
    stepIndex: number = 0,
    timestampOverride?: number
  ): StateThreadOutcome {
    const currentAccount = this.cloneAccount(accountBefore);
    const execution = replayResult.replayExecution;
    const isoTimestamp = timestampOverride
      ? new Date(timestampOverride).toISOString()
      : snapshot.capturedAt;

    const symbol = orderIntent.symbol;
    const existingPos = currentAccount.positions.find((p) => p.symbol === symbol);
    const positionBefore = existingPos ? existingPos.quantity : 0;
    const cashBefore = currentAccount.cash;

    // 1. If Replay failed, was invalid, or was not FILLED -> State does not mutate
    if (
      replayResult.status !== 'REPLAYED' ||
      !execution ||
      execution.status !== 'FILLED' ||
      execution.executedQuantity <= 0
    ) {
      const isRejected = execution && execution.status === 'REJECTED';
      const auditEntry: PaperAuditEntry = {
        auditId: `AUDIT_PBT_${stepIndex}_${snapshot.snapshotId.slice(0, 8)}`,
        orderId: execution?.orderId || `ORDER_${stepIndex}`,
        timestamp: isoTimestamp,
        symbol,
        side: orderIntent.side,
        orderType: orderIntent.orderType || 'MARKET',
        requestedPrice: orderIntent.limitPrice || snapshot.quote.last,
        executedPrice: null,
        requestedQuantity: orderIntent.quantity,
        executedQuantity: 0,
        stopLoss: orderIntent.stopLoss || null,
        targetPrice: orderIntent.targetPrice || null,
        riskAmount: null,
        portfolioExposureBefore: currentAccount.marketValue,
        portfolioExposureAfter: currentAccount.marketValue,
        cashBefore,
        cashAfter: cashBefore,
        positionBefore,
        positionAfter: positionBefore,
        validatorStatus: isRejected ? 'INVALID' : 'SKIPPED',
        validatorCode: (execution?.code as any) || 'REJECTED',
        validatorReason: execution?.code || replayResult.error,
        riskGuardStatus: 'SKIPPED',
        riskGuardAuthorization: 'SKIPPED',
        integrityValid: replayResult.status === 'REPLAYED',
        integrityReasons: replayResult.mismatches.map((m) => m.message),
        fees: 0,
        tax: 0,
        slippage: 0,
        finalOrderStatus: execution?.status || 'REJECTED',
        errors: replayResult.error ? [replayResult.error] : [],
        marketDataSnapshotId: snapshot.snapshotId,
        recommendationId: orderIntent.recommendationId,
        strategyVersion: orderIntent.strategyVersion,
        riskPolicyVersion: orderIntent.riskPolicyVersion,
      };

      return {
        nextAccount: currentAccount,
        auditEntry,
      };
    }

    // 2. Order is FILLED -> Perform canonical financial state update
    const executedQty = execution.executedQuantity;
    const executedPrice = execution.executedPrice ?? snapshot.quote.last;
    const fee = execution.fee ?? 0;
    const tax = execution.tax ?? 0;
    const slippage = execution.slippage ?? 0;
    const grossValue = executedQty * executedPrice;

    let nextCash = cashBefore;
    let positionAfter = positionBefore;
    let realizedPnLDelta = 0;

    const nextPositions: BrokerPosition[] = currentAccount.positions
      .filter((p) => p.symbol !== symbol)
      .map((p) => ({ ...p }));

    if (execution.side === 'BUY') {
      const totalCost = grossValue + fee;
      nextCash = cashBefore - totalCost;
      positionAfter = positionBefore + executedQty;

      const oldCostBasis = existingPos ? existingPos.quantity * existingPos.averageCost : 0;
      const newAverageCost = (oldCostBasis + totalCost) / positionAfter;

      const posUnrealizedPnL = (executedPrice - newAverageCost) * positionAfter;
      const posUnrealizedPnLPct = newAverageCost > 0 ? ((executedPrice - newAverageCost) / newAverageCost) * 100 : 0;

      nextPositions.push({
        symbol,
        quantity: positionAfter,
        reservedQuantity: 0,
        availableQuantity: positionAfter,
        averageCost: newAverageCost,
        currentPrice: executedPrice,
        marketValue: positionAfter * executedPrice,
        unrealizedPnL: posUnrealizedPnL,
        unrealizedPnLPercent: posUnrealizedPnLPct,
        updatedAt: isoTimestamp,
      });
    } else {
      // SELL
      const netProceeds = grossValue - fee - tax;
      nextCash = cashBefore + netProceeds;
      positionAfter = Math.max(0, positionBefore - executedQty);

      if (existingPos) {
        const costBasisOfSold = executedQty * existingPos.averageCost;
        realizedPnLDelta = netProceeds - costBasisOfSold;

        if (positionAfter > 0) {
          const posUnrealizedPnL = (executedPrice - existingPos.averageCost) * positionAfter;
          const posUnrealizedPnLPct = existingPos.averageCost > 0 ? ((executedPrice - existingPos.averageCost) / existingPos.averageCost) * 100 : 0;

          nextPositions.push({
            ...existingPos,
            quantity: positionAfter,
            reservedQuantity: 0,
            availableQuantity: positionAfter,
            currentPrice: executedPrice,
            marketValue: positionAfter * executedPrice,
            unrealizedPnL: posUnrealizedPnL,
            unrealizedPnLPercent: posUnrealizedPnLPct,
            updatedAt: isoTimestamp,
          });
        }
      }
    }

    // Recompute aggregate portfolio metrics
    const nextMarketValue = nextPositions.reduce((acc, p) => acc + p.quantity * p.currentPrice, 0);
    const nextUnrealizedPnL = nextPositions.reduce((acc, p) => acc + (p.unrealizedPnL ?? 0), 0);
    const nextEquity = nextCash + nextMarketValue;
    const nextRealizedPnL = (currentAccount.realizedPnL ?? 0) + realizedPnLDelta;

    const nextAccount: BrokerAccount = {
      ...currentAccount,
      cash: nextCash,
      reservedCash: 0,
      availableCash: nextCash,
      marketValue: nextMarketValue,
      equity: nextEquity,
      realizedPnL: nextRealizedPnL,
      unrealizedPnL: nextUnrealizedPnL,
      positions: nextPositions,
      updatedAt: isoTimestamp,
    };

    const auditEntry: PaperAuditEntry = {
      auditId: `AUDIT_PBT_${stepIndex}_${snapshot.snapshotId.slice(0, 8)}`,
      orderId: execution.orderId || `ORDER_${stepIndex}`,
      timestamp: isoTimestamp,
      symbol,
      side: execution.side,
      orderType: orderIntent.orderType || 'MARKET',
      requestedPrice: execution.requestedPrice,
      executedPrice,
      requestedQuantity: execution.requestedQuantity,
      executedQuantity: executedQty,
      stopLoss: orderIntent.stopLoss || null,
      targetPrice: orderIntent.targetPrice || null,
      riskAmount: null,
      portfolioExposureBefore: currentAccount.marketValue,
      portfolioExposureAfter: nextMarketValue,
      cashBefore,
      cashAfter: nextCash,
      positionBefore,
      positionAfter,
      validatorStatus: 'VALID',
      validatorCode: 'OK',
      riskGuardStatus: 'APPROVED' as any,
      riskGuardAuthorization: 'AUTHORIZED_FOR_PAPER_TRADING' as any,
      integrityValid: true,
      integrityReasons: [],
      fees: fee,
      tax,
      slippage,
      realizedPnL: realizedPnLDelta,
      finalOrderStatus: 'FILLED',
      errors: [],
      marketDataSnapshotId: snapshot.snapshotId,
      recommendationId: orderIntent.recommendationId,
      strategyVersion: orderIntent.strategyVersion,
      riskPolicyVersion: orderIntent.riskPolicyVersion,
    };

    return {
      nextAccount,
      auditEntry,
    };
  }
}
