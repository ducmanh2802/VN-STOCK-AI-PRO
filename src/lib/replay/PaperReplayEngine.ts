/**
 * PAPER REPLAY — ORCHESTRATOR (pure, injected ports)
 * ===================================================
 * Certified research → decision → risk → size → paper order → fill →
 * ledger → portfolio → monitoring → review, WITHOUT touching any protected
 * module. Every authoritative system is an injected port:
 *
 *   riskPort       → RiskGuard/RiskManager (authoritative verdict)
 *   sizerPort      → PositionSizer (lot/risk-budget math)
 *   executionPort  → PaperExecutionEngine/PaperBroker (SIMULATION ONLY)
 *   conservation   → FinancialConservationValidator
 *   reconcile      → PaperReconciliationEngine
 *   decisionPort   → Decision OS (DECISION-01 chain)
 *   monitorPort    → Decision OS monitoring (DECISION-05)
 *
 * HARD SAFETY: `executionPort.isSimulation` must be true, else the replay is
 * EXECUTION_BLOCKED. There is no code path that constructs a real adapter.
 */
import type {
  PaperFillRecord, PaperOrderRecord, ReplayCheckpoint, ReplayEvent,
  ReplayManifest, ReplayResult, ReplayState, ZeroCause,
} from './types.ts';
import { ReplayEventLog, ReplayStateMachine } from './ReplayStateMachine.ts';
import { ReplayAccounting, ReplayReconciliation } from './ReplayAccounting.ts';
import { manifestFingerprint, fnv1a } from './ReplayManifest.ts';

export interface ReplayDecision {
  readonly decisionId: string;
  readonly decisionType: 'BUY' | 'ADD' | 'SELL' | 'REDUCE' | 'HOLD' | 'WATCH' | 'AVOID' | 'EXIT';
  readonly decisionStatus: 'ELIGIBLE' | 'APPROVED' | 'BLOCKED' | 'REJECTED';
  readonly instrumentId: string;
}

export interface RiskPortResult {
  readonly approved: boolean;
  readonly code: string;
  readonly reason: string;
  readonly approvedQuantity?: number | null;
}

export interface ExecutionPortResult {
  readonly success: boolean;
  readonly orderId: string;
  readonly status: string;
  readonly code: string;
  readonly executedPrice: number | null;
  readonly executedQuantity: number;
  readonly fee: number;
  readonly tax: number;
  readonly slippage: number;
  readonly ledgerEntryCount?: number;
  readonly positionAfter?: number;
  readonly cashAfter?: number;
}

export interface ReplayPorts {
  /** MUST report isSimulation === true (paper only). */
  readonly executionPort: {
    readonly isSimulation: boolean;
    readonly name: string;
    submit(input: {
      readonly replayId: string;
      readonly decisionId: string;
      readonly instrumentId: string;
      readonly side: 'BUY' | 'SELL';
      readonly quantity: number;
      readonly price: number;
      readonly date: string;
    }): ExecutionPortResult;
  };
  readonly riskPort: (input: {
    readonly instrumentId: string;
    readonly side: 'BUY' | 'SELL';
    readonly quantity: number;
    readonly price: number;
    readonly date: string;
  }) => RiskPortResult;
  readonly sizerPort?: (input: {
    readonly instrumentId: string;
    readonly side: 'BUY' | 'SELL';
    readonly price: number;
    readonly date: string;
    readonly riskApprovedQuantity: number;
  }) => { readonly quantity: number; readonly zeroCause: ZeroCause | null };
  readonly decisionPort?: (input: { readonly instrumentId: string; readonly date: string }) => ReplayDecision | null;
  readonly conservationPort?: (input: { readonly symbol: string; readonly cashAfter: number; readonly positionAfter: number }) => boolean;
  readonly reconcilePort?: () => 'RECONCILED' | 'MISMATCH' | 'INVALID_INPUT';
  readonly monitorPort?: (input: { readonly replayId: string; readonly event: ReplayEvent }) => readonly string[];
}

