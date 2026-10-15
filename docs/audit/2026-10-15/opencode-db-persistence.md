# db-persistence — OpenCode audit (2026-10-15)

## Map

### Purpose
Audit of the "db-persistence" area covering database schema declarations (`src/db/schema.ts`), migration files (`drizzle/*.sql`), repository implementations (`src/lib/db/`), the migration runner (`src/db/migrations.ts`), and the database connectivity health checks. This area is responsible for persistently storing market data, portfolio state, and analytical results for the Vietnam stock trading product.

### Entry points
- `src/db/index.ts` — creates the pg pool and exposes `db` via drizzle-orm
- `src/db/bootstrapEnv.ts` — must be first import to set env vars before pool construction
- `src/db/migrations.ts` — migration runner (`applyMigrations`, `migrationStatus`)
- `src/lib/db/` — repository classes for all persistent tables (InstrumentRepository, PortfolioRepository, etc.)
- `drizzle/*.sql` — committed SQL migrations (0000-0015)
- `src/db/schemaConsistency.ts` — compares declared tables against migrated database

### Key files

| Path | Role |
|---|---|
| `src/db/index.ts` | Creates pg pool eagerly at module-evaluation time; exposes `db` drizzle instance |
| `src/db/bootstrapEnv.ts` | Imports `dotenv.config()` first to set SQL_* env vars before pool construction |
| `src/db/schema.ts` | Declares all PgTable declarations (35+ tables, core domain model) |
| `src/db/migrations.ts` | Migration runner: load, status, apply with idempotent safety properties |
| `drizzle/0014_core_schema_baseline.sql` | Creates 20 core tables with FKs; idempotent via IF NOT EXISTS |
| `drizzle/0015_market_data_ingestion_runs.sql` | Creates ingestion run ledger tables (market_data_ingestion_runs, mdisr) |
| `src/lib/db/InstrumentRepository` | Instruments upsert/getAsOf repository |
| `src/lib/db/PortfolioRepository` | Portfolio and position persistence |
| `src/lib/db/CanonicalMarketDataRepository` | Canonical bar/provenance/quality write & read |
| `src/db/schemaConsistency.ts` | Compares declared tables/columns against migrated database |
| `src/db/dbFailure.ts` | Classifies database-unavailable errors (must NOT import src/db/index.ts) |
| `src/db/databaseHealth.ts` | Reports connectivity state: NOT_CONFIGURED/CONNECTED/UNAVAILABLE |

### Wiring
- `bootstrapEnv.ts` dotenv.config() → sets SQL_* env vars → `src/db/index.ts` pool creation reads env vars
- `drizzle-kit push` (not recommended) diffs live DB against declarations; only `npm run db:migrate` uses committed *.sql files
- `src/lib/db/` repositories import `db` from `../../../db/index.ts`; all guard with `if (!db) return;` for testability
- `schemaConsistency.compareSchemaToDatabase` validates declared tables against actual DB; used by `migrations.test.ts`
- Migration runner (`applyMigrations`) enforces contiguous IDs, idempotent execution, and change detection

