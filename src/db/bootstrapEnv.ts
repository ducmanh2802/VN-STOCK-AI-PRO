/**
 * ENV BOOTSTRAP — must be the FIRST import in the server entrypoint.
 *
 * The Postgres pool is constructed EAGERLY at module-evaluation time
 * (`src/db/index.ts` calls `createPool()` at top level), and ES module imports are
 * evaluated BEFORE any statement in the importing module. A `dotenv.config()` call
 * placed inside `startServer()` therefore runs too late: the pool has already captured
 * `undefined` for every `SQL_*` value and later connects to its own defaults
 * (localhost:5432), surfacing as ECONNREFUSED on every DB-backed route.
 *
 * Environments that inject real variables into the process (Cloud Run, AI Studio,
 * Render, Docker) hide this bug, because the values are present before any module runs.
 * It only breaks a developer/CI run that relies on a local `.env`.
 *
 * Importing this module first makes dotenv the first evaluated dependency, so the pool
 * is configured correctly without changing the pool's construction semantics.
 * dotenv never overrides an already-set variable, so platform-provided values still win.
 */
import * as dotenv from 'dotenv';

dotenv.config();
