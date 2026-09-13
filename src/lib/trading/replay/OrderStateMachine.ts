/**
 * PHASE 18.3.5 — ORDER STATE MACHINE & EVENT SEQUENCE INTEGRITY
 * =============================================================
 * Deterministic finite state machine and sequence validator for order lifecycles.
 * Enforces strict transitions, monotonic sequence numbering, chronological timestamps,
 * non-overfill quantity bounds, context binding, and terminal state immutability.
 *
 * Fail-Closed: any violation halts execution immediately with REPLAY_INVALID.
 */

import type { OrderStatus } from '../types/trading.ts';
import type {
  ReplayEvent,
  ReplayMismatch,
  ReplayValidationResult,
  ReplayEventType,
} from './types.ts';

export class OrderStateMachine {
  /**
   * Allowed state transitions matrix.
   */
  static readonly VALID_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = Object.freeze({
    NEW: Object.freeze(['VALIDATED', 'REJECTED', 'FAILED'] as OrderStatus[]),
    VALIDATED: Object.freeze(['AUTHORIZED', 'REJECTED', 'CANCELLED', 'FAILED'] as OrderStatus[]),
    AUTHORIZED: Object.freeze(['SUBMITTED', 'REJECTED', 'CANCELLED', 'FAILED'] as OrderStatus[]),
    SUBMITTED: Object.freeze(['PARTIALLY_FILLED', 'FILLED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'FAILED'] as OrderStatus[]),
    PARTIALLY_FILLED: Object.freeze(['PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'EXPIRED', 'FAILED'] as OrderStatus[]),
    FILLED: Object.freeze(['SETTLED'] as OrderStatus[]),
    SETTLED: Object.freeze([] as OrderStatus[]),
    REJECTED: Object.freeze([] as OrderStatus[]),
    CANCELLED: Object.freeze([] as OrderStatus[]),
    EXPIRED: Object.freeze([] as OrderStatus[]),
    FAILED: Object.freeze([] as OrderStatus[]),
  });

  /**
   * Terminal states from which no further transitions may occur.
   */
  static readonly TERMINAL_STATES: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
    'SETTLED',
    'REJECTED',
    'CANCELLED',
    'EXPIRED',
    'FAILED',
  ]);

  /**
   * Mandatory sequential milestones required for an order to reach FILLED/SETTLED.
   */
  static readonly MANDATORY_PIPELINE_STATES: readonly OrderStatus[] = Object.freeze([
    'NEW',
    'VALIDATED',
    'AUTHORIZED',
    'SUBMITTED',
  ]);

  /**
   * Checks if a direct transition from currentState to targetState is valid.
   */
  static isValidTransition(from: OrderStatus, to: OrderStatus): boolean {
    const allowed = this.VALID_TRANSITIONS[from];
    return Boolean(allowed && allowed.includes(to));
  }

  /**
   * Validates an entire event sequence for integrity, ordering, binding, and transition correctness.
   */
  static validateSequence(
    events: readonly ReplayEvent[],
    context: {
      orderId?: string;
      snapshotId?: string;
      quantity?: number;
    } = {}
  ): ReplayValidationResult {
    const mismatches: ReplayMismatch[] = [];

    if (!events || !Array.isArray(events) || events.length === 0) {
      mismatches.push({
        code: 'INPUT_INVALID',
        field: 'eventSequence',
        expected: 'Non-empty array of ReplayEvent objects',
        actual: events,
        message: 'Event sequence is missing or empty',
      });
      return {
        isValid: false,
        mismatches,
        error: 'Event sequence is missing or empty',
      };
    }

    const seenEventIds = new Set<string>();
    const seenSeqNumbers = new Set<number>();
    let prevTimestamp = -Infinity;
    let cumulativeFilled = 0;
    const visitedStates = new Set<OrderStatus>(['NEW']);

    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      const eventIndexStr = `eventSequence[${i}]`;

      // 1. Event existence & ID validation (Group F1)
      if (!e || typeof e !== 'object') {
        mismatches.push({
          code: 'INPUT_INVALID',
          field: eventIndexStr,
          expected: 'Valid ReplayEvent object',
          actual: e,
          message: `Event at index ${i} is invalid or null`,
        });
        continue;
      }

      if (!e.eventId || typeof e.eventId !== 'string') {
        mismatches.push({
          code: 'INPUT_INVALID',
          field: `${eventIndexStr}.eventId`,
          expected: 'Non-empty string eventId',
          actual: e.eventId,
          message: `Event at index ${i} has invalid eventId`,
        });
      } else if (seenEventIds.has(e.eventId)) {
        mismatches.push({
          code: 'DUPLICATE_EVENT',
          field: `${eventIndexStr}.eventId`,
          expected: 'Unique eventId across sequence',
          actual: e.eventId,
          message: `Duplicate eventId detected: ${e.eventId} was already processed`,
        });
      } else {
        seenEventIds.add(e.eventId);
      }

      // 2. Sequence number validation (Group F2, F3, F4, F5)
      const expectedSeq = i + 1;
      if (
        typeof e.sequenceNumber !== 'number' ||
        !Number.isInteger(e.sequenceNumber) ||
        e.sequenceNumber <= 0
      ) {
        mismatches.push({
          code: 'SEQUENCE_NUMBER_INVALID',
          field: `${eventIndexStr}.sequenceNumber`,
          expected: `Positive integer ${expectedSeq}`,
          actual: e.sequenceNumber,
          message: `Event sequenceNumber must be positive integer, got ${e.sequenceNumber}`,
        });
      } else if (seenSeqNumbers.has(e.sequenceNumber)) {
        mismatches.push({
          code: 'SEQUENCE_NUMBER_INVALID',
          field: `${eventIndexStr}.sequenceNumber`,
          expected: `Unique sequenceNumber ${expectedSeq}`,
          actual: e.sequenceNumber,
          message: `Duplicate sequenceNumber ${e.sequenceNumber} detected at index ${i}`,
        });
      } else if (e.sequenceNumber !== expectedSeq) {
        if (i > 0 && e.sequenceNumber < events[i - 1].sequenceNumber) {
          mismatches.push({
            code: 'SEQUENCE_OUT_OF_ORDER',
            field: `${eventIndexStr}.sequenceNumber`,
            expected: expectedSeq,
            actual: e.sequenceNumber,
            message: `Out-of-order sequenceNumber: ${e.sequenceNumber} after ${events[i - 1].sequenceNumber}`,
          });
        } else {
          mismatches.push({
            code: 'SEQUENCE_NUMBER_INVALID',
            field: `${eventIndexStr}.sequenceNumber`,
            expected: expectedSeq,
            actual: e.sequenceNumber,
            message: `Sequence gap or mismatch: expected sequence ${expectedSeq}, got ${e.sequenceNumber}`,
          });
        }
      }
      if (typeof e.sequenceNumber === 'number') {
        seenSeqNumbers.add(e.sequenceNumber);
      }

      // 3. Monotonic Timestamp validation (Group G)
      const parsedTs = typeof e.timestamp === 'string' ? new Date(e.timestamp).getTime() : Number(e.timestamp);
      if (Number.isNaN(parsedTs)) {
        mismatches.push({
          code: 'INPUT_INVALID',
          field: `${eventIndexStr}.timestamp`,
          expected: 'Valid timestamp string or milliseconds number',
          actual: e.timestamp,
          message: `Invalid timestamp format at event ${i}: ${e.timestamp}`,
        });
      } else if (parsedTs < prevTimestamp) {
        mismatches.push({
          code: 'TIMESTAMP_OUT_OF_ORDER',
          field: `${eventIndexStr}.timestamp`,
          expected: `>= ${new Date(prevTimestamp).toISOString()}`,
          actual: typeof e.timestamp === 'string' ? e.timestamp : new Date(parsedTs).toISOString(),
          message: `Event timestamp out of order: ${e.timestamp} is before preceding timestamp ${prevTimestamp}`,
        });
      } else {
        prevTimestamp = parsedTs;
      }

      // 4. Order & Snapshot Binding validation (Group H)
      if (context.orderId && e.orderId && e.orderId !== context.orderId) {
        mismatches.push({
          code: 'ORDER_BINDING_MISMATCH',
          field: `${eventIndexStr}.orderId`,
          expected: context.orderId,
          actual: e.orderId,
          message: `Event orderId (${e.orderId}) does not match target order (${context.orderId})`,
        });
      }

      if (context.snapshotId && e.snapshotId && e.snapshotId !== context.snapshotId) {
        mismatches.push({
          code: 'ORDER_SNAPSHOT_MISMATCH',
          field: `${eventIndexStr}.snapshotId`,
          expected: context.snapshotId,
          actual: e.snapshotId,
          message: `Event snapshotId (${e.snapshotId}) does not match target snapshot (${context.snapshotId})`,
        });
      }

      // 5. State Transition & Chain Continuity validation (Group A, B, C, D, E, K)
      const prev = e.previousState;
      const next = e.nextState;

      // Chain continuity: previousState must match previous event's nextState
      if (i === 0) {
        if (prev !== 'NEW') {
          mismatches.push({
            code: 'INVALID_STATE_TRANSITION',
            field: `${eventIndexStr}.previousState`,
            expected: 'NEW',
            actual: prev,
            message: `First event must originate from 'NEW', received '${prev}'`,
          });
        }
      } else {
        const expectedPrev = events[i - 1].nextState;
        if (prev !== expectedPrev) {
          mismatches.push({
            code: 'SEQUENCE_OUT_OF_ORDER',
            field: `${eventIndexStr}.previousState`,
            expected: expectedPrev,
            actual: prev,
            message: `Event continuity broken: expected previousState '${expectedPrev}' (from preceding event), received '${prev}'`,
          });
        }
      }

      // Terminal state immutability (Group K, A3, A4, A5, A6)
      if (this.TERMINAL_STATES.has(prev)) {
        mismatches.push({
          code: 'TERMINAL_STATE_MUTATION',
          field: `${eventIndexStr}.previousState`,
          expected: 'No transitions allowed from terminal state',
          actual: `${prev} -> ${next}`,
          message: `Illegal transition from terminal state '${prev}' to '${next}'`,
        });
      }

      // Duplicate state transition / Non-reentrant states (Group C, D)
      if (prev === next) {
        if (prev !== 'PARTIALLY_FILLED') {
          mismatches.push({
            code: 'DUPLICATE_EVENT',
            field: `${eventIndexStr}`,
            expected: `State transition to a new valid state`,
            actual: `${prev} -> ${next}`,
            message: `Redundant self-transition in state '${prev}' is prohibited`,
          });
        }
      }

      // State transition validity (Group A1, A2, A7)
      if (!this.isValidTransition(prev, next)) {
        mismatches.push({
          code: 'INVALID_STATE_TRANSITION',
          field: `${eventIndexStr}.nextState`,
          expected: this.VALID_TRANSITIONS[prev] ? this.VALID_TRANSITIONS[prev].join(' | ') : 'NONE',
          actual: `${prev} -> ${next}`,
          message: `Invalid state transition: '${prev}' cannot transition to '${next}'`,
        });
      }

      // Missing mandatory milestone check (Group E, A7)
      if (next === 'FILLED' || next === 'SETTLED') {
        for (const mandatory of this.MANDATORY_PIPELINE_STATES) {
          if (!visitedStates.has(mandatory)) {
            mismatches.push({
              code: 'MISSING_EVENT',
              field: `${eventIndexStr}`,
              expected: `Prior passage through mandatory state '${mandatory}'`,
              actual: `Reached '${next}' without passing through '${mandatory}'`,
              message: `Transition bypass detected: mandatory milestone '${mandatory}' was skipped before reaching '${next}'`,
            });
          }
        }
      }

      visitedStates.add(next);

      // 6. Partial Fill & Overfill validation (Group I)
      if (next === 'PARTIALLY_FILLED' || next === 'FILLED') {
        const fillQty = e.quantity;
        if (fillQty !== undefined) {
          if (fillQty <= 0) {
            mismatches.push({
              code: 'NEGATIVE_EXECUTION_PARAM',
              field: `${eventIndexStr}.quantity`,
              expected: '> 0',
              actual: fillQty,
              message: `Execution quantity must be strictly positive, got ${fillQty}`,
            });
          } else {
            cumulativeFilled += fillQty;
            if (context.quantity && cumulativeFilled > context.quantity) {
              mismatches.push({
                code: 'OVERFILL_VIOLATION',
                field: `${eventIndexStr}.quantity`,
                expected: `<= ${context.quantity} total ordered`,
                actual: `${cumulativeFilled} cumulative filled`,
                message: `Overfill violation: cumulative filled quantity (${cumulativeFilled}) exceeds ordered quantity (${context.quantity})`,
              });
            }
          }
        }
      }

      // 7. Execution parameters validation (Group J)
      if (e.price !== undefined && e.price <= 0) {
        mismatches.push({
          code: 'NEGATIVE_EXECUTION_PARAM',
          field: `${eventIndexStr}.price`,
          expected: '> 0',
          actual: e.price,
          message: `Execution price must be strictly positive, got ${e.price}`,
        });
      }
      if (e.fee !== undefined && e.fee < 0) {
        mismatches.push({
          code: 'NEGATIVE_EXECUTION_PARAM',
          field: `${eventIndexStr}.fee`,
          expected: '>= 0',
          actual: e.fee,
          message: `Brokerage fee cannot be negative, got ${e.fee}`,
        });
      }
      if (e.tax !== undefined && e.tax < 0) {
        mismatches.push({
          code: 'NEGATIVE_EXECUTION_PARAM',
          field: `${eventIndexStr}.tax`,
          expected: '>= 0',
          actual: e.tax,
          message: `Sales tax cannot be negative, got ${e.tax}`,
        });
      }
    }

    const isValid = mismatches.length === 0;
    return {
      isValid,
      mismatches,
      error: isValid ? undefined : mismatches.map(m => m.message).join('; '),
    };
  }

  /**
   * Builds a canonical, fully-valid sequential event history for an executed or rejected order.
   */
  static buildCanonicalSequence(params: {
    orderId: string;
    snapshotId?: string;
    quantity: number;
    price: number;
    fee?: number;
    tax?: number;
    timestamp?: string | number;
    isFilled?: boolean;
    rejectionReason?: string;
  }): ReplayEvent[] {
    const baseTs = params.timestamp
      ? (typeof params.timestamp === 'string' ? new Date(params.timestamp).getTime() : params.timestamp)
      : Date.now();

    const orderId = params.orderId;
    const snapshotId = params.snapshotId;
    const isFilled = params.isFilled !== false;

    const events: ReplayEvent[] = [
      {
        eventId: `EVT_${orderId}_1_NEW`,
        sequenceNumber: 1,
        timestamp: new Date(baseTs).toISOString(),
        orderId,
        snapshotId,
        previousState: 'NEW',
        nextState: 'VALIDATED',
        eventType: 'ORDER_CREATED',
      },
      {
        eventId: `EVT_${orderId}_2_VALIDATED`,
        sequenceNumber: 2,
        timestamp: new Date(baseTs + 50).toISOString(),
        orderId,
        snapshotId,
        previousState: 'VALIDATED',
        nextState: 'AUTHORIZED',
        eventType: 'ORDER_VALIDATED',
      },
    ];

    if (!isFilled) {
      events.push({
        eventId: `EVT_${orderId}_3_REJECTED`,
        sequenceNumber: 3,
        timestamp: new Date(baseTs + 100).toISOString(),
        orderId,
        snapshotId,
        previousState: 'AUTHORIZED',
        nextState: 'REJECTED',
        eventType: 'ORDER_REJECTED',
        reason: params.rejectionReason ?? 'Order rejected by risk or validation policy',
      });
      return events;
    }

    events.push(
      {
        eventId: `EVT_${orderId}_3_AUTHORIZED`,
        sequenceNumber: 3,
        timestamp: new Date(baseTs + 100).toISOString(),
        orderId,
        snapshotId,
        previousState: 'AUTHORIZED',
        nextState: 'SUBMITTED',
        eventType: 'ORDER_AUTHORIZED',
      },
      {
        eventId: `EVT_${orderId}_4_SUBMITTED`,
        sequenceNumber: 4,
        timestamp: new Date(baseTs + 150).toISOString(),
        orderId,
        snapshotId,
        previousState: 'SUBMITTED',
        nextState: 'FILLED',
        eventType: 'ORDER_FILLED',
        quantity: params.quantity,
        price: params.price,
        fee: params.fee ?? Math.round(params.quantity * params.price * 0.0015),
        tax: params.tax ?? 0,
      },
      {
        eventId: `EVT_${orderId}_5_FILLED`,
        sequenceNumber: 5,
        timestamp: new Date(baseTs + 200).toISOString(),
        orderId,
        snapshotId,
        previousState: 'FILLED',
        nextState: 'SETTLED',
        eventType: 'ORDER_SETTLED',
      }
    );

    return events;
  }
}
