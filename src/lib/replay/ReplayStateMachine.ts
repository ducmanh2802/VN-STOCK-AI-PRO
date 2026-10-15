/**
 * PAPER REPLAY — STATE MACHINE + IDEMPOTENT EVENT LOG
 * ====================================================
 * Lifecycle: CREATED → VALIDATING → READY → RUNNING → (PAUSED ⇄ RUNNING) →
 * COMPLETED. Failure states: INVALID / DATA_UNAVAILABLE / DATA_INVALID /
 * RISK_BLOCKED / EXECUTION_BLOCKED / FAILED / CANCELLED.
 * An incomplete replay is NEVER represented as successful/completed.
 *
 * Event log is append-only and idempotent: re-processing the same
 * (eventId, sequence) has exactly one financial effect.
 */
import type { ReplayEvent, ReplayEventType, ReplayState } from './types.ts';

const TRANSITIONS: Record<ReplayState, readonly ReplayState[]> = {
  CREATED: ['VALIDATING', 'INVALID', 'CANCELLED'],
  VALIDATING: ['READY', 'DATA_UNAVAILABLE', 'DATA_INVALID', 'INVALID', 'CANCELLED'],
  READY: ['RUNNING', 'CANCELLED', 'DATA_INVALID'],
  RUNNING: ['PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED', 'RISK_BLOCKED', 'EXECUTION_BLOCKED', 'DATA_INVALID', 'DATA_UNAVAILABLE'],
  PAUSED: ['RUNNING', 'CANCELLED', 'FAILED'],
  COMPLETED: [],
  INVALID: [],
  DATA_UNAVAILABLE: [],
  DATA_INVALID: [],
  RISK_BLOCKED: [],
  EXECUTION_BLOCKED: [],
  FAILED: [],
  CANCELLED: [],
};

export const TERMINAL_STATES: ReadonlySet<ReplayState> = new Set<ReplayState>([
  'COMPLETED', 'INVALID', 'DATA_UNAVAILABLE', 'DATA_INVALID',
  'RISK_BLOCKED', 'EXECUTION_BLOCKED', 'FAILED', 'CANCELLED',
]);

export class ReplayStateMachine {
  static canTransition(from: ReplayState, to: ReplayState): boolean {
    return TRANSITIONS[from].includes(to);
  }

  static transition(from: ReplayState, to: ReplayState): ReplayState {
    if (!ReplayStateMachine.canTransition(from, to)) {
      throw new Error(`INVALID_TRANSITION:${from}->${to}`);
    }
    return to;
  }

  static isTerminal(s: ReplayState): boolean {
    return TERMINAL_STATES.has(s);
  }
}

export class ReplayEventLog {
  private readonly events: ReplayEvent[] = [];
  private readonly seen = new Set<string>();
  private seq = 0;

  /** Idempotent: a duplicate (eventId) or out-of-order sequence is rejected. */
  append(input: {
    readonly eventId: string;
    readonly replayId: string;
    readonly effectiveDate: string;
    readonly eventType: ReplayEventType;
    readonly payload?: Readonly<Record<string, string | number | boolean | null>>;
    readonly provenance: string;
  }): { readonly accepted: boolean; readonly reason: string | null } {
    const key = `${input.replayId}|${input.eventId}`;
    if (this.seen.has(key)) return { accepted: false, reason: 'DUPLICATE_EVENT' };
    this.seq += 1;
    this.seen.add(key);
    this.events.push({
      eventId: input.eventId,
      replayId: input.replayId,
      sequence: this.seq,
      effectiveDate: input.effectiveDate,
      eventType: input.eventType,
      payload: input.payload ?? {},
      provenance: input.provenance,
    });
    return { accepted: true, reason: null };
  }

  all(): readonly ReplayEvent[] {
    return this.events;
  }

  count(): number {
    return this.events.length;
  }

  countOf(type: ReplayEventType): number {
    return this.events.filter((e) => e.eventType === type).length;
  }

  /** Deterministic ordering guarantee: sequence is strictly increasing. */
  isOrdered(): boolean {
    for (let i = 1; i < this.events.length; i += 1) {
      if (this.events[i].sequence <= this.events[i - 1].sequence) return false;
    }
    return true;
  }
}