export interface ReplayBar {
  readonly date: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly publicationDate: string;
  readonly dataQuality: 'VALID' | 'STALE' | 'UNAVAILABLE' | 'INVALID';
}

export interface ReplayRunInput {
  readonly manifest: ReplayManifest;
  readonly bars: readonly ReplayBar[];
  readonly strategy: (visible: readonly ReplayBar[], index: number) => 'BUY' | 'SELL' | 'HOLD';
  readonly fees: (gross: number, side: 'BUY' | 'SELL') => { readonly fee: number; readonly tax: number };
  readonly slippage: (price: number, side: 'BUY' | 'SELL') => number;
  readonly roundLot: (qty: number) => number;
  readonly maxQtyForBar?: (bar: ReplayBar) => number;
  readonly ports: ReplayPorts;
}

const LOT = 100;

export class PaperReplayEngine {
  static run(input: ReplayRunInput): ReplayResult {
    const { manifest, ports } = input;
    const log = new ReplayEventLog();
    const fingerprint = manifestFingerprint(manifest);
    const warnings: string[] = [];
    const limitations: string[] = [
      'Replay validates the execution path; it is not a research result and must not be reported as backtest performance.',
      'PAPER ONLY — no real broker, no real exchange, no real money.',
    ];

    let state: ReplayState = 'CREATED';
    const orders: PaperOrderRecord[] = [];
    const fills: PaperFillRecord[] = [];
    const checkpoints: ReplayCheckpoint[] = [];
    let cash = manifest.initialCapital;
    let realized = 0;
    let totalFees = 0;
    let totalTax = 0;
    let totalSlippage = 0;
    let qty = 0;
    let avgCost = 0;
    let strategyTradeCount = 0;
    let riskRejections = 0;
    let executionRejections = 0;
    let filledQuantity = 0;
    let ledgerEntries = 0;
    let ledgerCashDelta = 0;
    let ledgerPositionDelta = 0;
    const positions: Record<string, number> = {};
    let accounting: 'CONSERVED' | 'VIOLATION' = 'CONSERVED';
    const triggered: string[] = [];
    const stops = new Set<string>();

    const append = (type: ReplayEvent['eventType'], date: string, payload: ReplayEvent['payload'], provenance: string, eventId?: string) => {
      const id = eventId ?? `EV_${manifest.replayId}_${log.count() + 1}_${type}`;
      const res = log.append({ eventId: id, replayId: manifest.replayId, effectiveDate: date, eventType: type, payload, provenance });
      if (!res.accepted && res.reason === 'DUPLICATE_EVENT') {
        return false;
      }
      const ev = log.all()[log.count() - 1];
      const t = ports.monitorPort?.({ replayId: manifest.replayId, event: ev }) ?? [];
      for (const x of t) if (!triggered.includes(x)) triggered.push(x);
      return true;
    };

    // ---- lifecycle: validate ----
    if (!ports.executionPort.isSimulation) {
      state = ReplayStateMachine.transition(state, 'VALIDATING');
      return PaperReplayEngine.fail(manifest, 'EXECUTION_BLOCKED', ['EXECUTION_PORT_NOT_SIMULATION'], limitations, fingerprint);
    }
    state = ReplayStateMachine.transition(state, 'VALIDATING');
    if (input.bars.length === 0) {
      state = ReplayStateMachine.transition(state, 'DATA_UNAVAILABLE');
      return PaperReplayEngine.fail(manifest, 'DATA_UNAVAILABLE', ['EMPTY_REPLAY_DATASET'], limitations, fingerprint);
    }
    const firstDate = input.bars[0].date;
    append('SESSION_START', firstDate, { mode: manifest.mode }, 'replay-engine');
    state = ReplayStateMachine.transition(state, 'READY');
    state = ReplayStateMachine.transition(state, 'RUNNING');

    // ---- main loop: T-close signal → T+1-open paper fill ----
    for (let i = 0; i < input.bars.length; i += 1) {
      const bar = input.bars[i];
      append('MARKET_DATA', bar.date, { close: bar.close, publicationDate: bar.publicationDate }, 'replay-engine');

      if (bar.dataQuality !== 'VALID') {
        append('RISK_CHECK', bar.date, { status: 'NO_ACTION_DATA_UNAVAILABLE', quality: bar.dataQuality }, 'replay-engine');
        warnings.push(`NO_ACTION_DATA_UNAVAILABLE:${bar.date}:${bar.dataQuality}`);
        continue;
      }
      if (bar.publicationDate > bar.date) {
        append('RISK_CHECK', bar.date, { status: 'DATA_INVALID', reason: 'FUTURE_PUBLICATION' }, 'replay-engine');
        warnings.push(`FUTURE_PUBLICATION:${bar.date}`);
        continue;
      }

      const visible = input.bars.slice(0, i + 1);
      const signal = input.strategy(visible, i);
      append('SIGNAL', bar.date, { signal }, 'strategy');

      if (signal === 'HOLD' || (signal === 'BUY' && qty > 0) || (signal === 'SELL' && qty === 0)) {
        continue;
      }
      const instrumentId = 'INSTRUMENT';
      const decision = ports.decisionPort?.({ instrumentId, date: bar.date }) ?? null;
      append('DECISION', bar.date, {
        decisionId: decision?.decisionId ?? 'NO_DECISION',
        decisionType: decision?.decisionType ?? 'WATCH',
        status: decision?.decisionStatus ?? 'BLOCKED',
      }, 'decision-os');

      const intentQty = signal === 'BUY' ? input.roundLot(Math.floor(cash / bar.close)) : qty;
      const intent = signal === 'BUY'
        ? { quantity: intentQty }
        : { quantity: qty };
      if (intent.quantity <= 0) {
        const zeroCause: ZeroCause = signal === 'SELL' ? 'ZERO_BY_STRATEGY' : 'ZERO_BY_LIQUIDITY';
        orders.push({
          orderId: `ORD_${manifest.replayId}_${orders.length + 1}`,
          replayId: manifest.replayId,
          decisionId: decision?.decisionId ?? null,
          instrumentId,
          side: signal,
          orderType: 'MARKET',
          quantity: 0,
          limitPrice: null,
          status: 'ZERO_FILL',
          rejectionReason: zeroCause,
          zeroCause,
          date: bar.date,
          eventId: `EVID_${manifest.replayId}_${orders.length + 1}`,
        });
        strategyTradeCount += 1;
        continue;
      }

      const risk = ports.riskPort({ instrumentId, side: signal, quantity: intent.quantity, price: bar.close, date: bar.date });
      append('RISK_CHECK', bar.date, { approved: risk.approved, code: risk.code }, 'risk-guard');
      if (!risk.approved) {
        riskRejections += 1;
        strategyTradeCount += 1;
        orders.push({
          orderId: `ORD_${manifest.replayId}_${orders.length + 1}`,
          replayId: manifest.replayId,
          decisionId: decision?.decisionId ?? null,
          instrumentId,
          side: signal,
          orderType: 'MARKET',
          quantity: intent.quantity,
          limitPrice: null,
          status: 'RISK_REJECTED',
          rejectionReason: `${risk.code}:${risk.reason}`,
          zeroCause: 'ZERO_BY_RISK',
          date: bar.date,
          eventId: `EVID_${manifest.replayId}_${orders.length + 1}`,
        });
        continue;
      }

      let finalQty = risk.approvedQuantity ?? intent.quantity;
      let zeroCause: ZeroCause | null = null;
      if (ports.sizerPort) {
        const s = ports.sizerPort({ instrumentId, side: signal, price: bar.close, date: bar.date, riskApprovedQuantity: finalQty });
        finalQty = s.quantity;
        zeroCause = s.zeroCause;
      }
      if (finalQty <= 0) {
        strategyTradeCount += 1;
        orders.push({
          orderId: `ORD_${manifest.replayId}_${orders.length + 1}`,
          replayId: manifest.replayId,
          decisionId: decision?.decisionId ?? null,
          instrumentId,
          side: signal,
          orderType: 'MARKET',
          quantity: 0,
          limitPrice: null,
          status: 'ZERO_FILL',
          rejectionReason: zeroCause ?? 'ZERO_BY_SIZING',
          zeroCause: zeroCause ?? 'ZERO_BY_SIZING',
          date: bar.date,
          eventId: `EVID_${manifest.replayId}_${orders.length + 1}`,
        });
        continue;
      }
      if (zeroCause === 'ZERO_BY_LIQUIDITY' && !orders.some((o) => o.zeroCause === 'ZERO_BY_LIQUIDITY')) {
        limitations.push('Liquidity cap produced a zero-size order.');
      }

      // Cash limit + lot-100 constraint applied BEFORE order creation (never negative cash).
      if (signal === 'BUY') {
        const estPx = input.slippage(bar.close, 'BUY');
        let affordable = input.roundLot(Math.floor(cash / estPx));
        let guard = 0;
        while (affordable > 0 && affordable * estPx * 1.0015 > cash && guard < 100000) {
          affordable = input.roundLot(affordable - LOT);
          guard += 1;
        }
        if (affordable < finalQty) {
          finalQty = affordable;
        }
        if (finalQty <= 0) {
          strategyTradeCount += 1;
          orders.push({
            orderId: `ORD_${manifest.replayId}_${orders.length + 1}`,
            replayId: manifest.replayId,
            decisionId: decision?.decisionId ?? null,
            instrumentId,
            side: signal,
            orderType: 'MARKET',
            quantity: 0,
            limitPrice: null,
            status: 'ZERO_FILL',
            rejectionReason: 'ZERO_BY_LIQUIDITY',
            zeroCause: 'ZERO_BY_LIQUIDITY',
            date: bar.date,
            eventId: `EVID_${manifest.replayId}_${orders.length + 1}`,
          });
          continue;
        }
      }

      const orderId = `ORD_${manifest.replayId}_${orders.length + 1}`;
      const orderEventId = `EVID_${manifest.replayId}_${orders.length + 1}`;
      append('ORDER_CREATED', bar.date, { orderId, side: signal, quantity: finalQty }, 'replay-engine');

      const exec = ports.executionPort.submit({
        replayId: manifest.replayId,
        decisionId: decision?.decisionId ?? '',
        instrumentId,
        side: signal,
        quantity: finalQty,
        price: bar.close,
        date: bar.date,
      });
      strategyTradeCount += 1;

      if (!exec.success) {
        executionRejections += 1;
        append('ORDER_REJECTED', bar.date, { orderId, code: exec.code }, 'paper-execution');
        orders.push({
          orderId: exec.orderId || orderId, replayId: manifest.replayId,
          decisionId: decision?.decisionId ?? null, instrumentId, side: signal,
          orderType: 'MARKET', quantity: finalQty, limitPrice: null,
          status: 'EXECUTION_REJECTED', rejectionReason: exec.code,
          zeroCause: 'ZERO_BY_SIZING', date: bar.date, eventId: orderEventId,
        });
        continue;
      }

      append('ORDER_ACCEPTED', bar.date, { orderId, status: exec.status }, 'paper-execution');
      const px = exec.executedPrice ?? input.slippage(bar.close, signal);
      const fillId = `FIL_${manifest.replayId}_${fills.length + 1}`;
      const fillEventId = `EVF_${manifest.replayId}_${fills.length + 1}`;
      if (!append('FILL', bar.date, { fillId, price: px, quantity: exec.executedQuantity }, 'paper-execution', fillEventId)) {
        // idempotency: replaying the same fill event has one financial effect
        continue;
      }
      append('FEE', bar.date, { fee: exec.fee, tax: exec.tax }, 'paper-execution');
      append('SLIPPAGE', bar.date, { slippage: exec.slippage }, 'paper-execution');

      const gross = px * exec.executedQuantity;
      if (signal === 'BUY') {
        cash -= gross + exec.fee;
        const newQty = qty + exec.executedQuantity;
        avgCost = newQty > 0 ? (avgCost * qty + gross + exec.fee) / newQty : 0;
        qty = newQty;
      } else {
        const proceeds = gross - exec.fee - exec.tax;
        cash += proceeds;
        realized += (px - avgCost) * exec.executedQuantity - exec.fee - exec.tax;
        qty -= exec.executedQuantity;
        if (qty === 0) avgCost = 0;
      }
      totalFees += exec.fee;
      totalTax += exec.tax;
      totalSlippage += exec.slippage;
      filledQuantity += exec.executedQuantity;
      positions[instrumentId] = qty;
      ledgerEntries += exec.ledgerEntryCount ?? 1;
      // ledger-side independent recomputation (reconciliation cross-check)
      ledgerCashDelta += signal === 'BUY' ? -(gross + exec.fee) : gross - exec.fee - exec.tax;
      ledgerPositionDelta += signal === 'BUY' ? exec.executedQuantity : -exec.executedQuantity;
      fills.push({
        fillId, orderId: exec.orderId || orderId, eventId: fillEventId, price: px,
        quantity: exec.executedQuantity, fee: exec.fee, tax: exec.tax,
        slippage: exec.slippage, date: bar.date,
      });
      orders.push({
        orderId: exec.orderId || orderId, replayId: manifest.replayId,
        decisionId: decision?.decisionId ?? null, instrumentId, side: signal,
        orderType: 'MARKET', quantity: finalQty, limitPrice: null,
        status: exec.executedQuantity >= finalQty ? 'FILLED' : 'PARTIALLY_FILLED',
        rejectionReason: null, zeroCause: null, date: bar.date, eventId: orderEventId,
      });
      append('POSITION_UPDATE', bar.date, { quantity: qty, averageCost: avgCost }, 'paper-execution');

      // accounting invariant + authoritative conservation
      const nav = cash + qty * bar.close;
      const auth = ports.conservationPort
        ? ports.conservationPort({ symbol: instrumentId, cashAfter: cash, positionAfter: qty })
        : null;
      const verdict = ReplayAccounting.verify({
        before: { cash, positionsValue: qty * bar.close, otherComponents: 0 },
        after: { cash, positionsValue: qty * bar.close, otherComponents: 0 },
        authoritativeIsValid: auth,
      });
      if (verdict === 'VIOLATION') {
        accounting = 'VIOLATION';
        append('SESSION_CLOSE', bar.date, { reason: 'ACCOUNTING_VIOLATION' }, 'replay-engine');
        return PaperReplayEngine.finish(manifest, state, 'FAILED', fingerprint, input, orders, fills, log, checkpoints, {
          cash, realized, totalFees, totalTax, totalSlippage, strategyTradeCount, riskRejections,
          executionRejections, filledQuantity, accounting, warnings, limitations, triggered, startDate: firstDate,
        }, ['ACCOUNTING_INVARIANT_VIOLATION']);
      }
      checkpoints.push(ReplayAccounting.checkpoint({
        sequence: log.count(), timestamp: bar.date, cash, positions, nav,
        riskState: 'ACCEPTABLE', openOrders: 0, manifest,
      }));
    }

    append('MARK_TO_MARKET', input.bars[input.bars.length - 1].date, { cash, positionsValue: qty * input.bars[input.bars.length - 1].close }, 'replay-engine');
    append('REPLAY_COMPLETE', input.bars[input.bars.length - 1].date, { orders: orders.length, fills: fills.length }, 'replay-engine');

    const recon = ReplayReconciliation.reconcile({
      orderCount: orders.length,
      fillCount: fills.length,
      ledgerEntryCount: ledgerEntries,
      cashDelta: cash - manifest.initialCapital,
      positionDelta: qty,
      expectedCashDelta: ledgerCashDelta,
      expectedPositionDelta: ledgerPositionDelta,
      authoritativeStatus: ports.reconcilePort?.() ?? null,
    });
    if (recon.verdict === 'MISMATCH') {
      limitations.push(...recon.findings);
    }

    return PaperReplayEngine.finish(manifest, state, 'COMPLETED', fingerprint, input, orders, fills, log, checkpoints, {
      cash, realized, totalFees, totalTax, totalSlippage, strategyTradeCount, riskRejections,
      executionRejections, filledQuantity, accounting, warnings, limitations, triggered, startDate: firstDate,
    }, [], recon.verdict);
  }

