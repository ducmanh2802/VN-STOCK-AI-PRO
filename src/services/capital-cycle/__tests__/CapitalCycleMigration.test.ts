/**
 * PHASE 26 — SCHEMA / MIGRATION PARITY TEST
 * ========================================
 * Proves the four Phase 26 tables exist BOTH as Drizzle schema definitions and
 * as reproducible DDL in the migration chain (no "schema-only" tables).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const migrationSql = readFileSync(
  fileURLToPath(new URL('../../../../drizzle/0001_phase26_capital_cycle.sql', import.meta.url)),
  'utf8'
);
const schemaSource = readFileSync(
  fileURLToPath(new URL('../../../db/schema.ts', import.meta.url)),
  'utf8'
);

const TABLES = ['policy_events', 'strategic_projects', 'project_beneficiaries', 'legal_governance_events'];

describe('Phase 26 — schema / migration parity', () => {
  it('defines every Phase 26 table in the migration DDL', () => {
    for (const table of TABLES) {
      expect(migrationSql).toContain(`CREATE TABLE IF NOT EXISTS "${table}"`);
    }
  });

  it('defines every Phase 26 table in the Drizzle schema', () => {
    for (const table of TABLES) {
      expect(schemaSource).toContain(`'${table}'`);
    }
  });

  it('preserves provenance, temporal and precision columns in the DDL', () => {
    expect(migrationSql).toContain('"publication_date" date');
    expect(migrationSql).toContain('"target_investment_vnd" numeric(24, 2)');
    expect(migrationSql).toContain('"progress_percent" numeric(5, 2)');
    expect(migrationSql).toContain('"fine_amount_vnd" numeric(18, 2)');
    expect(migrationSql).toContain('"evidence_tier" text NOT NULL');
    expect(migrationSql).toContain('"severity" text NOT NULL');
  });

  it('creates lookup indexes for the real query paths', () => {
    expect(migrationSql).toContain('"policy_events_id_idx"');
    expect(migrationSql).toContain('"strategic_projects_sector_idx"');
    expect(migrationSql).toContain('"proj_beneficiaries_sym_idx"');
    expect(migrationSql).toContain('"legal_gov_events_sev_idx"');
  });

  it('is additive and free of destructive statements', () => {
    expect(migrationSql.toUpperCase()).not.toContain('DROP TABLE');
    expect(migrationSql.toUpperCase()).not.toContain('ALTER TABLE');
    expect(migrationSql.toUpperCase()).not.toContain('TRUNCATE');
  });
});
