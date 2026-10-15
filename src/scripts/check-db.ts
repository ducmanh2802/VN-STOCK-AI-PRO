/**
 * PostgreSQL connectivity probe — reports the exact blocker if the DB is not
 * reachable. Does NOT fabricate success. Exit codes: 0 = connected, 1 = blocker.
 */
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const required = ['SQL_HOST', 'SQL_USER', 'SQL_PASSWORD', 'SQL_DB_NAME'] as const;
  const missing = required.filter((k) => !process.env[k] || process.env[k]!.trim() === '');

  if (missing.length > 0) {
    console.error('BLOCKER: Missing PostgreSQL env vars:', missing.join(', '));
    console.error('Searched .env and process environment. Neither defines them.');
    process.exit(1);
  }

  const { Pool } = await import('pg');
  const pool = new Pool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME,
    connectionTimeoutMillis: 8000,
  });

  try {
    const r = await pool.query('SELECT version() as v, current_database() as db');
    console.log('CONNECTED:', r.rows[0].v.split(',')[0], '| db =', r.rows[0].db);
    const tables = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
    );
    console.log('TABLES:', tables.rows.map((t: any) => t.table_name).join(', '));
    process.exit(0);
  } catch (err: any) {
    console.error('BLOCKER: PostgreSQL connection failed:', err.message);
    console.error('host=', process.env.SQL_HOST, 'user=', process.env.SQL_USER, 'db=', process.env.SQL_DB_NAME);
    process.exit(1);
  } finally {
    await pool.end().catch(() => {});
  }
}

main();
