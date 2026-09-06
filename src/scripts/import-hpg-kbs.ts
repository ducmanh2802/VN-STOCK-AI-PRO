/**
 * PHASE 8.5B.4 STEP 3/4 — Import real KBS daily OHLCV for HPG into PostgreSQL.
 *
 * - Source: KBS Securities data_day endpoint (real vendor data, no synthetic).
 * - Range:  01-01-2025 → 01-09-2026 (ISO: 2025-01-01 → 2026-09-01).
 * - Idempotent: batchUpsertDaily uses ON CONFLICT (stock_id, date) DO UPDATE,
 *   so running twice yields the same row count.
 * - Honest failure: if PostgreSQL is not configured/reachable, prints the exact
 *   blocker and exits non-zero. NEVER fabricates success.
 */
import * as dotenv from 'dotenv';

dotenv.config();

import { KbsHistoricalProvider } from '../services/market/providers/kbs/KbsHistoricalProvider.ts';
import { StockRepository, PriceRepository } from '../lib/db/index.ts';
import { db } from '../db/index.ts';
import { stockDaily } from '../db/schema.ts';
import { eq, sql } from 'drizzle-orm';

const SYMBOL = 'HPG';
const START_ISO = '2025-01-01';
const END_ISO = '2026-09-01';

/** Accurate, publicly-known listing facts for HPG (Hòa Phát Group, HOSE). */
const HPG_METADATA = {
  symbol: 'HPG',
  companyName: 'Tập đoàn Hòa Phát',
  exchange: 'HOSE',
  sector: 'Thép',
} as const;

function countInvalidOhlc(bars: { open: number; high: number; low: number; close: number; volume: number }[]): number {
  return bars.filter(
    (b) =>
      b.low > b.high ||
      b.open > b.high ||
      b.open < b.low ||
      b.close > b.high ||
      b.close < b.low ||
      b.volume < 0 ||
      !Number.isFinite(b.open) ||
      !Number.isFinite(b.high) ||
      !Number.isFinite(b.low) ||
      !Number.isFinite(b.close)
  ).length;
}

async function main() {
  console.log('=== PHASE 8.5B.4 — HPG KBS IMPORT ===');

  // ---- 0. DB configuration gate (fail fast, exact blocker) ----
  const requiredEnv = ['SQL_HOST', 'SQL_USER', 'SQL_PASSWORD', 'SQL_DB_NAME'] as const;
  const missing = requiredEnv.filter((k) => !process.env[k] || process.env[k]!.trim() === '');
  if (missing.length > 0) {
    console.error(`BLOCKER: PostgreSQL is not configured. Missing env vars: ${missing.join(', ')}`);
    console.error('Looked in .env (empty) and process environment. No connection attempted.');
    process.exit(1);
  }

  // ---- 1. Fetch REAL data from KBS ----
  console.log(`[1/4] Fetching ${SYMBOL} from KBS (${START_ISO} → ${END_ISO})...`);
  const bars = await KbsHistoricalProvider.getDailyHistory(SYMBOL, START_ISO, END_ISO, { timeoutMs: 60_000 });
  console.log(`      Received ${bars.length} bars from KBS.`);
  if (bars.length === 0) {
    console.error('BLOCKER: KBS returned 0 bars for the requested range. Nothing to import.');
    process.exit(1);
  }

  const kbsInvalid = countInvalidOhlc(bars);
  console.log(`      Invalid OHLC bars in KBS payload: ${kbsInvalid}`);
  if (kbsInvalid > 0) {
    console.error('BLOCKER: KBS payload contains structurally invalid bars. Refusing to import.');
    process.exit(1);
  }

  // ---- 2. Verify DB connectivity before writing ----
  try {
    await db.execute(sql`SELECT 1`);
  } catch (err: any) {
    console.error('BLOCKER: PostgreSQL is not reachable.');
    console.error(`  host=${process.env.SQL_HOST} db=${process.env.SQL_DB_NAME} user=${process.env.SQL_USER}`);
    console.error(`  ${err.message}`);
    process.exit(1);
  }
  console.log('[2/4] PostgreSQL connection verified.');

  // ---- 3. Ensure HPG exists in stocks (no invented metadata) ----
  const existing = await StockRepository.getBySymbol(SYMBOL);
  let stockId: number;
  if (existing) {
    stockId = existing.id;
    console.log(`[3/4] ${SYMBOL} already in stocks (id=${stockId}, company=${existing.companyName}).`);
  } else {
    const inserted = await StockRepository.upsert({ ...HPG_METADATA });
    stockId = inserted.id;
    console.log(`[3/4] Inserted ${SYMBOL} into stocks (id=${stockId}).`);
  }

  // ---- 4. Idempotent upsert into stock_daily ----
  const CHUNK = 200;
  let upserted = 0;
  for (let i = 0; i < bars.length; i += CHUNK) {
    const chunk = bars.slice(i, i + CHUNK);
    const records = chunk.map((b) => ({
      stockId,
      date: b.date,
      open: String(b.open),
      high: String(b.high),
      low: String(b.low),
      close: String(b.close),
      volume: b.volume,
      value: String(b.value),
    }));
    await PriceRepository.batchUpsertDaily(records);
    upserted += records.length;
    console.log(`      upserted ${upserted}/${bars.length}`);
  }

  // ---- Verification ----
  const rows = await db
    .select()
    .from(stockDaily)
    .where(eq(stockDaily.stockId, stockId))
    .orderBy(stockDaily.date);

  const dates = rows.map((r) => r.date);
  const duplicates = dates.length - new Set(dates).size;
  const dbBars = rows.map((r) => ({
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    volume: Number(r.volume),
  }));

  console.log('--- VERIFICATION ---');
  console.log(`ROWS_TOTAL:       ${rows.length}`);
  console.log(`EARLIEST_DATE:    ${dates[0] ?? 'N/A'}`);
  console.log(`LATEST_DATE:      ${dates[dates.length - 1] ?? 'N/A'}`);
  console.log(`DUPLICATES:       ${duplicates}`);
  console.log(`NULL_OHLC_COUNT:  ${rows.filter((r) => !r.open || !r.high || !r.low || !r.close).length}`);
  console.log(`INVALID_OHLC:     ${countInvalidOhlc(dbBars)}`);
  console.log('FIRST 3:');
  for (const r of rows.slice(0, 3)) {
    console.log(`  ${r.date} O=${r.open} H=${r.high} L=${r.low} C=${r.close} V=${r.volume}`);
  }
  console.log('LAST 3:');
  for (const r of rows.slice(-3)) {
    console.log(`  ${r.date} O=${r.open} H=${r.high} L=${r.low} C=${r.close} V=${r.volume}`);
  }

  const { createPool } = await import('../db/index.ts');
  await createPool().end();
  console.log('=== IMPORT COMPLETE (idempotent: re-run produces same row count) ===');
  process.exit(0);
}

main().catch((err: any) => {
  console.error('IMPORT FAILED:', err.name || 'Error', '-', err.message);
  process.exit(1);
});
