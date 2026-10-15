/**
 * PHASE 8.5B.4 — HPG KBS import (kept for the documented command).
 *
 * This script used to upsert into `stock_daily`, which made it a second, provenance-
 * free writer of daily prices. Daily OHLCV now has ONE write path: the canonical
 * ingestion service, persisted to `canonical_market_bars` with provenance and quality.
 * The script therefore delegates to the canonical backfill for the same symbol and
 * range, and never touches `stock_daily` again.
 *
 * Equivalent: npm run ingest:backfill -- --symbols HPG --from 2025-01-01 --to 2026-09-01
 */
import '../db/bootstrapEnv.ts';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const result = spawnSync(
  process.execPath,
  [
    path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
    path.join(root, 'scripts', 'backfill-daily-bars.ts'),
    '--symbols', 'HPG',
    '--from', '2025-01-01',
    '--to', '2026-09-01',
  ],
  { stdio: 'inherit' }
);
process.exit(result.status ?? 1);
