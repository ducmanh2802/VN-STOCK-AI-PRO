/**
 * Manual backfill of canonical daily bars (separate from the scheduled EOD run).
 *
 *   npm run ingest:backfill -- --from 2025-10-13 --to 2026-10-09 [--symbols HPG,FPT]
 *
 * Writes only through the canonical ingestion path, records the run (mode BACKFILL) in
 * market_data_ingestion_runs, and verifies completeness per symbol from the database.
 * Exit codes: 0 COMPLETE · 1 PARTIAL/FAILED · 2 BLOCKED (database not configured or
 * unreachable) · 3 SKIPPED (another run holds the lock) · 64 usage error.
 */
import '../src/db/bootstrapEnv.ts';
import { runDailyBarIngestion } from '../src/services/data/DailyBarIngestionJob.ts';
import { createDatabaseIngestionDeps } from '../src/services/data/dailyIngestionRuntime.ts';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<number> {
  const from = arg('from');
  const to = arg('to');
  const symbols = arg('symbols')?.split(',').map((s) => s.trim()).filter(Boolean);
  if (!from || !to) {
    console.error('usage: npm run ingest:backfill -- --from YYYY-MM-DD --to YYYY-MM-DD [--symbols A,B]');
    return 64;
  }

  const result = await runDailyBarIngestion({ mode: 'BACKFILL', from, to, symbols }, createDatabaseIngestionDeps());

  for (const s of result.symbols) {
    console.log(
      `${s.symbol.padEnd(5)} ${s.outcome.padEnd(8)} attempts=${s.attempts} received=${s.barsReceived} inserted=${s.barsInserted} ` +
        `duplicate=${s.barsDuplicate} rejected=${s.barsRejected} missingSessions=${s.missingSessions}` +
        `${s.errorCode ? ` error=${s.errorCode}` : ''}${s.detail ? ` — ${s.detail}` : ''}`
    );
  }
  console.log(
    `RUN ${result.runId ?? '-'} ${result.status}${result.reason ? ` (${result.reason})` : ''}: ${result.detail ?? ''} ` +
      `range=${result.rangeFrom ?? '-'}..${result.rangeTo ?? '-'} recorded=${result.recorded}`
  );

  if (result.reason === 'DATABASE_NOT_CONFIGURED' || (result.reason === 'DATABASE_UNAVAILABLE' && !result.runId)) return 2;
  if (result.status === 'SKIPPED') return 3;
  if (result.reason === 'INVALID_REQUEST') return 64;
  return result.status === 'COMPLETE' ? 0 : 1;
}

main()
  .then(async (code) => {
    const { createPool } = await import('../src/db/index.ts');
    await createPool().end().catch(() => undefined);
    process.exit(code);
  })
  .catch((error) => {
    console.error('BACKFILL CRASHED:', (error as Error).message);
    process.exit(1);
  });
