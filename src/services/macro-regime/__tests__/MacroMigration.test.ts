/**
 * PHASE 27 — SCHEMA / MIGRATION PARITY TEST
 * ========================================
 * Proves the two Phase 27 macro tables exist BOTH as Drizzle schema definitions
 * and as reproducible DDL in the migration chain (no "schema-only" tables).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const migrationSql = readFileSync(
  fileURLToPath(new URL('../../../../drizzle/0002_phase27_macro.sql', import.meta.url)),
  'utf8'
);
const schemaSource = readFileSync(
  fileURLToPath(new URL('../../../db/schema.ts', import.meta.url)),
  'utf8'
);

const TABLES = ['macro_observations', 'macro_regime_snapshots'];

describe('Phase 27 — schema / migration parity', () => {
  it('defines every Phase 27 macro table in the migration DDL', () => {
    for (const table of TABLES) {
      expect(migrationSql).toContain(`CREATE TABLE IF NOT EXISTS "${table}"`);
    }
  });

  it('defines every Phase 27 macro table in the Drizzle schema', () => {
    for (const table of TABLES) {
      expect(schemaSource).toContain(`'${table}'`);
    }
  });

  it('preserves provenance, temporal and precision columns in the DDL', () => {
    expect(migrationSql).toContain('"metric_code" text NOT NULL');
    expect(migrationSql).toContain('"observation_date" date NOT NULL');
    expect(migrationSql).toContain('"publication_date" date NOT NULL');
    expect(migrationSql).toContain('"value" numeric(18, 4)');
    expect(migrationSql).toContain('"revision_version" integer DEFAULT 0 NOT NULL');
    expect(migrationSql).toContain('"confidence_percent" numeric(5, 2) NOT NULL');
    expect(migrationSql).toContain('"lookahead_rejected" boolean DEFAULT false NOT NULL');
  });

  it('creates lookup indexes for the real query paths', () => {
    expect(migrationSql).toContain('"macro_obs_metric_obsdate_rev_idx"');
    expect(migrationSql).toContain('"macro_obs_metric_obsdate_idx"');
    expect(migrationSql).toContain('"macro_obs_metric_pubdate_idx"');
    expect(migrationSql).toContain('"macro_regime_snapshots_id_idx"');
    expect(migrationSql).toContain('"macro_regime_snapshots_date_idx"');
  });

  it('is additive and free of destructive statements', () => {
    expect(migrationSql.toUpperCase()).not.toContain('DROP TABLE');
    expect(migrationSql.toUpperCase()).not.toContain('ALTER TABLE');
    expect(migrationSql.toUpperCase()).not.toContain('TRUNCATE');
  });
});