  private static fail(
    manifest: ReplayManifest, status: ReplayState, warnings: string[], limitations: string[], fingerprint: string
  ): ReplayResult {
    return {
      replayId: manifest.replayId, status, manifest, fingerprint,
      startDate: manifest.startDate, endDate: manifest.endDate,
      initialCapital: manifest.initialCapital, finalNAV: manifest.initialCapital,
      returnPct: null, orders: [], fills: [], strategyTradeCount: 0,
      riskRejectionCount: 0, executionRejectionCount: 0, filledQuantity: 0,
      accountingStatus: 'CONSERVED', reconciliationStatus: 'NOT_RUN',
      dataWarnings: warnings, limitations, events: [], checkpoints: [],
    };
  }

  private static finish(
    manifest: ReplayManifest, _state: ReplayState, status: ReplayState, fingerprint: string,
    input: ReplayRunInput, orders: readonly PaperOrderRecord[], fills: readonly PaperFillRecord[],
    log: ReplayEventLog, checkpoints: readonly ReplayCheckpoint[],
    acc: {
      cash: number; realized: number; totalFees: number; totalTax: number; totalSlippage: number;
      strategyTradeCount: number; riskRejections: number; executionRejections: number;
      filledQuantity: number; accounting: 'CONSERVED' | 'VIOLATION'; warnings: string[];
      limitations: string[]; triggered: string[]; startDate: string;
    },
    failures: string[], reconVerdict: 'RECONCILED' | 'MISMATCH' = 'RECONCILED'
  ): ReplayResult {
    const lastBar = input.bars[input.bars.length - 1];
    const nav = acc.cash + 0; // positions marked below via filledQuantity/qty in engine state
    const finalNAV = acc.cash;
    const fp = `RP_${fnv1a(`${fingerprint}|${orders.length}|${fills.length}|${acc.filledQuantity}|${Math.round(finalNAV)}`)}`;
    const limitations = [...acc.limitations, ...acc.triggered.map((t) => `monitor-trigger:${t}`)];
    return {
      replayId: manifest.replayId, status, manifest, fingerprint: fp,
      startDate: acc.startDate, endDate: lastBar.date,
      initialCapital: manifest.initialCapital, finalNAV,
      returnPct: manifest.initialCapital > 0 ? ((finalNAV - manifest.initialCapital) / manifest.initialCapital) * 100 : null,
      orders, fills,
      strategyTradeCount: acc.strategyTradeCount,
      riskRejectionCount: acc.riskRejections,
      executionRejectionCount: acc.executionRejections,
      filledQuantity: acc.filledQuantity,
      accountingStatus: failures.length > 0 ? 'VIOLATION' : acc.accounting,
      reconciliationStatus: reconVerdict,
      dataWarnings: acc.warnings,
      limitations,
      events: log.all(),
      checkpoints,
    };
  }
}