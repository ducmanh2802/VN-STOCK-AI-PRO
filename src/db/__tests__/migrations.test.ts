/**
 * MIGRATION REPRODUCIBILITY
 * =========================
 * Builds a brand-new database ONLY from the committed drizzle/*.sql files and checks
 * it against every Drizzle declaration. Runs on PGlite (PostgreSQL compiled to WASM,
 * in-process), so no server or credentials are needed; it is a real PostgreSQL parser
 * and planner, not a mock.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import * as coreSchema from '../schema.ts';
import * as businessSchema from '../business/schema.ts';
import {
  applyMigrations,
  checksumOf,
  loadMigrationFiles,
  migrationStatus,
  MIGRATIONS_TABLE,
  type MigrationExecutor,
} from '../migrations.ts';
import { compareSchemaToDatabase, declaredTables } from '../schemaConsistency.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DRIZZLE_DIR = path.join(REPO_ROOT, 'drizzle');

/**
 * Tables created by migrations that the application never declared in Drizzle and
 * never reads (0010/0011/0012 business extras). Listed explicitly so that any NEW
 * undeclared table fails this suite instead of drifting in silently.
 */
const SQL_ONLY_TABLES = [
  MIGRATIONS_TABLE,
  'marketplace_purchases',
  'marketplace_creator_economics',
  'business_training_assignments',
  'business_org_analytics_snapshots',
  'business_reconciliation_findings',
];

function pgliteExecutor(db: PGlite): MigrationExecutor {
  return {
    exec: (sql) => db.exec(sql),
    query: async <T,>(sql: string, params?: unknown[]) => ({ rows: (await db.query<T>(sql, params)).rows }),
  };
}

describe('committed migrations build a complete database from scratch', () => {
  const files = loadMigrationFiles(DRIZZLE_DIR);
  let db: PGlite;
  let executor: MigrationExecutor;
  let firstRun: Awaited<ReturnType<typeof applyMigrations>>;

  beforeAll(async () => {
    db = new PGlite();
    executor = pgliteExecutor(db);
    firstRun = await applyMigrations(executor, files);
  }, 120_000);

  it('applies every file, in order, on an empty database', () => {
    expect(firstRun.applied).toEqual(files.map((f) => f.name));
    expect(firstRun.alreadyApplied).toEqual([]);
  });

  it('a second run is a no-op recorded by the ledger', async () => {
    const second = await applyMigrations(executor, files);
    expect(second.applied).toEqual([]);
    expect(second.alreadyApplied).toHaveLength(files.length);
    expect((await migrationStatus(executor, files)).every((s) => s.state === 'APPLIED')).toBe(true);
  });

  it('every file is idempotent, so databases migrated before the ledger existed are safe', async () => {
    for (const file of files) {
      await expect(db.exec(file.sql), file.name).resolves.toBeDefined();
    }
  });

  it('every Drizzle declaration (core + business) matches the migrated database', async () => {
    const tables = declaredTables(coreSchema, businessSchema);
    expect(tables.length).toBeGreaterThanOrEqual(60);
    const differences = await compareSchemaToDatabase(executor, tables, { sqlOnlyTables: SQL_ONLY_TABLES });
    expect(differences, JSON.stringify(differences, null, 2)).toEqual([]);
  });

  it('the trading-relevant core tables now exist (previously push-only)', async () => {
    const { rows } = await db.query<{ name: string }>(
      `SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public'`
    );
    const names = new Set(rows.map((r) => r.name));
    for (const t of ['users', 'stocks', 'stock_daily', 'portfolios', 'signals', 'alerts', 'canonical_market_bars']) {
      expect(names.has(t), t).toBe(true);
    }
  });
});

describe('migration runner safety', () => {
  const files = loadMigrationFiles(DRIZZLE_DIR);

  it('refuses to proceed when an applied file was edited afterwards', async () => {
    const db = new PGlite();
    const executor = pgliteExecutor(db);
    await applyMigrations(executor, files.slice(0, 1));
    const edited = [{ ...files[0], sql: `${files[0].sql}\n-- edited`, checksum: checksumOf(`${files[0].sql}\n-- edited`) }];
    await expect(applyMigrations(executor, edited)).rejects.toThrow(/changed on disk/);
    expect((await migrationStatus(executor, edited))[0].state).toBe('CHANGED');
  });

  it('rolls a failing file back completely, ledger row included', async () => {
    const db = new PGlite();
    const executor = pgliteExecutor(db);
    const broken = [{ id: 0, name: '0000_broken.sql', checksum: 'x', sql: 'CREATE TABLE half_done (id int); SELECT * FROM no_such_table;' }];
    await expect(applyMigrations(executor, broken)).rejects.toThrow(/0000_broken\.sql failed and was rolled back/);
    expect((await db.query(`SELECT to_regclass('half_done') AS t`)).rows[0]).toEqual({ t: null });
    expect((await db.query(`SELECT count(*)::int AS n FROM ${MIGRATIONS_TABLE}`)).rows[0]).toEqual({ n: 0 });
  });

  it('rejects gaps and duplicate ids in the migration set', () => {
    const ids = files.map((f) => f.id);
    expect(ids).toEqual(ids.map((_, i) => i));
  });

  it('drizzle-kit is pointed at every declaration file, including billing', () => {
    const config = readFileSync(path.join(REPO_ROOT, 'drizzle.config.ts'), 'utf8');
    expect(config).toContain("'./src/db/schema.ts'");
    expect(config).toContain("'./src/db/business/schema.ts'");
  });

  it('migrations never drop or truncate', () => {
    for (const file of files) {
      const statements = file.sql.split('\n').filter((l) => !l.trim().startsWith('--'));
      expect(statements.join('\n'), file.name).not.toMatch(/\bDROP\s+TABLE\b|\bTRUNCATE\b|\bDELETE\s+FROM\b|DROP\s+COLUMN/i);
    }
  });
});
