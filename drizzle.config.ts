import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

const sqlHost = process.env.SQL_HOST;
const sqlDbName = process.env.SQL_DB_NAME;
const user = process.env.SQL_ADMIN_USER;
const password = process.env.SQL_ADMIN_PASSWORD;
// A hosted/managed database is frequently not on 5432. Without this the CLI dials the
// default port and fails to connect even when the runtime pool connects fine.
const sqlPort = process.env.SQL_PORT ? Number(process.env.SQL_PORT) : undefined;

if (!sqlHost) {
  throw new Error('SQL_HOST must be set in environment variables.');
}
if (!sqlDbName) {
  throw new Error('SQL_DB_NAME must be set in environment variables.');
}
if (!user) {
  throw new Error('SQL_ADMIN_USER must be set in environment variables.');
}
if (!password) {
  throw new Error('SQL_ADMIN_PASSWORD must be set in environment variables.');
}

// SCHEMA OWNERSHIP
// The database is built by applying the committed drizzle/*.sql files in order:
//   npm run db:migrate
// Those files carry DDL the Drizzle declarations do not (CHECK constraints, generated
// columns, partial indexes, and a few SQL-only tables). `drizzle-kit push` diffs the
// live database against the declarations below and would DROP whatever it cannot see,
// so never run `push` (least of all `push --force`) against a migrated database.
export default defineConfig({
  // Every declaration file. The business (billing/marketplace/organization) tables live
  // in their own file; leaving it out made the tooling treat them as undeclared.
  schema: ['./src/db/schema.ts', './src/db/business/schema.ts'],
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['public'],
  // Ask before every statement that could lose data.
  strict: true,
  dbCredentials: {
    host: sqlHost,
    port: sqlPort,
    user: user,
    password: password,
    database: sqlDbName,
    ssl: false,
  },
  verbose: true,
});
