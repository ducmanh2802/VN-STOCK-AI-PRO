/**
 * SQL MIGRATION RUNNER
 * ====================
 * The committed `drizzle/NNNN_*.sql` files are the schema of record. This runner
 * applies them in numeric order — each file in its own transaction together with its
 * ledger row — and records `(filename, checksum)` in `schema_migrations`.
 *
 * Safety properties:
 * - Additive by construction: it only executes the committed files; it never diffs,
 *   drops or rewrites anything on its own (unlike `drizzle-kit push`).
 * - Every committed file is idempotent (IF NOT EXISTS / guarded DO blocks), so the
 *   first tracked run against a database that was migrated by hand before this ledger
 *   existed simply re-confirms each file.
 * - A file whose content changed after it was applied is reported as CHANGED and stops
 *   the run; it is never silently re-applied.
 * - A session advisory lock prevents two concurrent runs.
 *
 * Driver-agnostic: production passes a `pg` client, tests pass an in-process PGlite.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export interface MigrationExecutor {
  /** Runs one or more parameterless statements. */
  exec(sql: string): Promise<unknown>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface MigrationFile {
  readonly id: number;
  readonly name: string;
  readonly checksum: string;
  readonly sql: string;
}

export type MigrationState = 'APPLIED' | 'PENDING' | 'CHANGED';

export interface MigrationStatusEntry {
  readonly name: string;
  readonly state: MigrationState;
}

export const MIGRATIONS_TABLE = 'schema_migrations';

/** Arbitrary constant key for pg_try_advisory_lock; one runner at a time. */
const MIGRATION_LOCK_KEY = 7_214_011;

const FILE_PATTERN = /^(\d{4})_[a-z0-9_]+\.sql$/;

/** sha256 of the file with line endings normalized, so a CRLF checkout matches. */
export function checksumOf(sql: string): string {
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
}

/** Loads and validates the migration set: contiguous ids from 0000, no duplicates. */
export function loadMigrationFiles(dir: string): MigrationFile[] {
  const names = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const files = names.map((name) => {
    const match = FILE_PATTERN.exec(name);
    if (!match) throw new Error(`Migration file name does not match NNNN_name.sql: ${name}`);
    const sql = readFileSync(path.join(dir, name), 'utf8');
    return { id: Number(match[1]), name, checksum: checksumOf(sql), sql };
  });
  files.forEach((f, index) => {
    if (f.id !== index) {
      throw new Error(`Migration ids must be contiguous from 0000: expected ${String(index).padStart(4, '0')}, found ${f.name}`);
    }
  });
  return files;
}

async function ensureLedger(executor: MigrationExecutor): Promise<void> {
  await executor.exec(`CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
    filename TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );`);
}

async function appliedChecksums(executor: MigrationExecutor): Promise<Map<string, string>> {
  const { rows } = await executor.query<{ filename: string; checksum: string }>(
    `SELECT filename, checksum FROM ${MIGRATIONS_TABLE}`
  );
  return new Map(rows.map((r) => [r.filename, r.checksum]));
}

function statusOf(files: readonly MigrationFile[], applied: Map<string, string>): MigrationStatusEntry[] {
  return files.map((f) => {
    const recorded = applied.get(f.name);
    return { name: f.name, state: recorded === undefined ? 'PENDING' : recorded === f.checksum ? 'APPLIED' : 'CHANGED' };
  });
}

/** Read-only: reports each file as APPLIED, PENDING or CHANGED. */
export async function migrationStatus(
  executor: MigrationExecutor,
  files: readonly MigrationFile[]
): Promise<MigrationStatusEntry[]> {
  const { rows } = await executor.query<{ exists: string | null }>(`SELECT to_regclass('${MIGRATIONS_TABLE}')::text AS exists`);
  const applied = rows[0]?.exists ? await appliedChecksums(executor) : new Map<string, string>();
  return statusOf(files, applied);
}

export async function applyMigrations(
  executor: MigrationExecutor,
  files: readonly MigrationFile[],
  options: { log?: (line: string) => void } = {}
): Promise<{ applied: string[]; alreadyApplied: string[] }> {
  const log = options.log ?? (() => undefined);
  const lock = await executor.query<{ locked: boolean }>('SELECT pg_try_advisory_lock($1) AS locked', [MIGRATION_LOCK_KEY]);
  if (!lock.rows[0]?.locked) {
    throw new Error('Another migration run holds the migration lock; refusing to run concurrently.');
  }
  try {
    await ensureLedger(executor);
    const status = statusOf(files, await appliedChecksums(executor));
    const changed = status.filter((s) => s.state === 'CHANGED');
    if (changed.length > 0) {
      throw new Error(
        `Applied migration(s) changed on disk: ${changed.map((c) => c.name).join(', ')}. ` +
          'Add a new migration instead of editing an applied one.'
      );
    }

    const applied: string[] = [];
    const alreadyApplied: string[] = [];
    for (const file of files) {
      if (status.find((s) => s.name === file.name)?.state === 'APPLIED') {
        alreadyApplied.push(file.name);
        continue;
      }
      await executor.exec('BEGIN');
      try {
        await executor.exec(file.sql);
        await executor.query(`INSERT INTO ${MIGRATIONS_TABLE} (filename, checksum) VALUES ($1, $2)`, [file.name, file.checksum]);
        await executor.exec('COMMIT');
      } catch (error) {
        await executor.exec('ROLLBACK');
        throw new Error(`Migration ${file.name} failed and was rolled back: ${(error as Error).message}`, { cause: error });
      }
      applied.push(file.name);
      log(`applied ${file.name}`);
    }
    return { applied, alreadyApplied };
  } finally {
    await executor.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
  }
}
