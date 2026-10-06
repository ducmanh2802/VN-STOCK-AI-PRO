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

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['public'],
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
