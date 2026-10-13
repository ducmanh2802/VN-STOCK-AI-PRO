/**
 * SCHEMA CONSISTENCY CHECK
 * ========================
 * Compares the Drizzle declarations (what the application code believes) against a
 * database built from the committed migrations (what actually exists): every declared
 * table and column must exist with a compatible type and the same nullability, and
 * every table in the database must be either declared or explicitly listed as
 * SQL-only. Read-only.
 */
import { is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import type { MigrationExecutor } from './migrations.ts';

export type SchemaDifferenceKind =
  | 'MISSING_TABLE'
  | 'MISSING_COLUMN'
  | 'TYPE_MISMATCH'
  | 'NULLABILITY_MISMATCH'
  | 'UNDECLARED_TABLE';

export interface SchemaDifference {
  readonly kind: SchemaDifferenceKind;
  readonly table: string;
  readonly column?: string;
  readonly detail: string;
}

interface DbColumn {
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: 'YES' | 'NO';
  numeric_precision: number | null;
  numeric_scale: number | null;
}

/** Every PgTable exported by the given schema modules. */
export function declaredTables(...modules: readonly Record<string, unknown>[]): PgTable[] {
  const tables = new Map<string, PgTable>();
  for (const mod of modules) {
    for (const value of Object.values(mod)) {
      if (is(value, PgTable)) tables.set(getTableConfig(value).name, value);
    }
  }
  return [...tables.values()];
}

/** Drizzle SQL type -> information_schema data_type (+ numeric precision/scale). */
function expectedType(sqlType: string): { dataType: string; precision?: number; scale?: number } {
  const t = sqlType.trim().toLowerCase();
  if (t.endsWith('[]')) return { dataType: 'array' };
  if (t === 'serial') return { dataType: 'integer' };
  if (t === 'bigserial') return { dataType: 'bigint' };
  if (t === 'smallserial') return { dataType: 'smallint' };
  if (/^timestamp(\(\d\))? with time zone$/.test(t)) return { dataType: 'timestamp with time zone' };
  if (/^timestamp(\(\d\))?( without time zone)?$/.test(t)) return { dataType: 'timestamp without time zone' };
  if (t.startsWith('varchar') || t.startsWith('character varying')) return { dataType: 'character varying' };
  const numeric = /^numeric(?:\((\d+),\s*(\d+)\))?$/.exec(t);
  if (numeric) {
    return numeric[1] === undefined
      ? { dataType: 'numeric' }
      : { dataType: 'numeric', precision: Number(numeric[1]), scale: Number(numeric[2]) };
  }
  return { dataType: t };
}

export async function compareSchemaToDatabase(
  executor: MigrationExecutor,
  tables: readonly PgTable[],
  options: { sqlOnlyTables?: readonly string[] } = {}
): Promise<SchemaDifference[]> {
  const { rows } = await executor.query<DbColumn>(
    `SELECT table_name, column_name, data_type, udt_name, is_nullable, numeric_precision, numeric_scale
       FROM information_schema.columns
      WHERE table_schema = 'public'`
  );
  const dbTables = new Map<string, Map<string, DbColumn>>();
  for (const row of rows) {
    if (!dbTables.has(row.table_name)) dbTables.set(row.table_name, new Map());
    dbTables.get(row.table_name)!.set(row.column_name, row);
  }

  const differences: SchemaDifference[] = [];
  const declared = new Set<string>();
  for (const table of tables) {
    const config = getTableConfig(table);
    declared.add(config.name);
    const dbColumns = dbTables.get(config.name);
    if (!dbColumns) {
      differences.push({ kind: 'MISSING_TABLE', table: config.name, detail: 'declared in Drizzle, not created by any migration' });
      continue;
    }
    for (const column of config.columns) {
      const db = dbColumns.get(column.name);
      if (!db) {
        differences.push({ kind: 'MISSING_COLUMN', table: config.name, column: column.name, detail: `declared ${column.getSQLType()}` });
        continue;
      }
      const expected = expectedType(column.getSQLType());
      const actual = db.data_type.toLowerCase();
      const precisionMismatch =
        expected.precision !== undefined &&
        (Number(db.numeric_precision) !== expected.precision || Number(db.numeric_scale) !== expected.scale);
      if (expected.dataType !== actual || precisionMismatch) {
        differences.push({
          kind: 'TYPE_MISMATCH',
          table: config.name,
          column: column.name,
          detail: `declared ${column.getSQLType()}, database ${db.data_type}${db.numeric_precision !== null && actual === 'numeric' ? `(${db.numeric_precision}, ${db.numeric_scale})` : ''}`,
        });
      }
      // A primary key is NOT NULL whether or not the declaration says so.
      const declaredNotNull = column.notNull || column.primary;
      if (declaredNotNull !== (db.is_nullable === 'NO')) {
        differences.push({
          kind: 'NULLABILITY_MISMATCH',
          table: config.name,
          column: column.name,
          detail: `declared ${declaredNotNull ? 'NOT NULL' : 'nullable'}, database ${db.is_nullable === 'NO' ? 'NOT NULL' : 'nullable'}`,
        });
      }
    }
  }

  const sqlOnly = new Set(options.sqlOnlyTables ?? []);
  for (const name of dbTables.keys()) {
    if (!declared.has(name) && !sqlOnly.has(name)) {
      differences.push({ kind: 'UNDECLARED_TABLE', table: name, detail: 'created by a migration but not declared in Drizzle' });
    }
  }
  return differences;
}