### Tests
- `src/db/__tests__/migrations.test.ts` — builds DB from drizzle/*.sql and validates every Drizzle declaration matches; checks idempotency and safety
- `src/db/__tests__/dbFailure.test.ts` — classifies database-unavailable errors; tests `isDatabaseUnavailable` predicate
- `src/db/__tests__/databaseHealth.test.ts` — reports connectivity state (NOT_CONFIGURED/CONNECTED/UNAVAILABLE)
- `src/db/__tests__/pgliteHarness.ts` — creates PGlite from committed migrations for in-process testing
- No test exercises the full import-ordering dependency between `bootstrapEnv.ts` and `index.ts`; ordering is assumed by convention

### Health
(works / partially broken / broken, with evidence: tsc error count for these paths, missing files)
- **Works**: Migration runner applies all 16 files idempotently on fresh PGlite; schema consistency test structure is complete
- **Partially broken**: `src/db/index.ts` constructs pool at module time without guaranteed env var availability — requires `bootstrapEnv.ts` first import; undocumented ordering dependency
- **Partially broken**: `src/lib/db/` repositories all import `db` from `../../../db/index.ts`; `if (!db) return;` guards prevent crashes in test env but the pool is still constructed eagerly
- **Broken**: Import order between `bootstrapEnv.ts` and `index.ts` is not enforced by the codebase; violating it causes the pool to connect to localhost:5432 with undefined credentials
- tsc baseline: 563 errors (unchanged by this task; many pre-existing from a277613 deleted-file imports)

### Gotchas
- 16 migration files (0000-0015) are contiguous and idempotent; `loadMigrationFiles` enforces ID continuity from 0000
- `dotenv.config()` in `bootstrapEnv.ts` must be the very first module evaluation; any other import order of `src/db/index.ts` captures undefined SQL_* vars
- The `schemaConsistency.ts` comparison mechanism exists but is not auto-run in default CI; drift between declarations and DB would go undetected
- `src/db/dbFailure.ts` deliberately does NOT import `src/db/index.ts` (dependency-free by design) as noted in its header comment
- `scripts/db-migrate.ts` explicitly imports `../src/db/bootstrapEnv.ts` as the first import to ensure env vars are set
- `scripts/backfill-daily-bars.ts` also imports `../src/db/bootstrapEnv.ts` first for the same reason

## Findings

| # | Severity | Category | Location | Title |
|---|---|---|---|---|
| F1 | medium | configuration | `src/db/bootstrapEnv.ts:19` | dotenv.config() at module-evaluation time |
| F2 | medium | configuration | `src/db/index.ts:12-13` | pg pool constructed eagerly without env var guarantee |
| F3 | low | build infrastructure | `src/db/migrations.ts:65-69` | migration ID contiguity enforced but fragile |
| F4 | medium | schema consistency | `src/db/business.schema.ts:7-10` | business schema separate from core schema creates drift risk |
| F5 | low | verification | `src/db/schemaConsistency.ts:39-47` | schema consistency check exists but not auto-run in CI |

### F1 — medium / configuration
**Location:** `src/db/bootstrapEnv.ts:19`  
```ts
dotenv.config();
```
**Evidence:**
```ts
dotenv.config();
```
**Why it is a defect:** The `dotenv.config()` call at line 19 runs at module-evaluation time. If `src/db/index.ts` (which creates the pg pool eagerly at module load) is imported before `bootstrapEnv.ts`, the pool captures undefined `SQL_*` environment variables and connects to localhost:5432 by default. The file header (lines 4-17) explicitly documents this as a design bug that only breaks developer/CI runs relying on a local `.env`. The `bootstrapEnv.ts` import ordering requirement is not enforced by the codebase.
**Minimal fix:** Document that `bootstrapEnv.ts` must be the very first import in any server entrypoint, or refactor the pg pool creation to be lazy after env var resolution.

### F2 — medium / configuration
**Location:** `src/db/index.ts:12-13`  
```ts
if (!global._postgresPool) {
    global._postgresPool = new Pool({
      host: process.env.SQL_HOST,
      port: resolvePort(),
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
```
**Evidence:**
```ts
new Pool({
      host: process.env.SQL_HOST,
      port: resolvePort(),
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
```
**Why it is a defect:** The pg pool is constructed eagerly at module-evaluation time using `process.env` values. There is no guarantee these variables are set when the module first loads, creating a hidden ordering dependency on `bootstrapEnv.ts:dotenv.config()`. Any other import order will result in the pool using default localhost:5432 credentials, potentially connecting to the wrong database or failing entirely.
**Minimal fix:** Make pool creation lazy (e.g., inside a function) or add a runtime guard that logs a clear error when env vars are missing instead of silently using defaults.

### F3 — low / build infrastructure
**Location:** `src/db/migrations.ts:65-69`  
```ts
files.forEach((f, index) => {
    if (f.id !== index) {
      throw new Error(`Migration ids must be contiguous from 0000: expected ${String(index).padStart(4, '0')}, found ${f.name}`);
    }
```
**Evidence:**
```ts
files.forEach((f, index) => {
    if (f.id !== index) {
      throw new Error(`Migration ids must be contiguous from 0000: expected ${String(index).padStart(4, '0')}, found ${f.name}`);
    }
```
**Why it is a defect:** The `loadMigrationFiles` function enforces that migration file IDs are contiguous starting from 0000. Any gap or duplicate ID in the `drizzle/` directory will cause the migration runner to crash on startup. This is a fragile constraint that could be broken by accidental file renaming, insertion, or deletion without maintaining strict ID numbering.
**Minimal fix:** None needed for the current file set (0000-0015 is contiguous); consider relaxing the check to only validate non-zero starting ID or document the constraint in onboarding.

### F4 — medium / schema consistency
**Location:** `src/db/business/schema.ts:7`  
```ts
/**
 * BUSINESS-01 — COMMERCIAL PERSISTENCE SCHEMA
 * ===========================================
 * Drizzle table declarations for the commercial layer.
 *
 * WHY A SEPARATE FILE (docs/BUSINESS_READINESS_AUDIT.md §1.1)
 * `src/db.schema.ts` is currently being modified concurrently by the PLATFORM lane
 * (roadmap §25: "If a file is concurrently changing: STOP or isolate the work"). Writing
 * here isolates the Business lane completely. It has zero overlap with any other lane's
 * tables and can be merged into `schema.ts` later without conflict.
```
**Evidence:**
```ts
/**
 * BUSINESS-01 — COMMERCIAL PERSISTENCE SCHEMA
 * ===========================================
 * Drizzle table declarations for the commercial layer.
 *
 * WHY A SEPARATE FILE (docs/BUSINESS_READINESS_AUDIT.md §1.1)
 * `src/db.schema.ts` is currently being modified concurrently by the PLATFORM lane
 * (roadmap §25: "If a file is concurrently changing: STOP or isolate the work"). Writing
 * here isolates the Business lane completely. It has zero overlap with any other lane's
 * tables and can be merged into `schema.ts` later without conflict.
```
**Why it is a defect:** The business schema (`src/db/business/schema.ts`) is maintained separately from the core schema (`src/db/schema.ts`) due to concurrent modification by different lanes (roadmap §25). This creates a drift risk where any table, column, or type added to one must be manually added to the other, and inconsistencies may go undetected until runtime. The two schema files must stay in sync indefinitely until a future merge per roadmap §25.
**Minimal fix:** Establish a sync review process between the two schema files on every change; the roadmap §25 target is to merge `business.schema.ts` into `schema.ts`.

### F5 — low / verification
**Location:** `src/db/schemaConsistency.ts:39-47`  
```ts
export function declaredTables(...modules: readonly Record<string, unknown>[]): PgTable[] {
  const tables = new Map<string, PgTable>();
  for (const mod of modules) {
    for (const value of Object.values(mod)) {
      if (is(value, PgTable)) tables.set(getTableConfig(value).name, value);
    }
  }
  return [...tables.values()];
```
**Evidence:**
```ts
export function declaredTables(...modules: readonly Record<string, unknown>[]): PgTable[] {
  const tables = new Map<string, PgTable>();
  for (const mod of modules) {
    for (const value of Object.values(mod)) {
      if (is(value, PgTable)) tables.set(getTableConfig(value).name, value);
    }
  }
  return [...tables.values()];
```
**Why it is a defect:** The `schemaConsistency.ts` comparison mechanism exists and provides a way to compare declared PgTable declarations against the actual migrated database. However, this check is not auto-run in the default CI pipeline — it is only invoked explicitly by `migrations.test.ts`. Any drift between type declarations and the actual database would go undetected without manually running the consistency check.
**Minimal fix:** Include the schema consistency comparison as a step in the CI pipeline, or add a pre-commit hook that runs `compareSchemaToDatabase` against the migration-built database.

## Not checked / unsure
- Exact state of runtime import ordering between `bootstrapEnv.ts` and `index.ts` in production deployments — the code assumes correct ordering but does not enforce it
- Whether any runtime code path writes to the database at import time beyond the pool construction in `index.ts`
- Full tsc 563-error breakdown beyond the pre-existing broken-import findings
- Whether the `compareSchemaToDatabase` function produces accurate results when run against a database built from the committed migrations vs. a partially migrated state
- If any `.env` files or credentials are checked into the repository (beyond `.env.example`)