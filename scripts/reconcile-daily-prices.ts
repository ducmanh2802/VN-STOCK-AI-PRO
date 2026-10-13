/**
 * Read-only: is every legacy `stock_daily` row represented in the canonical daily series?
 *
 *   npm run data:reconcile-daily
 *
 * Exit codes: 0 fully reconciled (safe to plan retiring stock_daily) · 1 not reconciled
 * · 2 BLOCKED (database not configured or unreachable).
 */
import '../src/db/bootstrapEnv.ts';
import { checkDatabaseConnectivity } from '../src/db/databaseHealth.ts';
import { reconcileLegacyDailyPrices } from '../src/services/data/dailyPriceReconciliation.ts';

async function main(): Promise<number> {
  const health = await checkDatabaseConnectivity();
  if (health.state !== 'CONNECTED') {
    console.error(`BLOCKED: database ${health.state}${health.missingConfiguration.length ? ` (missing ${health.missingConfiguration.join(', ')})` : ''}.`);
    return 2;
  }
  const report = await reconcileLegacyDailyPrices(new Date());
  console.log(JSON.stringify(report, null, 2));
  return report.safeToRetireLegacyTable ? 0 : 1;
}

main()
  .then(async (code) => {
    const { createPool } = await import('../src/db/index.ts');
    await createPool().end().catch(() => undefined);
    process.exit(code);
  })
  .catch((error) => {
    console.error('RECONCILIATION FAILED:', (error as { code?: string }).code ?? (error as Error).message);
    process.exit(1);
  });
