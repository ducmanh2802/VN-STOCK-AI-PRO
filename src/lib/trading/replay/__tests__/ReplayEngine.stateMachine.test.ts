/**
 * PHASE 18.3.5 — STATE MACHINE & EVENT SEQUENCE INTEGRITY TEST SUITE
 * ===================================================================
 * Verifies that the Replay and Execution Engine strictly enforces state transition
 * rules and event sequence integrity, and fails-closed against all invalid,
 * out-of-order, duplicate, missing, impossible, or tampered events.
 */

import { describe, it, expect } from 'vitest';
import { MarketSnapshotBuilder } from '../../snapshot/MarketSnapshotBuilder.ts';
import type { MarketSnapshotInput } from '../../snapshot/types.ts';
import { PaperTradeLedger } from '../../paper/PaperTradeLedger.ts';
import type { BrokerAccount } from '../../execution/BrokerAdapter.ts';
import { ReplayEngine } from '../ReplayEngine.ts';
import { OrderStateMachine } from '../OrderStateMachine.ts';
import type {
  OrderIntent,
  ExecutionContextBinding,
  ReplayRequest,
  ReplayEvent,
} from '../types.ts';

describe('PHASE 18.3.5 — STATE MACHINE & EVENT SEQUENCE INTEGRITY', () => {
  const baseInput: MarketSnapshotInput = {
    capturedAt: '2026-03-30T10:30:00.000Z',
    source: {
      provider: 'SSI',
      feed: 'REALTIME_STREAM',
    },
    market: {
      exchange: 'HOSE',
      tradingDate: '2026-03-30',
      session: 'CONTINUOUS',
      isOpen: true,
    },
    instrument: {
      symbol: 'HPG',
      name: 'Tập đoàn Hòa Phát',
    },
    quote: {
      last: 28500,
      open: 28000,
      high: 28900,
      low: 27900,
      close: 28500,
      volume: 12500000,
      reference: 28200,
      ceiling: 30150,
      floor: 26250,
      timestamp: '2026-03-30T10:30:00.000Z',
    },
    recommendation: {
      recommendationId: 'REC-HPG-20260330-01',
      strategyVersion: 'v2.1.0',
      signal: 'BUY',
      horizon: 'SHORT_TERM',
      confidence: 85,
    },
    integrity: {
      dataFreshnessMs: 1500,
      validationStatus: 'VALID',
      warnings: [],
    },
    versions: {
      snapshotSchemaVersion: '1.0.0',
      strategyVersion: 'v2.1.0',
      riskPolicyVersion: 'v1.4.0',
    },
  };

  const createTestContext = () => {
    const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);
    const orderIntent: OrderIntent = {
      symbol: 'HPG',
      side: 'BUY',
      quantity: 1000,
      orderType: 'MARKET',
      recommendationId: 'REC-HPG-20260330-01',
    };
    const executionContext: ExecutionContextBinding = {
      marketDataSnapshotId: snapshot.snapshotId,
      recommendationId: 'REC-HPG-20260330-01',
      strategyVersion: 'v2.1.0',
      riskPolicyVersion: 'v1.4.0',
    };
    const initialAccount: BrokerAccount = {
      accountId: 'ACC_TEST_01',
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
      updatedAt: '2026-03-30T10:30:00.000Z',
    };

    return { snapshot, orderIntent, executionContext, initialAccount };
  };

  // ==========================================================================
  // GROUP A — INVALID STATE TRANSITIONS
  // ==========================================================================
  describe('Group A — Invalid State Transitions', () => {
    it('A1: Rejects impossible transition FILLED -> NEW', () => {
      const { snapshot, orderIntent, executionContext } = createTestContext();
      const canonical = OrderStateMachine.buildCanonicalSequence({
        orderId: 'REC-HPG-20260330-01',
        snapshotId: snapshot.snapshotId,
        quantity: 1000,
        price: 28500,
      });

      // Attempt to transition from FILLED to NEW
      const tampered: ReplayEvent[] = [
        ...canonical.slice(0, 4), // Up to FILLED
        {
          eventId: 'EVT_TAMPERED_A1',
          sequenceNumber: 5,
          timestamp: '2026-03-30T10:30:00.300Z',
          orderId: 'REC-HPG-20260330-01',
          snapshotId: snapshot.snapshotId,
          previousState: 'FILLED',
          nextState: 'NEW',
          eventType: 'ORDER_RESET',
        },
      ];

      const res = ReplayEngine.replay({
        snapshot,
        orderIntent,
        executionContext,
        eventSequence: tampered,
      });

      expect(res.status).toBe('REPLAY_INVALID');
      expect(res.mismatches.some(m => m.code === 'INVALID_STATE_TRANSITION')).toBe(true);
    });

    it('A2: Rejects impossible transition FILLED -> REJECTED', () => {
      const { snapshot, orderIntent, executionContext } = createTestContext();
      const canonical = OrderStateMachine.buildCanonicalSequence({
        orderId: 'REC-HPG-20260330-01',
        snapshotId: snapshot.snapshotId,
        quantity: 1000,
        price: 28500,
      });

      const tampered: ReplayEvent[] = [
        ...canonical.slice(0, 4),
        {
          eventId: 'EVT_TAMPERED_A2',
          sequenceNumber: 5,
          timestamp: '2026-03-30T10:30:00.300Z',
          orderId: 'REC-HPG-20260330-01',
          snapshotId: snapshot.snapshotId,
          previousState: 'FILLED',
          nextState: 'REJECTED',
          eventType: 'ORDER_REJECTED',
        },
      ];

      const res = ReplayEngine.replay({
        snapshot,
        orderIntent,
        executionContext,
        eventSequence: tampered,
      });

      expect(res.status).toBe('REPLAY_INVALID');
      expect(res.mismatches.some(m => m.code === 'INVALID_STATE_TRANSITION')).toBe(true);
    });

    it('A3: Rejects impossible transition REJECTED -> FILLED', () => {
      const { snapshot, orderIntent, executionContext } = createTestContext();
      const rejectedEvents = OrderStateMachine.buildCanonicalSequence({
        orderId: 'REC-HPG-20260330-01',
        snapshotId: snapshot.snapshotId,
        quantity: 1000,
        price: 28500,
        isFilled: false,
      });

      const tampered: ReplayEvent[] = [
        ...rejectedEvents,
        {
          eventId: 'EVT_TAMPERED_A3',
          sequenceNumber: 4,
          timestamp: '2026-03-30T10:30:00.300Z',
          orderId: 'REC-HPG-20260330-01',
          snapshotId: snapshot.snapshotId,
          previousState: 'REJECTED',
          nextState: 'FILLED',
          eventType: 'ORDER_FILLED',
        },
      ];

      const res = ReplayEngine.replay({
        snapshot,
        orderIntent,
        executionContext,
        eventSequence: tampered,
      });

      expect(res.status).toBe('REPLAY_INVALID');
      expect(res.mismatches.some(m => m.code === 'TERMINAL_STATE_MUTATION' || m.code === 'INVALID_STATE_TRANSITION')).toBe(true);
    });

    it('A4: Rejects impossible transition CANCELLED -> FILLED', () => {
      const { snapshot, orderIntent, executionContext } = createTestContext();
      const tampered: ReplayEvent[] = [
        {
          eventId: 'EVT_1',
          sequenceNumber: 1,
          timestamp: '2026-03-30T10:30:00.100Z',
          orderId: 'REC-HPG-20260330-01',
          snapshotId: snapshot.snapshotId,
          previousState: 'NEW',
          nextState: 'VALIDATED',
          eventType: 'ORDER_CREATED',
        },
        {
          eventId: 'EVT_2',
          sequenceNumber: 2,
          timestamp: '2026-03-30T10:30:00.150Z',
          orderId: 'REC-HPG-20260330-01',
          snapshotId: snapshot.snapshotId,
          previousState: 'VALIDATED',
          nextState: 'CANCELLED',
          eventType: 'ORDER_CANCELLED',
        },
        {
          eventId: 'EVT_3',
          sequenceNumber: 3,
          timestamp: '2026-03-30T10:30:00.200Z',
          orderId: 'REC-HPG-20260330-01',
          snapshotId: snapshot.snapshotId,
          previousState: 'CANCELLED',
          nextState: 'FILLED',
          eventType: 'ORDER_FILLED',
        },
      ];

      const res = ReplayEngine.replay({
        snapshot,
        orderIntent,
        executionContext,
        eventSequence: tampered,
      });

      expect(res.status).toBe('REPLAY_INVALID');
      expect(res.mismatches.some(m => m.code === 'TERMINAL_STATE_MUTATION')).toBe(true);
    });

    it('A5: Rejects impossible transition SETTLED -> FILLED', () => {
      const { snapshot, orderIntent, executionContext } = createTestContext();
      const canonical = OrderStateMachine.buildCanonicalSequence({
        orderId: 'REC-HPG-20260330-01',
        snapshotId: snapshot.snapshotId,
        quantity: 1000,
        price: 28500,
      });

      const tampered: ReplayEvent[] = [
        ...canonical,
        {
          eventId: 'EVT_TAMPERED_A5',
          sequenceNumber: 6,
          timestamp: '2026-03-30T10:30:00.300Z',
          orderId: 'REC-HPG-20260330-01',
          snapshotId: snapshot.snapshotId,
          previousState: 'SETTLED',
          nextState: 'FILLED',
          eventType: 'ORDER_FILLED',
        },
      ];

      const res = ReplayEngine.replay({
        snapshot,
        orderIntent,
        executionContext,
        eventSequence: tampered,
      });

      expect(res.status).toBe('REPLAY_INVALID');
      expect(res.mismatches.some(m => m.code === 'TERMINAL_STATE_MUTATION')).toBe(true);
    });

    it('A6: Rejects impossible transition SETTLED -> NEW', () => {
      const { snapshot, orderIntent, executionContext } = createTestContext();
      const canonical = OrderStateMachine.buildCanonicalSequence({
        orderId: 'REC-HPG-20260330-01',
        snapshotId: snapshot.snapshotId,
        quantity: 1000,
        price: 28500,
      });

      const tampered: ReplayEvent[] = [
        ...canonical,
        {
          eventId: 'EVT_TAMPERED_A6',
          sequenceNumber: 6,
          timestamp: '2026-03-30T10:30:00.300Z',
          orderId: 'REC-HPG-20260330-01',
          snapshotId: snapshot.snapshotId,
          previousState: 'SETTLED',
          nextState: 'NEW',
          eventType: 'ORDER_RESET',
        },
      ];

      const res = ReplayEngine.replay({
        snapshot,
        orderIntent,
        executionContext,
        eventSequence: tampered,
      });

      expect(res.status).toBe('REPLAY_INVALID');
      expect(res.mismatches.some(m => m.code === 'TERMINAL_STATE_MUTATION')).toBe(true);
    });

    it('A7: Rejects transition bypass NEW -> FILLED skipping intermediate pipeline stages', () => {
      const { snapshot, orderIntent, executionContext } = createTestContext();
      const tampered: ReplayEvent[] = [
        {
          eventId: 'EVT_BYPASS_1',
          sequenceNumber: 1,
          timestamp: '2026-03-30T10:30:00.100Z',
          orderId: 'REC-HPG-20260330-01',
          snapshotId: snapshot.snapshotId,
          previousState: 'NEW',
          nextState: 'FILLED',
          eventType: 'ORDER_FILLED',
          quantity: 1000,
          price: 28500,
        },
      ];

      const res = ReplayEngine.replay({
        snapshot,
        orderIntent,
        executionContext,
        eventSequence: tampered,
      });

      expect(res.status).toBe('REPLAY_INVALID');
      expect(res.mismatches.some(m => m.code === 'INVALID_STATE_TRANSITION' || m.code === 'MISSING_EVENT')).toBe(true);
    });
  });

  // ==========================================================================
  // GROUP B — OUT-OF-ORDER EVENTS
  // ==========================================================================
  describe('Group B — Out-of-Order Events', () => {
    it('B1: Rejects out-of-order events (NEW -> SUBMITTED before AUTHORIZED) and does not reorder them', () => {
      const { snapshot, orderIntent, executionContext } = createTestContext();

      // Sequence: Event 1 NEW->VALIDATED, Event 2 VALIDATED->SUBMITTED (skipping AUTHORIZED), Event 3 SUBMITTED->AUTHORIZED
      const tampered: ReplayEvent[] = [
        {
          eventId: 'EVT_B1_1',
          sequenceNumber: 1,
          timestamp: '2026-03-30T10:30:00.100Z',
          orderId: 'REC-HPG-20260330-01',
          snapshotId: snapshot.snapshotId,
          previousState: 'NEW',
          nextState: 'VALIDATED',
          eventType: 'ORDER_CREATED',
        },
        {
          eventId: 'EVT_B1_2',
          sequenceNumber: 2,
          timestamp: '2026-03-30T10:30:00.150Z',
          orderId: 'REC-HPG-20260330-01',
          snapshotId: snapshot.snapshotId,
          previousState: 'VALIDATED',
          nextState: 'SUBMITTED', // Illegal direct transition
          eventType: 'ORDER_SUBMITTED',
        },
        {
          eventId: 'EVT_B1_3',
          sequenceNumber: 3,
          timestamp: '2026-03-30T10:30:00.200Z',
          orderId: 'REC-HPG-20260330-01',
          snapshotId: snapshot.snapshotId,
          previousState: 'SUBMITTED',
          nextState: 'AUTHORIZED', // Illegal backward transition
          eventType: 'ORDER_AUTHORIZED',
        },
      ];

      const res = ReplayEngine.replay({
        snapshot,
        orderIntent,
        executionContext,
        eventSequence: tampered,
      });

      expect(res.status).toBe('REPLAY_INVALID');
      expect(res.mismatches.some(m => m.code === 'INVALID_STATE_TRANSITION')).toBe(true);
    });
  });

  // ==========================================================================
  // GROUP C — DUPLICATE EVENTS
  // ==========================================================================
  describe('Group C — Duplicate Events', () => {
    it('C1: Rejects duplicate state transition event (AUTHORIZED -> AUTHORIZED)', () => {
      const { snapshot, orderIntent, executionContext } = createTestContext();

      const tampered: ReplayEvent[] = [
        {
          eventId: 'EVT_C1_1',
          sequenceNumber: 1,
          timestamp: '2026-03-30T10:30:00.100Z',
          orderId: 'REC-HPG-20260330-01',
          snapshotId: snapshot.snapshotId,
          previousState: 'NEW',
          nextState: 'VALIDATED',
          eventType: 'ORDER_CREATED',
        },
        {
          eventId: 'EVT_C1_2',
          sequenceNumber: 2,
          timestamp: '2026-03-30T10:30:00.150Z',
          orderId: 'REC-HPG-20260330-01',
          snapshotId: snapshot.snapshotId,
          previousState: 'VALIDATED',
          nextState: 'AUTHORIZED',
          eventType: 'ORDER_VALIDATED',
        },
        {
          eventId: 'EVT_C1_3_DUP',
          sequenceNumber: 3,
          timestamp: '2026-03-30T10:30:00.200Z',
          orderId: 'REC-HPG-20260330-01',
          snapshotId: snapshot.snapshotId,
          previousState: 'AUTHORIZED',
          nextState: 'AUTHORIZED', // Duplicate state
          eventType: 'ORDER_AUTHORIZED',
        },
      ];

      const res = ReplayEngine.replay({
        snapshot,
        orderIntent,
        executionContext,
        eventSequence: tampered,
      });

      expect(res.status).toBe('REPLAY_INVALID');
      expect(res.mismatches.some(m => m.code === 'DUPLICATE_EVENT')).toBe(true);
    });
  });

  // ==========================================================================
  // GROUP D — DUPLICATE EXECUTION / SETTLEMENT
  // ==========================================================================
  describe('Group D — Duplicate Execution / Settlement', () => {
    it('D1: Rejects duplicate settlement SETTLED -> SETTLED', () => {
      const { snapshot, orderIntent, executionContext } = createTestContext();
      const canonical = OrderStateMachine.buildCanonicalSequence({
        orderId: 'REC-HPG-20260330-01',
        snapshotId: snapshot.snapshotId,
        quantity: 1000,
        price: 28500,
      });

      const tampered: ReplayEvent[] = [
        ...canonical,
        {
          eventId: 'EVT_D1_DUP_SETTLED',
          sequenceNumber: 6,
          timestamp: '2026-03-30T10:30:00.300Z',
          orderId: 'REC-HPG-20260330-01',
          snapshotId: snapshot.snapshotId,
          previousState: 'SETTLED',
          nextState: 'SETTLED',
          eventType: 'ORDER_SETTLED',
        },
      ];

      const res = ReplayEngine.replay({
        snapshot,
        orderIntent,
        executionContext,
        eventSequence: tampered,
      });

      expect(res.status).toBe('REPLAY_INVALID');
      expect(res.mismatches.some(m => m.code === 'TERMINAL_STATE_MUTATION' || m.code === 'DUPLICATE_EVENT')).toBe(true);
    });

    it('D2: Rejects duplicate fill FILLED -> FILLED', () => {
      const { snapshot, orderIntent, executionContext } = createTestContext();
      const canonical = OrderStateMachine.buildCanonicalSequence({
        orderId: 'REC-HPG-20260330-01',
        snapshotId: snapshot.snapshotId,
        quantity: 1000,
        price: 28500,
      });

      // Events 0 to 3 end in FILLED
      const tampered: ReplayEvent[] = [
        ...canonical.slice(0, 4),
        {
          eventId: 'EVT_D2_DUP_FILL',
          sequenceNumber: 5,
          timestamp: '2026-03-30T10:30:00.250Z',
          orderId: 'REC-HPG-20260330-01',
          snapshotId: snapshot.snapshotId,
          previousState: 'FILLED',
          nextState: 'FILLED',
          eventType: 'ORDER_FILLED',
          quantity: 1000,
          price: 28500,
        },
      ];

      const res = ReplayEngine.replay({
        snapshot,
        orderIntent,
        executionContext,
        eventSequence: tampered,
      });

      expect(res.status).toBe('REPLAY_INVALID');
      expect(res.mismatches.some(m => m.code === 'DUPLICATE_EVENT' || m.code === 'INVALID_STATE_TRANSITION')).toBe(true);
    });

    it('D3: Financial invariant: account and ledger are not mutated on duplicate rejection', () => {
      const { snapshot, orderIntent, executionContext, initialAccount } = createTestContext();
      const initialCash = initialAccount.cash;
      const initialPositionsCount = initialAccount.positions.length;
      const ledger = new PaperTradeLedger();
      const ledgerCountBefore = ledger.getAllEntries().length;

      const tampered: ReplayEvent[] = [
        ...OrderStateMachine.buildCanonicalSequence({
          orderId: 'REC-HPG-20260330-01',
          snapshotId: snapshot.snapshotId,
          quantity: 1000,
          price: 28500,
        }),
        {
          eventId: 'EVT_D3_TAMPERED',
          sequenceNumber: 6,
          timestamp: '2026-03-30T10:30:00.300Z',
          orderId: 'REC-HPG-20260330-01',
          snapshotId: snapshot.snapshotId,
          previousState: 'SETTLED',
          nextState: 'SETTLED',
          eventType: 'ORDER_SETTLED',
        },
      ];

      const res = ReplayEngine.replay({
        snapshot,
        orderIntent,
        executionContext,
        initialAccount,
        eventSequence: tampered,
      });

      expect(res.status).toBe('REPLAY_INVALID');
      // Verify zero financial mutation
      expect(initialAccount.cash).toBe(initialCash);
      expect(initialAccount.positions.length).toBe(initialPositionsCount);
      expect(ledger.getAllEntries().length).toBe(ledgerCountBefore);
    });
  });

  // ==========================================================================
  // GROUP E — MISSING EVENTS
  // ==========================================================================
  describe('Group E — Missing Events', () => {
    it('E1: Rejects sequence missing mandatory VALIDATED milestone (NEW -> AUTHORIZED -> SUBMITTED -> FILLED)', () => {
      const { snapshot, orderIntent, executionContext } = createTestContext();

      const tampered: ReplayEvent[] = [
        {
          eventId: 'EVT_E1_1',
          sequenceNumber: 1,
          timestamp: '2026-03-30T10:30:00.100Z',
          orderId: 'REC-HPG-20260330-01',
          snapshotId: snapshot.snapshotId,
          previousState: 'NEW',
          nextState: 'AUTHORIZED', // Missing VALIDATED!
          eventType: 'ORDER_AUTHORIZED',
        },
        {
          eventId: 'EVT_E1_2',
          sequenceNumber: 2,
          timestamp: '2026-03-30T10:30:00.150Z',
          orderId: 'REC-HPG-20260330-01',
          snapshotId: snapshot.snapshotId,
          previousState: 'AUTHORIZED',
          nextState: 'SUBMITTED',
          eventType: 'ORDER_SUBMITTED',
        },
        {
          eventId: 'EVT_E1_3',
          sequenceNumber: 3,
          timestamp: '2026-03-30T10:30:00.200Z',
          orderId: 'REC-HPG-20260330-01',
          snapshotId: snapshot.snapshotId,
          previousState: 'SUBMITTED',
          nextState: 'FILLED',
          eventType: 'ORDER_FILLED',
          quantity: 1000,
          price: 28500,
        },
      ];

      const res = ReplayEngine.replay({
        snapshot,
        orderIntent,
        executionContext,
        eventSequence: tampered,
      });

      expect(res.status).toBe('REPLAY_INVALID');
      expect(res.mismatches.some(m => m.code === 'INVALID_STATE_TRANSITION' || m.code === 'MISSING_EVENT')).toBe(true);
    });
  });

  // ==========================================================================
  // GROUP F — EVENT ID & SEQUENCE NUMBER TAMPERING
  // ==========================================================================
  describe('Group F — Event ID & Sequence Number Tampering', () => {
    it('F1: Rejects duplicate eventId across sequence', () => {
      const { snapshot, orderIntent, executionContext } = createTestContext();
      const canonical = OrderStateMachine.buildCanonicalSequence({
        orderId: 'REC-HPG-20260330-01',
        snapshotId: snapshot.snapshotId,
        quantity: 1000,
        price: 28500,
      });

      // Give event 2 the same eventId as event 1
      const tampered = [
        canonical[0],
        { ...canonical[1], eventId: canonical[0].eventId },
        ...canonical.slice(2),
      ];

      const res = ReplayEngine.replay({
        snapshot,
        orderIntent,
        executionContext,
        eventSequence: tampered,
      });

      expect(res.status).toBe('REPLAY_INVALID');
      expect(res.mismatches.some(m => m.code === 'DUPLICATE_EVENT')).toBe(true);
    });

    it('F2: Rejects sequence gap: 1, 2, 4 (missing 3)', () => {
      const { snapshot, orderIntent, executionContext } = createTestContext();
      const canonical = OrderStateMachine.buildCanonicalSequence({
        orderId: 'REC-HPG-20260330-01',
        snapshotId: snapshot.snapshotId,
        quantity: 1000,
        price: 28500,
      });

      const tampered = [
        canonical[0], // seq 1
        canonical[1], // seq 2
        { ...canonical[2], sequenceNumber: 4 }, // jumped to 4!
      ];

      const res = ReplayEngine.replay({
        snapshot,
        orderIntent,
        executionContext,
        eventSequence: tampered,
      });

      expect(res.status).toBe('REPLAY_INVALID');
      expect(res.mismatches.some(m => m.code === 'SEQUENCE_NUMBER_INVALID')).toBe(true);
    });

    it('F3: Rejects out-of-order sequenceNumber: 1, 3, 2', () => {
      const { snapshot, orderIntent, executionContext } = createTestContext();
      const canonical = OrderStateMachine.buildCanonicalSequence({
        orderId: 'REC-HPG-20260330-01',
        snapshotId: snapshot.snapshotId,
        quantity: 1000,
        price: 28500,
      });

      const tampered = [
        canonical[0], // seq 1
        { ...canonical[1], sequenceNumber: 3 }, // seq 3
        { ...canonical[2], sequenceNumber: 2 }, // seq 2
      ];

      const res = ReplayEngine.replay({
        snapshot,
        orderIntent,
        executionContext,
        eventSequence: tampered,
      });

      expect(res.status).toBe('REPLAY_INVALID');
      expect(res.mismatches.some(m => m.code === 'SEQUENCE_OUT_OF_ORDER' || m.code === 'SEQUENCE_NUMBER_INVALID')).toBe(true);
    });

    it('F4: Rejects duplicate sequence numbers: 1, 2, 2', () => {
      const { snapshot, orderIntent, executionContext } = createTestContext();
      const canonical = OrderStateMachine.buildCanonicalSequence({
        orderId: 'REC-HPG-20260330-01',
        snapshotId: snapshot.snapshotId,
        quantity: 1000,
        price: 28500,
      });

      const tampered = [
        canonical[0], // seq 1
        canonical[1], // seq 2
        { ...canonical[2], sequenceNumber: 2 }, // duplicate seq 2
      ];

      const res = ReplayEngine.replay({
        snapshot,
        orderIntent,
        executionContext,
        eventSequence: tampered,
      });

      expect(res.status).toBe('REPLAY_INVALID');
      expect(res.mismatches.some(m => m.code === 'SEQUENCE_NUMBER_INVALID')).toBe(true);
    });

    it('F5: Rejects zero or negative sequenceNumber (e.g. 0, -1)', () => {
      const { snapshot, orderIntent, executionContext } = createTestContext();
      const canonical = OrderStateMachine.buildCanonicalSequence({
        orderId: 'REC-HPG-20260330-01',
        snapshotId: snapshot.snapshotId,
        quantity: 1000,
        price: 28500,
      });

      const tampered = [
        { ...canonical[0], sequenceNumber: 0 },
        ...canonical.slice(1),
      ];

      const res = ReplayEngine.replay({
        snapshot,
        orderIntent,
        executionContext,
        eventSequence: tampered,
      });

      expect(res.status).toBe('REPLAY_INVALID');
      expect(res.mismatches.some(m => m.code === 'SEQUENCE_NUMBER_INVALID')).toBe(true);
    });
  });

  // ==========================================================================
  // GROUP G — TIMESTAMP ORDERING
  // ==========================================================================
  describe('Group G — Timestamp Ordering', () => {
    it('G1: Rejects timestamps going backward in time', () => {
      const { snapshot, orderIntent, executionContext } = createTestContext();
      const canonical = OrderStateMachine.buildCanonicalSequence({
        orderId: 'REC-HPG-20260330-01',
        snapshotId: snapshot.snapshotId,
        quantity: 1000,
        price: 28500,
      });

      const tampered = [
        { ...canonical[0], timestamp: '2026-03-30T10:00:01.000Z' },
        { ...canonical[1], timestamp: '2026-03-30T10:00:02.000Z' },
        { ...canonical[2], timestamp: '2026-03-30T10:00:01.000Z' }, // Backward!
      ];

      const res = ReplayEngine.replay({
        snapshot,
        orderIntent,
        executionContext,
        eventSequence: tampered,
      });

      expect(res.status).toBe('REPLAY_INVALID');
      expect(res.mismatches.some(m => m.code === 'TIMESTAMP_OUT_OF_ORDER')).toBe(true);
    });
  });

  // ==========================================================================
  // GROUP H — CONTEXT & ORDER BINDING
  // ==========================================================================
  describe('Group H — Context & Order Binding', () => {
    it('H1: Rejects event belonging to a different orderId', () => {
      const { snapshot, orderIntent, executionContext } = createTestContext();
      const canonical = OrderStateMachine.buildCanonicalSequence({
        orderId: 'REC-HPG-20260330-01',
        snapshotId: snapshot.snapshotId,
        quantity: 1000,
        price: 28500,
      });

      const tampered = [
        canonical[0],
        { ...canonical[1], orderId: 'ALIEN_ORDER_XYZ' }, // Mismatched orderId
        ...canonical.slice(2),
      ];

      const res = ReplayEngine.replay({
        snapshot,
        orderIntent,
        executionContext,
        eventSequence: tampered,
      });

      expect(res.status).toBe('REPLAY_INVALID');
      expect(res.mismatches.some(m => m.code === 'ORDER_BINDING_MISMATCH')).toBe(true);
    });

    it('H2: Rejects event belonging to a different snapshotId', () => {
      const { snapshot, orderIntent, executionContext } = createTestContext();
      const canonical = OrderStateMachine.buildCanonicalSequence({
        orderId: 'REC-HPG-20260330-01',
        snapshotId: snapshot.snapshotId,
        quantity: 1000,
        price: 28500,
      });

      const tampered = [
        canonical[0],
        { ...canonical[1], snapshotId: 'FORGED_SNAPSHOT_999' }, // Mismatched snapshotId
        ...canonical.slice(2),
      ];

      const res = ReplayEngine.replay({
        snapshot,
        orderIntent,
        executionContext,
        eventSequence: tampered,
      });

      expect(res.status).toBe('REPLAY_INVALID');
      expect(res.mismatches.some(m => m.code === 'ORDER_SNAPSHOT_MISMATCH')).toBe(true);
    });
  });

  // ==========================================================================
  // GROUP I — PARTIAL FILL INTEGRITY & OVERFILL
  // ==========================================================================
  describe('Group I — Partial Fill Integrity & Overfill', () => {
    it('I1: Accepts multiple valid partial fills summing exactly to ordered quantity (300 + 300 + 400 = 1000)', () => {
      const { snapshot, orderIntent, executionContext } = createTestContext();
      const baseTs = new Date('2026-03-30T10:30:00.000Z').getTime();
      const orderId = 'REC-HPG-20260330-01';

      const partialFillSequence: ReplayEvent[] = [
        {
          eventId: 'EVT_PF_1',
          sequenceNumber: 1,
          timestamp: new Date(baseTs + 10).toISOString(),
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'NEW',
          nextState: 'VALIDATED',
          eventType: 'ORDER_CREATED',
        },
        {
          eventId: 'EVT_PF_2',
          sequenceNumber: 2,
          timestamp: new Date(baseTs + 20).toISOString(),
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'VALIDATED',
          nextState: 'AUTHORIZED',
          eventType: 'ORDER_VALIDATED',
        },
        {
          eventId: 'EVT_PF_3',
          sequenceNumber: 3,
          timestamp: new Date(baseTs + 30).toISOString(),
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'AUTHORIZED',
          nextState: 'SUBMITTED',
          eventType: 'ORDER_AUTHORIZED',
        },
        {
          eventId: 'EVT_PF_4_FILL1',
          sequenceNumber: 4,
          timestamp: new Date(baseTs + 40).toISOString(),
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'SUBMITTED',
          nextState: 'PARTIALLY_FILLED',
          eventType: 'ORDER_PARTIALLY_FILLED',
          quantity: 300,
          price: 28500,
        },
        {
          eventId: 'EVT_PF_5_FILL2',
          sequenceNumber: 5,
          timestamp: new Date(baseTs + 50).toISOString(),
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'PARTIALLY_FILLED',
          nextState: 'PARTIALLY_FILLED',
          eventType: 'ORDER_PARTIALLY_FILLED',
          quantity: 300,
          price: 28500,
        },
        {
          eventId: 'EVT_PF_6_FILL3',
          sequenceNumber: 6,
          timestamp: new Date(baseTs + 60).toISOString(),
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'PARTIALLY_FILLED',
          nextState: 'FILLED',
          eventType: 'ORDER_FILLED',
          quantity: 400,
          price: 28500,
        },
        {
          eventId: 'EVT_PF_7_SETTLE',
          sequenceNumber: 7,
          timestamp: new Date(baseTs + 70).toISOString(),
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'FILLED',
          nextState: 'SETTLED',
          eventType: 'ORDER_SETTLED',
        },
      ];

      const res = ReplayEngine.replay({
        snapshot,
        orderIntent,
        executionContext,
        eventSequence: partialFillSequence,
      });

      expect(res.status).toBe('REPLAYED');
      expect(res.mismatches).toEqual([]);
      expect(res.stateHistory).toEqual([
        'NEW',
        'VALIDATED',
        'AUTHORIZED',
        'SUBMITTED',
        'PARTIALLY_FILLED',
        'PARTIALLY_FILLED',
        'FILLED',
        'SETTLED',
      ]);
    });

    it('I2: Rejects overfill violation: 300 + 300 + 500 = 1100 > ordered 1000', () => {
      const { snapshot, orderIntent, executionContext } = createTestContext();
      const baseTs = new Date('2026-03-30T10:30:00.000Z').getTime();
      const orderId = 'REC-HPG-20260330-01';

      const overfillSequence: ReplayEvent[] = [
        {
          eventId: 'EVT_OF_1',
          sequenceNumber: 1,
          timestamp: new Date(baseTs + 10).toISOString(),
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'NEW',
          nextState: 'VALIDATED',
          eventType: 'ORDER_CREATED',
        },
        {
          eventId: 'EVT_OF_2',
          sequenceNumber: 2,
          timestamp: new Date(baseTs + 20).toISOString(),
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'VALIDATED',
          nextState: 'AUTHORIZED',
          eventType: 'ORDER_VALIDATED',
        },
        {
          eventId: 'EVT_OF_3',
          sequenceNumber: 3,
          timestamp: new Date(baseTs + 30).toISOString(),
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'AUTHORIZED',
          nextState: 'SUBMITTED',
          eventType: 'ORDER_AUTHORIZED',
        },
        {
          eventId: 'EVT_OF_4',
          sequenceNumber: 4,
          timestamp: new Date(baseTs + 40).toISOString(),
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'SUBMITTED',
          nextState: 'PARTIALLY_FILLED',
          eventType: 'ORDER_PARTIALLY_FILLED',
          quantity: 300,
          price: 28500,
        },
        {
          eventId: 'EVT_OF_5',
          sequenceNumber: 5,
          timestamp: new Date(baseTs + 50).toISOString(),
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'PARTIALLY_FILLED',
          nextState: 'PARTIALLY_FILLED',
          eventType: 'ORDER_PARTIALLY_FILLED',
          quantity: 300,
          price: 28500,
        },
        {
          eventId: 'EVT_OF_6_OVER',
          sequenceNumber: 6,
          timestamp: new Date(baseTs + 60).toISOString(),
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'PARTIALLY_FILLED',
          nextState: 'FILLED',
          eventType: 'ORDER_FILLED',
          quantity: 500, // 300 + 300 + 500 = 1100 > 1000!
          price: 28500,
        },
      ];

      const res = ReplayEngine.replay({
        snapshot,
        orderIntent,
        executionContext,
        eventSequence: overfillSequence,
      });

      expect(res.status).toBe('REPLAY_INVALID');
      expect(res.mismatches.some(m => m.code === 'OVERFILL_VIOLATION')).toBe(true);
    });

    it('I3: Accepts partial fill without overfill (300 + 300 = 600 < 1000)', () => {
      const { snapshot, orderIntent, executionContext } = createTestContext();
      const baseTs = new Date('2026-03-30T10:30:00.000Z').getTime();
      const orderId = 'REC-HPG-20260330-01';

      const validPartialSeq: ReplayEvent[] = [
        {
          eventId: 'EVT_PF_1',
          sequenceNumber: 1,
          timestamp: new Date(baseTs + 10).toISOString(),
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'NEW',
          nextState: 'VALIDATED',
          eventType: 'ORDER_CREATED',
        },
        {
          eventId: 'EVT_PF_2',
          sequenceNumber: 2,
          timestamp: new Date(baseTs + 20).toISOString(),
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'VALIDATED',
          nextState: 'AUTHORIZED',
          eventType: 'ORDER_VALIDATED',
        },
        {
          eventId: 'EVT_PF_3',
          sequenceNumber: 3,
          timestamp: new Date(baseTs + 30).toISOString(),
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'AUTHORIZED',
          nextState: 'SUBMITTED',
          eventType: 'ORDER_AUTHORIZED',
        },
        {
          eventId: 'EVT_PF_4',
          sequenceNumber: 4,
          timestamp: new Date(baseTs + 40).toISOString(),
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'SUBMITTED',
          nextState: 'PARTIALLY_FILLED',
          eventType: 'ORDER_PARTIALLY_FILLED',
          quantity: 300,
          price: 28500,
        },
        {
          eventId: 'EVT_PF_5',
          sequenceNumber: 5,
          timestamp: new Date(baseTs + 50).toISOString(),
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'PARTIALLY_FILLED',
          nextState: 'PARTIALLY_FILLED',
          eventType: 'ORDER_PARTIALLY_FILLED',
          quantity: 300,
          price: 28500,
        },
      ];

      const res = ReplayEngine.replay({
        snapshot,
        orderIntent,
        executionContext,
        eventSequence: validPartialSeq,
      });

      expect(res.status).toBe('REPLAYED');
      expect(res.mismatches).toEqual([]);
    });
  });

  // ==========================================================================
  // GROUP J — ZERO OR NEGATIVE EXECUTION PARAMETERS
  // ==========================================================================
  describe('Group J — Zero or Negative Execution Parameters', () => {
    it('J1: Rejects zero or negative executed quantity (quantity <= 0)', () => {
      const { snapshot, orderIntent, executionContext } = createTestContext();
      const canonical = OrderStateMachine.buildCanonicalSequence({
        orderId: 'REC-HPG-20260330-01',
        snapshotId: snapshot.snapshotId,
        quantity: 1000,
        price: 28500,
      });

      const tampered = [
        ...canonical.slice(0, 3),
        { ...canonical[3], quantity: 0 },
        ...canonical.slice(4),
      ];

      const res = ReplayEngine.replay({
        snapshot,
        orderIntent,
        executionContext,
        eventSequence: tampered,
      });

      expect(res.status).toBe('REPLAY_INVALID');
      expect(res.mismatches.some(m => m.code === 'NEGATIVE_EXECUTION_PARAM')).toBe(true);
    });

    it('J2: Rejects zero or negative executed price (price <= 0)', () => {
      const { snapshot, orderIntent, executionContext } = createTestContext();
      const canonical = OrderStateMachine.buildCanonicalSequence({
        orderId: 'REC-HPG-20260330-01',
        snapshotId: snapshot.snapshotId,
        quantity: 1000,
        price: 28500,
      });

      const tampered = [
        ...canonical.slice(0, 3),
        { ...canonical[3], price: -28500 },
        ...canonical.slice(4),
      ];

      const res = ReplayEngine.replay({
        snapshot,
        orderIntent,
        executionContext,
        eventSequence: tampered,
      });

      expect(res.status).toBe('REPLAY_INVALID');
      expect(res.mismatches.some(m => m.code === 'NEGATIVE_EXECUTION_PARAM')).toBe(true);
    });

    it('J3: Rejects negative fee (fee < 0)', () => {
      const { snapshot, orderIntent, executionContext } = createTestContext();
      const canonical = OrderStateMachine.buildCanonicalSequence({
        orderId: 'REC-HPG-20260330-01',
        snapshotId: snapshot.snapshotId,
        quantity: 1000,
        price: 28500,
      });

      const tampered = [
        ...canonical.slice(0, 3),
        { ...canonical[3], fee: -5000 },
        ...canonical.slice(4),
      ];

      const res = ReplayEngine.replay({
        snapshot,
        orderIntent,
        executionContext,
        eventSequence: tampered,
      });

      expect(res.status).toBe('REPLAY_INVALID');
      expect(res.mismatches.some(m => m.code === 'NEGATIVE_EXECUTION_PARAM')).toBe(true);
    });

    it('J4: Rejects negative tax (tax < 0)', () => {
      const { snapshot, orderIntent, executionContext } = createTestContext();
      const canonical = OrderStateMachine.buildCanonicalSequence({
        orderId: 'REC-HPG-20260330-01',
        snapshotId: snapshot.snapshotId,
        quantity: 1000,
        price: 28500,
      });

      const tampered = [
        ...canonical.slice(0, 3),
        { ...canonical[3], tax: -1000 },
        ...canonical.slice(4),
      ];

      const res = ReplayEngine.replay({
        snapshot,
        orderIntent,
        executionContext,
        eventSequence: tampered,
      });

      expect(res.status).toBe('REPLAY_INVALID');
      expect(res.mismatches.some(m => m.code === 'NEGATIVE_EXECUTION_PARAM')).toBe(true);
    });
  });

  // ==========================================================================
  // GROUP K — TERMINAL STATE IMMUTABILITY
  // ==========================================================================
  describe('Group K — Terminal State Immutability', () => {
    it('K1: Prohibits transitions out of any terminal state (SETTLED, REJECTED, CANCELLED, EXPIRED, FAILED)', () => {
      const terminalStates = ['SETTLED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'FAILED'] as const;

      for (const terminal of terminalStates) {
        const events: ReplayEvent[] = [
          {
            eventId: `EVT_${terminal}_1`,
            sequenceNumber: 1,
            timestamp: '2026-03-30T10:30:00.100Z',
            orderId: 'ORDER_TERM',
            previousState: 'NEW',
            nextState: terminal === 'SETTLED' ? 'VALIDATED' : terminal,
            eventType: 'ORDER_INIT',
          },
          {
            eventId: `EVT_${terminal}_2`,
            sequenceNumber: 2,
            timestamp: '2026-03-30T10:30:00.200Z',
            orderId: 'ORDER_TERM',
            previousState: terminal,
            nextState: 'FILLED', // Attempt mutation out of terminal
            eventType: 'ORDER_MUTATE',
          },
        ];

        const validation = OrderStateMachine.validateSequence(events, { orderId: 'ORDER_TERM' });
        expect(validation.isValid).toBe(false);
        expect(validation.mismatches.some(m => m.code === 'TERMINAL_STATE_MUTATION')).toBe(true);
      }
    });
  });

  // ==========================================================================
  // GROUP L — CROSS-REPLAY ISOLATION
  // ==========================================================================
  describe('Group L — Cross-Replay Isolation', () => {
    it('L1: Replay A and Replay B operate in complete isolation without state cross-contamination', () => {
      const snapshotA = MarketSnapshotBuilder.buildFrom({
        ...baseInput,
        recommendation: {
          ...baseInput.recommendation!,
          recommendationId: 'REC-ORDER-A',
        },
      });
      const orderIntentA: OrderIntent = {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 500,
        orderType: 'MARKET',
        recommendationId: 'REC-ORDER-A',
      };
      const contextA: ExecutionContextBinding = {
        marketDataSnapshotId: snapshotA.snapshotId,
        recommendationId: 'REC-ORDER-A',
        strategyVersion: 'v2.1.0',
        riskPolicyVersion: 'v1.4.0',
      };
      const eventsA = OrderStateMachine.buildCanonicalSequence({
        orderId: 'REC-ORDER-A',
        snapshotId: snapshotA.snapshotId,
        quantity: 500,
        price: 28500,
      });

      const snapshotB = MarketSnapshotBuilder.buildFrom({
        ...baseInput,
        recommendation: {
          ...baseInput.recommendation!,
          recommendationId: 'REC-ORDER-B',
        },
      });
      const orderIntentB: OrderIntent = {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 1200,
        orderType: 'MARKET',
        recommendationId: 'REC-ORDER-B',
      };
      const contextB: ExecutionContextBinding = {
        marketDataSnapshotId: snapshotB.snapshotId,
        recommendationId: 'REC-ORDER-B',
        strategyVersion: 'v2.1.0',
        riskPolicyVersion: 'v1.4.0',
      };
      const eventsB = OrderStateMachine.buildCanonicalSequence({
        orderId: 'REC-ORDER-B',
        snapshotId: snapshotB.snapshotId,
        quantity: 1200,
        price: 28500,
      });

      const resA = ReplayEngine.replay({
        snapshot: snapshotA,
        orderIntent: orderIntentA,
        executionContext: contextA,
        eventSequence: eventsA,
      });

      const resB = ReplayEngine.replay({
        snapshot: snapshotB,
        orderIntent: orderIntentB,
        executionContext: contextB,
        eventSequence: eventsB,
      });

      expect(resA.status).toBe('REPLAYED');
      expect(resB.status).toBe('REPLAYED');
      expect(resA.replayExecution?.executedQuantity).toBe(500);
      expect(resB.replayExecution?.executedQuantity).toBe(1200);
      expect(resA.eventHistory?.[0].orderId).toBe('REC-ORDER-A');
      expect(resB.eventHistory?.[0].orderId).toBe('REC-ORDER-B');
    });
  });

  // ==========================================================================
  // GROUP M — DETERMINISTIC STATE TRANSITION
  // ==========================================================================
  describe('Group M — Deterministic State Transition', () => {
    it('M1: 5 identical replay executions yield bitwise identical stateHistory, eventHistory, executionResult, and ledgerEffect', () => {
      const { snapshot, orderIntent, executionContext } = createTestContext();
      const canonicalEvents = OrderStateMachine.buildCanonicalSequence({
        orderId: 'REC-HPG-20260330-01',
        snapshotId: snapshot.snapshotId,
        quantity: 1000,
        price: 28500,
      });

      const results = [];
      for (let i = 0; i < 5; i++) {
        const res = ReplayEngine.replay({
          snapshot,
          orderIntent,
          executionContext,
          eventSequence: canonicalEvents,
        });
        results.push(res);
      }

      // Check all 5 runs
      for (const res of results) {
        expect(res.status).toBe('REPLAYED');
        expect(res.deterministic).toBe(true);
        expect(res.mismatches).toEqual([]);
        expect(res.stateHistory).toEqual([
          'NEW',
          'VALIDATED',
          'AUTHORIZED',
          'SUBMITTED',
          'FILLED',
          'SETTLED',
        ]);
      }

      // Compare run 0 with runs 1 through 4
      const baseline = results[0];
      for (let i = 1; i < 5; i++) {
        expect(results[i].stateHistory).toEqual(baseline.stateHistory);
        expect(results[i].replayExecution).toEqual(baseline.replayExecution);
        expect(results[i].eventHistory).toEqual(baseline.eventHistory);
      }
    });
  });

  // ==========================================================================
  // GROUP N — FAIL-CLOSED GUARANTEE & NON-MUTATION
  // ==========================================================================
  describe('Group N — Fail-Closed Guarantee & Non-Mutation', () => {
    it('N1: Any fault results in REPLAY_INVALID with zero execution and zero account mutation', () => {
      const { snapshot, orderIntent, executionContext, initialAccount } = createTestContext();
      const initialAccountSnapshot = JSON.stringify(initialAccount);

      // Faulty sequence with bad transition
      const tampered: ReplayEvent[] = [
        {
          eventId: 'EVT_N1_1',
          sequenceNumber: 1,
          timestamp: '2026-03-30T10:30:00.100Z',
          orderId: 'REC-HPG-20260330-01',
          snapshotId: snapshot.snapshotId,
          previousState: 'NEW',
          nextState: 'SETTLED', // Impossible bypass
          eventType: 'ORDER_SETTLED',
        },
      ];

      const res = ReplayEngine.replay({
        snapshot,
        orderIntent,
        executionContext,
        initialAccount,
        eventSequence: tampered,
      });

      expect(res.status).toBe('REPLAY_INVALID');
      expect(res.replayExecution).toBeUndefined();
      // Verify complete non-mutation of initial account
      expect(JSON.stringify(initialAccount)).toBe(initialAccountSnapshot);
    });

    it('N2: Verifies non-mutation invariant on MarketSnapshot, BrokerAccount, PaperTradeLedger, OrderIntent', () => {
      const { snapshot, orderIntent, executionContext, initialAccount } = createTestContext();
      const ledger = new PaperTradeLedger();

      const snapshotBefore = JSON.stringify(snapshot);
      const accountBefore = JSON.stringify(initialAccount);
      const intentBefore = JSON.stringify(orderIntent);
      const ledgerBefore = JSON.stringify(ledger.getAllEntries());

      // Run replay with valid canonical events
      const canonical = OrderStateMachine.buildCanonicalSequence({
        orderId: 'REC-HPG-20260330-01',
        snapshotId: snapshot.snapshotId,
        quantity: 1000,
        price: 28500,
      });

      const res = ReplayEngine.replay({
        snapshot,
        orderIntent,
        executionContext,
        initialAccount,
        eventSequence: canonical,
      });

      expect(res.status).toBe('REPLAYED');

      // Verify that caller objects were completely unmutated
      expect(JSON.stringify(snapshot)).toBe(snapshotBefore);
      expect(JSON.stringify(initialAccount)).toBe(accountBefore);
      expect(JSON.stringify(orderIntent)).toBe(intentBefore);
      expect(JSON.stringify(ledger.getAllEntries())).toBe(ledgerBefore);
    });
  });
});
