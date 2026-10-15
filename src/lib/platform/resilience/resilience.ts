/**
 * PLATFORM-05 — TIMEOUTS, RETRY, CIRCUIT BREAKER (§49/§39)
 *
 * Rules:
 *  - no infinite waits: every external operation gets an explicit timeout
 *  - retries are bounded and **never applied to financial mutations** by default
 *    (a duplicated order/fill would corrupt accounting invariants)
 *  - a failing dependency trips a breaker instead of hammering a dead provider
 */
import { withTimeout } from '../observability/health.ts';

export { withTimeout };

export interface RetryOptions {
  readonly attempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  /** Deterministic backoff multiplier (no jitter needed for tests; documented). */
  readonly factor?: number;
}

export const DEFAULT_RETRY: RetryOptions = { attempts: 3, baseDelayMs: 100, maxDelayMs: 2000, factor: 2 };

/** Read-only operations may be retried; anything that moves money/state must not. */
export type OperationClass = 'read' | 'write';

export interface RetryDecision {
  readonly shouldRetry: boolean;
  readonly reason: string | null;
}

export function canRetry(op: OperationClass, attempt: number, options: RetryOptions = DEFAULT_RETRY): RetryDecision {
  if (op === 'write') return { shouldRetry: false, reason: 'write_not_retried' };
  if (attempt >= options.attempts) return { shouldRetry: false, reason: 'attempts_exhausted' };
  return { shouldRetry: true, reason: null };
}

export function backoffDelay(attempt: number, options: RetryOptions = DEFAULT_RETRY): number {
  const factor = options.factor ?? 2;
  const raw = options.baseDelayMs * Math.pow(factor, Math.max(0, attempt - 1));
  return Math.min(options.maxDelayMs, raw);
}

export interface CircuitState {
  status: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  openedAt: number | null;
  nextAttemptAt: number | null;
}

export interface CircuitOptions {
  readonly failureThreshold: number;
  readonly resetTimeoutMs: number;
}

export const DEFAULT_CIRCUIT: CircuitOptions = { failureThreshold: 5, resetTimeoutMs: 30_000 };

/**
 * Minimal circuit breaker. Pure state machine + injected clock so its transitions are
 * testable; the caller decides what "failure" means.
 */
export class CircuitBreaker {
  private state: CircuitState = { status: 'CLOSED', failures: 0, openedAt: null, nextAttemptAt: null };

  constructor(
    private readonly options: CircuitOptions = DEFAULT_CIRCUIT,
    private readonly now: () => number = () => Date.now(),
  ) {}

  current(): CircuitState {
    return { ...this.state };
  }

  /** True when a call may proceed. Transitions OPEN → HALF_OPEN after the reset window. */
  allow(): boolean {
    if (this.state.status === 'CLOSED') return true;
    const at = this.now();
    if (this.state.nextAttemptAt !== null && at >= this.state.nextAttemptAt) {
      this.state = { ...this.state, status: 'HALF_OPEN' };
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    this.state = { status: 'CLOSED', failures: 0, openedAt: null, nextAttemptAt: null };
  }

  recordFailure(): CircuitState {
    const failures = this.state.failures + 1;
    if (failures >= this.options.failureThreshold) {
      const at = this.now();
      this.state = { status: 'OPEN', failures, openedAt: at, nextAttemptAt: at + this.options.resetTimeoutMs };
    } else {
      this.state = { ...this.state, failures };
    }
    return this.current();
  }

  /** Guard wrapper: rejects immediately while OPEN with an explicit, typed failure. */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.allow()) throw new Error('CIRCUIT_OPEN');
    try {
      const out = await fn();
      this.recordSuccess();
      return out;
    } catch (e) {
      this.recordFailure();
      throw e;
    }
  }
}

/** §51 explicit resource limits — used to reject unbounded work before it starts. */
export interface LimitCheck {
  readonly ok: boolean;
  readonly reason: string | null;
}

export const DEFAULT_LIMITS = {
  maxPageSize: 200,
  maxQuerySymbols: 50,
  maxAiContextChars: 12000,
  maxJsonBodyBytes: 1_000_000,
  maxReplayCandles: 5000,
} as const;

export function checkPageSize(requested: number, max = DEFAULT_LIMITS.maxPageSize): LimitCheck {
  if (!Number.isInteger(requested) || requested < 1) return { ok: false, reason: 'invalid_page_size' };
  if (requested > max) return { ok: false, reason: 'page_size_exceeded' };
  return { ok: true, reason: null };
}

export function checkSymbolList(symbols: readonly string[], max = DEFAULT_LIMITS.maxQuerySymbols): LimitCheck {
  if (!Array.isArray(symbols)) return { ok: false, reason: 'invalid_symbol_list' };
  if (symbols.length === 0) return { ok: false, reason: 'empty_symbol_list' };
  if (symbols.length > max) return { ok: false, reason: 'symbol_limit_exceeded' };
  return { ok: true, reason: null };
}

export function checkAiContextLength(text: string, max = DEFAULT_LIMITS.maxAiContextChars): LimitCheck {
  if (typeof text !== 'string') return { ok: false, reason: 'invalid_context' };
  if (text.length > max) return { ok: false, reason: 'ai_context_too_long' };
  return { ok: true, reason: null };
}