/**
 * Test-only: a disposable in-process PostgreSQL (PGlite) built ONLY from the committed
 * migrations, exposed through drizzle exactly like `src/db/index.ts` exposes `db`.
 *
 * Use from a test file:
 *   vi.mock('<relative>/db/index.ts', async () =>
 *     (await import('<relative>/db/__tests__/pgliteHarness.ts')).mockDbModule());
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../schema.ts';
import { applyMigrations, loadMigrationFiles } from '../migrations.ts';

const DRIZZLE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'drizzle');

export async function createMigratedPglite() {
  const client = new PGlite();
  await applyMigrations(
    { exec: (sql) => client.exec(sql), query: async (sql, params) => ({ rows: (await client.query(sql, params)).rows as never[] }) },
    loadMigrationFiles(DRIZZLE_DIR)
  );
  return { client, db: drizzle(client, { schema }) };
}

/** A replacement for the `src/db/index.ts` module backed by a fresh migrated PGlite. */
export async function mockDbModule() {
  const { client, db } = await createMigratedPglite();
  return {
    db,
    schema,
    createPool: () => {
      throw new Error('createPool() is not available in PGlite-backed tests');
    },
    __pglite: client,
  };
}

export const TEST_DATABASE_ENV = {
  SQL_HOST: 'pglite.test',
  SQL_USER: 'test',
  SQL_PASSWORD: 'test',
  SQL_DB_NAME: 'test',
} as const;

/** Sets the SQL_* variables the configuration gates require; returns a restore function. */
export function withTestDatabaseEnv(): () => void {
  const previous = Object.fromEntries(Object.keys(TEST_DATABASE_ENV).map((k) => [k, process.env[k]]));
  Object.assign(process.env, TEST_DATABASE_ENV);
  return () => {
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
}
