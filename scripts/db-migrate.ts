/**
 * Applies the committed drizzle/*.sql migrations to the configured PostgreSQL.
 *
 *   npm run db:migrate            apply pending migrations
 *   npm run db:migrate -- --status   list APPLIED / PENDING / CHANGED, apply nothing
 *
 * Credentials: SQL_ADMIN_USER / SQL_ADMIN_PASSWORD when set (the migration pair from
 * .env.example), otherwise SQL_USER / SQL_PASSWORD. Host, port, database and TLS use the
 * same SQL_* settings as the runtime pool. Exits non-zero on any failure and never
 * prints credentials.
 */
import '../src/db/bootstrapEnv.ts';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { resolvePort, resolveSsl } from '../src/db/connectionConfig.ts';
import { applyMigrations, loadMigrationFiles, migrationStatus, type MigrationExecutor } from '../src/db/migrations.ts';

const DRIZZLE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'drizzle');

async function main(): Promise<number> {
  const statusOnly = process.argv.includes('--status');
  const user = process.env.SQL_ADMIN_USER?.trim() || process.env.SQL_USER?.trim();
  const password = process.env.SQL_ADMIN_PASSWORD?.trim() ? process.env.SQL_ADMIN_PASSWORD : process.env.SQL_PASSWORD;
  const missing = [
    ['SQL_HOST', process.env.SQL_HOST?.trim()],
    ['SQL_DB_NAME', process.env.SQL_DB_NAME?.trim()],
    ['SQL_ADMIN_USER or SQL_USER', user],
    ['SQL_ADMIN_PASSWORD or SQL_PASSWORD', password?.trim()],
  ].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) {
    console.error(`BLOCKED: database not configured. Missing: ${missing.join(', ')}. No connection attempted.`);
    return 2;
  }

  const files = loadMigrationFiles(DRIZZLE_DIR);
  const client = new pg.Client({
    host: process.env.SQL_HOST,
    port: resolvePort(),
    user,
    password,
    database: process.env.SQL_DB_NAME,
    ssl: resolveSsl(),
    connectionTimeoutMillis: 15_000,
  });
  const executor: MigrationExecutor = {
    exec: (sql) => client.query(sql),
    query: async (sql, params) => ({ rows: (await client.query(sql, params as unknown[])).rows }),
  };

  try {
    await client.connect();
    if (statusOnly) {
      for (const entry of await migrationStatus(executor, files)) console.log(`${entry.state.padEnd(8)} ${entry.name}`);
      return 0;
    }
    const result = await applyMigrations(executor, files, { log: (line) => console.log(line) });
    console.log(`done: ${result.applied.length} applied, ${result.alreadyApplied.length} already applied`);
    return 0;
  } catch (error) {
    const err = error as Error & { code?: string };
    console.error(`MIGRATION FAILED${err.code ? ` [${err.code}]` : ''}: ${err.message}`);
    return 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().then((code) => process.exit(code));
