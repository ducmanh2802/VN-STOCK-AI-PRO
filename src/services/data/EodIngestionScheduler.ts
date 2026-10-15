/**
 * END-OF-DAY INGESTION SCHEDULER (in-process)
 * ===========================================
 * Triggers the SCHEDULED daily-bar run once per trading day at a fixed exchange-local
 * time. No new infrastructure: a timer in the server process, opt-in via environment.
 *
 *   EOD_INGEST_ENABLED=true      turn it on (default off)
 *   EOD_INGEST_TIME_ICT=17:30    run time, Asia/Ho_Chi_Minh (default 17:30, after the
 *                                16:00 session-finalization time)
 *
 * - Fires only on trading days of the statutory calendar; stops scheduling (and says
 *   why) when the calendar does not cover the coming dates.
 * - On start it catches up: if the last final session was never completed, one run is
 *   triggered shortly after boot.
 * - A tick that arrives while a run is in progress is skipped (in-process guard); the
 *   job's advisory lock prevents overlap across processes.
 * Vietnam has no DST, so the ICT offset is a constant UTC+7.
 */
import { addCalendarDays, isCalendarCovered, isVnTradingDay, vnLocalParts } from '../../lib/data/vnTradingCalendar.ts';
import type { DailyIngestionResult } from './DailyBarIngestionJob.ts';

const ICT_OFFSET_MINUTES = 7 * 60;
export const DEFAULT_EOD_TIME_MINUTES = 17 * 60 + 30;

export interface EodSchedulerConfig {
  readonly enabled: boolean;
  /** Minutes after local midnight (ICT). */
  readonly timeOfDayMinutes: number;
  readonly catchUpOnStart: boolean;
  readonly startupDelayMs: number;
}

export function readEodSchedulerConfig(env: Record<string, string | undefined> = process.env): EodSchedulerConfig {
  const raw = env.EOD_INGEST_TIME_ICT?.trim();
  const match = raw ? /^([01]\d|2[0-3]):([0-5]\d)$/.exec(raw) : null;
  return {
    enabled: (env.EOD_INGEST_ENABLED ?? '').trim().toLowerCase() === 'true',
    timeOfDayMinutes: match ? Number(match[1]) * 60 + Number(match[2]) : DEFAULT_EOD_TIME_MINUTES,
    catchUpOnStart: (env.EOD_INGEST_CATCH_UP ?? 'true').trim().toLowerCase() !== 'false',
    startupDelayMs: 60_000,
  };
}

/**
 * The first run instant strictly after `after`: a trading day at `timeOfDayMinutes`
 * ICT. Null when the calendar does not cover the next 21 days (no guessing).
 */
export function nextScheduledRun(after: Date, timeOfDayMinutes: number): Date | null {
  let date = vnLocalParts(after).date;
  for (let i = 0; i <= 21; i++, date = addCalendarDays(date, 1)) {
    if (!isCalendarCovered(date)) return null;
    if (!isVnTradingDay(date)) continue;
    const [y, m, d] = date.split('-').map(Number) as [number, number, number];
    const at = new Date(Date.UTC(y, m - 1, d) + (timeOfDayMinutes - ICT_OFFSET_MINUTES) * 60_000);
    if (at.getTime() > after.getTime()) return at;
  }
  return null;
}

export interface EodSchedulerStatus {
  readonly enabled: boolean;
  readonly running: boolean;
  readonly nextRunAt: string | null;
  readonly blockedReason: string | null;
  readonly lastResult: DailyIngestionResult | null;
}

interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const realTimers: Timers = {
  setTimeout: (fn, ms) => {
    const handle = setTimeout(fn, ms);
    (handle as { unref?: () => void }).unref?.();
    return handle;
  },
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** setTimeout cannot exceed 2^31-1 ms; longer waits are re-armed. */
const MAX_TIMER_MS = 2_147_000_000;

export class EodIngestionScheduler {
  private timer: unknown = null;
  private running = false;
  private stopped = true;
  private nextRunAt: Date | null = null;
  private blockedReason: string | null = null;
  private lastResult: DailyIngestionResult | null = null;

  constructor(
    private readonly runJob: () => Promise<DailyIngestionResult>,
    private readonly config: EodSchedulerConfig,
    private readonly options: {
      readonly now?: () => Date;
      readonly timers?: Timers;
      /** Whether the last final session still needs a run (checked on start). */
      readonly needsCatchUp?: () => Promise<boolean>;
      readonly log?: (line: string) => void;
    } = {}
  ) {}

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  private get timers(): Timers {
    return this.options.timers ?? realTimers;
  }

  private log(line: string): void {
    (this.options.log ?? ((l: string) => console.log(`[eod-ingest] ${l}`)))(line);
  }

  async start(): Promise<void> {
    if (!this.config.enabled || !this.stopped) return;
    this.stopped = false;
    if (this.config.catchUpOnStart && this.options.needsCatchUp) {
      let needed = false;
      try {
        needed = await this.options.needsCatchUp();
      } catch (error) {
        this.log(`catch-up check failed: ${(error as Error).message}`);
      }
      if (needed) {
        this.arm(new Date(this.now().getTime() + this.config.startupDelayMs));
        return;
      }
    }
    this.scheduleNext();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    this.timer = null;
    this.nextRunAt = null;
  }

  status(): EodSchedulerStatus {
    return {
      enabled: this.config.enabled,
      running: this.running,
      nextRunAt: this.nextRunAt?.toISOString() ?? null,
      blockedReason: this.blockedReason,
      lastResult: this.lastResult,
    };
  }

  /** Runs once now unless a run is already in progress (then returns null). */
  async runNow(): Promise<DailyIngestionResult | null> {
    if (this.running) {
      this.log('tick skipped: previous run still in progress');
      return null;
    }
    this.running = true;
    try {
      this.lastResult = await this.runJob();
      this.log(`run ${this.lastResult.runId ?? '-'}: ${this.lastResult.status}${this.lastResult.reason ? ` (${this.lastResult.reason})` : ''} — ${this.lastResult.detail ?? ''}`);
      return this.lastResult;
    } catch (error) {
      this.log(`run crashed: ${(error as Error).message}`);
      return null;
    } finally {
      this.running = false;
    }
  }

  private scheduleNext(): void {
    if (this.stopped) return;
    const next = nextScheduledRun(this.now(), this.config.timeOfDayMinutes);
    if (!next) {
      this.blockedReason = 'CALENDAR_NOT_COVERED: extend STATUTORY_VIETNAM_HOLIDAYS before more runs can be scheduled.';
      this.nextRunAt = null;
      this.log(this.blockedReason);
      return;
    }
    this.blockedReason = null;
    this.arm(next);
  }

  private arm(at: Date): void {
    if (this.stopped) return;
    this.nextRunAt = at;
    const delay = Math.max(0, at.getTime() - this.now().getTime());
    this.timer = this.timers.setTimeout(() => {
      this.timer = null;
      if (delay > MAX_TIMER_MS) {
        this.arm(at);
        return;
      }
      void this.runNow().finally(() => this.scheduleNext());
    }, Math.min(delay, MAX_TIMER_MS));
  }
}
