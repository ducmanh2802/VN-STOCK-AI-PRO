import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

// A hosted Postgres is frequently NOT on 5432 (Render/Fly/Cloud Run managed
// instances and local sidecars publish an arbitrary port). Without this the pool
// silently dials 5432 and every query fails with ECONNREFUSED while the server
// still boots. Default stays 5432 when unset, so existing deployments are unchanged.
function resolvePort(): number | undefined {
  const raw = process.env.SQL_PORT;
  if (raw === undefined || raw === '') return undefined;
  const port = Number(raw);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : undefined;
}

// Managed Postgres (and any Cloud SQL public endpoint) requires TLS. The pool
// previously had no `ssl` option at all, so it always dialled plaintext and a
// TLS-only database failed with an opaque connection error. Opt-in and off by
// default, so existing plaintext/local deployments are byte-for-byte unchanged.
// Values: 'true'/'require' -> enforce TLS; 'false'/'disable' -> plaintext.
function resolveSsl(): false | { rejectUnauthorized: boolean } {
  const raw = (process.env.SQL_SSL ?? '').trim().toLowerCase();
  if (raw === '' || raw === 'false' || raw === 'disable' || raw === '0') return false;
  // Self-signed managed certs are common; verification is opt-out via SQL_SSL_REJECT_UNAUTHORIZED
  // so TLS can be enforced without breaking a private-CA instance.
  const rejectUnauthorized =
    (process.env.SQL_SSL_REJECT_UNAUTHORIZED ?? 'false').trim().toLowerCase() !== 'false';
  return { rejectUnauthorized };
}

export const createPool = () => {
  if (!global._postgresPool) {
    global._postgresPool = new Pool({
      host: process.env.SQL_HOST,
      port: resolvePort(),
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      ssl: resolveSsl(),
      max: 10,
      connectionTimeoutMillis: 15000,
    });

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

const pool = createPool();

export const db = drizzle(pool, { schema });
export { schema };
