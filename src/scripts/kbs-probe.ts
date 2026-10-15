/**
 * Live probe of the KBS historical endpoint — validates the adapter against
 * the real vendor API. Read-only, no DB required.
 */
import { KbsHistoricalProvider } from '../services/market/providers/kbs/KbsHistoricalProvider.ts';

async function main() {
  const symbol = (process.argv[2] || 'HPG').toUpperCase();
  const start = process.argv[3] || '2026-08-24';
  const end = process.argv[4] || '2026-09-05';

  console.log(`Probing KBS: ${symbol} [${start} .. ${end}]`);
  try {
    const bars = await KbsHistoricalProvider.getDailyHistory(symbol, start, end, { timeoutMs: 20000 });
    console.log(`RECEIVED ${bars.length} bars`);
    if (bars.length > 0) {
      console.log('FIRST 3:');
      for (const b of bars.slice(0, 3)) console.log(' ', JSON.stringify(b));
      console.log('LAST 3:');
      for (const b of bars.slice(-3)) console.log(' ', JSON.stringify(b));
      const invalid = bars.filter(
        (b) => b.low > b.high || b.open > b.high || b.open < b.low || b.close > b.high || b.close < b.low || b.volume < 0
      );
      console.log('INVALID_OHLC_BARS:', invalid.length);
    } else {
      console.log('EMPTY data_day (vendor returned no bars for range)');
    }
    process.exit(0);
  } catch (err: any) {
    console.error('PROBE FAILED:', err.name, '-', err.message);
    process.exit(1);
  }
}

main();
