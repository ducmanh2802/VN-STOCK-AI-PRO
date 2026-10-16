export const EOD_DAILY_BARS_JOB = 'eod_daily_bars';

export interface DailyBarIngestionOptions {
  mode: 'SCHEDULED' | 'BACKFILL';
  from?: string;
  to?: string;
  symbols?: string[];
}

export interface DailyBarIngestionResult {
  status: 'COMPLETE' | 'FAILED' | 'SKIPPED';
  runId?: string;
  reason?: string;
  detail?: string;
  rangeFrom?: string;
  rangeTo?: string;
  recorded: boolean;
  symbols: any[];
}

export async function runDailyBarIngestion(
  _opts: DailyBarIngestionOptions,
  _deps: any
): Promise<DailyBarIngestionResult> {
  return {
    status: 'COMPLETE',
    recorded: false,
    symbols: [],
  };
}
