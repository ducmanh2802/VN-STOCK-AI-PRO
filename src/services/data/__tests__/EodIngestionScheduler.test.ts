import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_EOD_TIME_MINUTES,
  EodIngestionScheduler,
  nextScheduledRun,
  readEodSchedulerConfig,
  type EodSchedulerConfig,
} from '../EodIngestionScheduler.ts';
import type { DailyIngestionResult } from '../DailyBarIngestionJob.ts';

const AT_1730 = 17 * 60 + 30;

describe('nextScheduledRun (Asia/Ho_Chi_Minh, statutory calendar)', () => {
  it('later the same trading day', () => {
    // Fri 2026-04-10 10:00 ICT -> 17:30 ICT = 10:30Z
    expect(nextScheduledRun(new Date('2026-04-10T03:00:00Z'), AT_1730)?.toISOString()).toBe('2026-04-10T10:30:00.000Z');
  });

  it('skips the weekend', () => {
    // Fri 18:00 ICT -> Mon 2026-04-13 17:30 ICT
    expect(nextScheduledRun(new Date('2026-04-10T11:00:00Z'), AT_1730)?.toISOString()).toBe('2026-04-13T10:30:00.000Z');
  });

  it('skips the Tết closure', () => {
    // Fri 2026-02-13 18:00 ICT -> Mon 2026-02-23 (16–20 Feb closed)
    expect(nextScheduledRun(new Date('2026-02-13T11:00:00Z'), AT_1730)?.toISOString()).toBe('2026-02-23T10:30:00.000Z');
  });

  it('refuses to guess beyond the calendar it knows', () => {
    expect(nextScheduledRun(new Date('2027-12-30T11:00:00Z'), AT_1730)?.toISOString()).toBe('2027-12-31T10:30:00.000Z');
    expect(nextScheduledRun(new Date('2027-12-31T11:00:00Z'), AT_1730)).toBeNull();
  });
});

describe('readEodSchedulerConfig', () => {
  it('is off unless explicitly enabled, and parses HH:MM', () => {
    expect(readEodSchedulerConfig({}).enabled).toBe(false);
    expect(readEodSchedulerConfig({}).timeOfDayMinutes).toBe(DEFAULT_EOD_TIME_MINUTES);
    const c = readEodSchedulerConfig({ EOD_INGEST_ENABLED: 'true', EOD_INGEST_TIME_ICT: '18:05' });
    expect(c).toMatchObject({ enabled: true, timeOfDayMinutes: 18 * 60 + 5, catchUpOnStart: true });
    expect(readEodSchedulerConfig({ EOD_INGEST_TIME_ICT: '25:00' }).timeOfDayMinutes).toBe(DEFAULT_EOD_TIME_MINUTES);
  });
});

function fakeTimers() {
  const armed: { fn: () => void; ms: number }[] = [];
  return {
    armed,
    timers: {
      setTimeout: (fn: () => void, ms: number) => {
        armed.push({ fn, ms });
        return armed.length;
      },
      clearTimeout: vi.fn(),
    },
  };
}

const config: EodSchedulerConfig = { enabled: true, timeOfDayMinutes: AT_1730, catchUpOnStart: true, startupDelayMs: 60_000 };
const result = (status: DailyIngestionResult['status']) => ({ status, reason: null, runId: 'r1', detail: 'x' }) as DailyIngestionResult;

describe('EodIngestionScheduler', () => {
  it('arms the next trading-day run and re-arms after it', async () => {
    let now = new Date('2026-04-10T03:00:00Z');
    const { armed, timers } = fakeTimers();
    const runJob = vi.fn(async () => result('COMPLETE'));
    const scheduler = new EodIngestionScheduler(runJob, { ...config, catchUpOnStart: false }, { now: () => now, timers, log: () => undefined });
    await scheduler.start();
    expect(armed[0]?.ms).toBe(7.5 * 60 * 60 * 1000);
    expect(scheduler.status().nextRunAt).toBe('2026-04-10T10:30:00.000Z');

    now = new Date('2026-04-10T10:30:00Z');
    armed[0]!.fn();
    await vi.waitFor(() => expect(armed).toHaveLength(2));
    expect(runJob).toHaveBeenCalledTimes(1);
    expect(scheduler.status().lastResult?.status).toBe('COMPLETE');
    expect(scheduler.status().nextRunAt).toBe('2026-04-13T10:30:00.000Z');
  });

  it('catches up shortly after start when the last final session was never completed', async () => {
    const { armed, timers } = fakeTimers();
    const scheduler = new EodIngestionScheduler(async () => result('COMPLETE'), config, {
      now: () => new Date('2026-04-10T03:00:00Z'),
      timers,
      needsCatchUp: async () => true,
      log: () => undefined,
    });
    await scheduler.start();
    expect(armed[0]?.ms).toBe(60_000);
  });

  it('skips a tick while a run is still in progress', async () => {
    let finish!: (r: DailyIngestionResult) => void;
    const runJob = vi.fn(() => new Promise<DailyIngestionResult>((r) => (finish = r)));
    const scheduler = new EodIngestionScheduler(runJob, config, { log: () => undefined, timers: fakeTimers().timers });
    const first = scheduler.runNow();
    expect(await scheduler.runNow()).toBeNull();
    expect(runJob).toHaveBeenCalledTimes(1);
    finish(result('PARTIAL'));
    expect((await first)?.status).toBe('PARTIAL');
  });

  it('does nothing when disabled', async () => {
    const { armed, timers } = fakeTimers();
    const scheduler = new EodIngestionScheduler(async () => result('COMPLETE'), { ...config, enabled: false }, { timers });
    await scheduler.start();
    expect(armed).toHaveLength(0);
    expect(scheduler.status()).toMatchObject({ enabled: false, nextRunAt: null });
  });

  it('stops scheduling, explicitly, when the calendar runs out', async () => {
    const { armed, timers } = fakeTimers();
    const scheduler = new EodIngestionScheduler(async () => result('COMPLETE'), { ...config, catchUpOnStart: false }, {
      now: () => new Date('2027-12-31T11:00:00Z'),
      timers,
      log: () => undefined,
    });
    await scheduler.start();
    expect(armed).toHaveLength(0);
    expect(scheduler.status().blockedReason).toMatch(/CALENDAR_NOT_COVERED/);
  });
});
