/**
 * PLATFORM-05 — GRACEFUL SHUTDOWN (§48)
 *
 * Order matters and is explicit:
 *   1. stop accepting NEW work (health → not ready)
 *   2. drain in-flight requests up to a deadline
 *   3. stop background jobs / replays (via injected hook)
 *   4. close the database pool (via injected hook)
 *   5. exit
 *
 * The coordinator is pure and callback-injected, so the whole sequence — including
 * timeout behaviour on a stuck drain — is unit tested without binding a socket.
 * It never calls process.exit itself; the caller owns the process lifetime.
 */
import type { CircuitState } from '../resilience/resilience.ts';

export type ShutdownPhase =
  | 'IDLE'
  | 'MARK_NOT_READY'
  | 'DRAINING'
  | 'STOPPING_JOBS'
  | 'CLOSING_DB'
  | 'STOPPED';

export interface ShutdownHooks {
  /** Flip readiness to false so the load balancer stops sending traffic. */
  markNotReady(): Promise<void> | void;
  /** Wait for in-flight work. Must resolve when drained or reject/timeout on stuck work. */
  drain(timeoutMs: number): Promise<void> | void;
  /** Stop replays/jobs *before* the DB closes, so nothing writes to a closed pool. */
  stopJobs(): Promise<void> | void;
  /** Close the database pool last. */
  closeDatabase(): Promise<void> | void;
}

export interface ShutdownResult {
  readonly phase: ShutdownPhase;
  readonly drainedCleanly: boolean;
  readonly timedOut: boolean;
  readonly errors: readonly string[];
  readonly sequence: readonly ShutdownPhase[];
}

export class GracefulShutdownCoordinator {
  private phase: ShutdownPhase = 'IDLE';

  constructor(private readonly hooks: ShutdownHooks) {}

  current(): ShutdownPhase {
    return this.phase;
  }

  async shutdown(timeoutMs: number): Promise<ShutdownResult> {
    const sequence: ShutdownPhase[] = [];
    const errors: string[] = [];
    let drainedCleanly = false;
    let timedOut = false;

    const step = async (phase: ShutdownPhase, fn: () => Promise<void> | void): Promise<void> => {
      this.phase = phase;
      sequence.push(phase);
      try {
        await fn();
      } catch (e) {
        // A failed step is recorded but never aborts the sequence: the DB must still close.
        errors.push(`${phase}:${e instanceof Error ? e.message : String(e)}`);
      }
    };

    await step('MARK_NOT_READY', () => this.hooks.markNotReady());

    try {
      await withDeadline(this.hooks.drain(timeoutMs), timeoutMs);
      drainedCleanly = true;
    } catch {
      timedOut = true;
      errors.push('DRAINING:timeout');
    } finally {
      sequence.push('DRAINING');
    }

    await step('STOPPING_JOBS', () => this.hooks.stopJobs());
    await step('CLOSING_DB', () => this.hooks.closeDatabase());

    this.phase = 'STOPPED';
    sequence.push('STOPPED');

    return { phase: 'STOPPED', drainedCleanly, timedOut, errors, sequence };
  }
}

function withDeadline(work: Promise<void> | void, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('DRAIN_TIMEOUT'));
      }
    }, timeoutMs);
    Promise.resolve(work).then(
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      },
      (e) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** SIGTERM/SIGINT are handled once; repeated signals force the caller's fast path. */
export function installSignalHandlers(input: {
  readonly coordinator: GracefulShutdownCoordinator;
  readonly timeoutMs: number;
  readonly signals?: readonly NodeJS.Signals[];
  readonly onComplete: (result: ShutdownResult) => void;
  readonly register?: (signal: NodeJS.Signals, handler: () => void) => () => void;
}): () => void {
  const signals = input.signals ?? (['SIGTERM', 'SIGINT'] as NodeJS.Signals[]);
  const register = input.register ?? ((signal, handler) => {
    process.once(signal, handler);
    return () => process.removeListener(signal, handler);
  });
  const disposers = signals.map((signal) =>
    register(signal, () => {
      void input.coordinator.shutdown(input.timeoutMs).then(input.onComplete);
    }),
  );
  return () => disposers.forEach((d) => d());
}

/** Re-exported for callers that report breaker state during shutdown diagnostics. */
export type { CircuitState };