/**
 * Real market-data providers.
 *
 *   KBS — historical daily OHLCV (kbbuddywts.kbsec.com.vn)
 *   VPS — realtime quote + fundamentals (bgapidatafeed.vps.com.vn)
 *
 * No synthetic fallback lives here: failures are thrown, never masked.
 */
export * from './kbs/index.ts';
export * from './vps/index.ts';