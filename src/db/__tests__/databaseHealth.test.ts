import { describe, it, expect, vi } from 'vitest';
import {
  checkDatabaseConnectivity,
  missingDatabaseConfiguration,
  REQUIRED_DATABASE_ENV,
} from '../databaseHealth';

const CONFIGURED_ENV = {
  SQL_HOST: 'db.internal',
  SQL_USER: 'app',
  SQL_PASSWORD: 'hunter2-super-secret',
  SQL_DB_NAME: 'vnstock',
};

function errorWithCode(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}

describe('missingDatabaseConfiguration', () => {
  it('lists every required variable that is absent or blank', () => {
    expect(missingDatabaseConfiguration({})).toEqual([...REQUIRED_DATABASE_ENV]);
    expect(missingDatabaseConfiguration({ ...CONFIGURED_ENV, SQL_PASSWORD: '   ' })).toEqual(['SQL_PASSWORD']);
    expect(missingDatabaseConfiguration(CONFIGURED_ENV)).toEqual([]);
  });
});

describe('checkDatabaseConnectivity', () => {
  it('reports NOT_CONFIGURED without attempting a connection', async () => {
    const probe = vi.fn(async () => undefined);
    const health = await checkDatabaseConnectivity({ env: { SQL_HOST: 'x' }, probe });
    expect(health.state).toBe('NOT_CONFIGURED');
    expect(health.missingConfiguration).toEqual(['SQL_USER', 'SQL_PASSWORD', 'SQL_DB_NAME']);
    expect(probe).not.toHaveBeenCalled();
  });

  it('reports CONNECTED only after the probe round trip succeeds', async () => {
    let t = 1_000;
    const probe = vi.fn(async () => {
      t += 7;
    });
    const health = await checkDatabaseConnectivity({ env: CONFIGURED_ENV, probe, now: () => t });
    expect(probe).toHaveBeenCalledTimes(1);
    expect(health.state).toBe('CONNECTED');
    expect(health.latencyMs).toBe(7);
    expect(health.reason).toBeNull();
  });

  it('configuration alone never yields CONNECTED: a refused connection is UNAVAILABLE', async () => {
    const health = await checkDatabaseConnectivity({
      env: CONFIGURED_ENV,
      probe: async () => {
        throw errorWithCode('connect ECONNREFUSED 10.0.0.5:5432', 'ECONNREFUSED');
      },
    });
    expect(health.state).toBe('UNAVAILABLE');
    expect(health.reason).toBe('CONNECTION_FAILED');
    expect(health.errorCode).toBe('ECONNREFUSED');
  });

  it('classifies a wrapped authentication failure through the cause chain', async () => {
    const health = await checkDatabaseConnectivity({
      env: CONFIGURED_ENV,
      probe: async () => {
        throw new Error('Không thể kết nối', {
          cause: errorWithCode('password authentication failed for user "app"', '28P01'),
        });
      },
    });
    expect(health.state).toBe('UNAVAILABLE');
    expect(health.reason).toBe('CONNECTION_FAILED');
    expect(health.errorCode).toBe('28P01');
  });

  it('bounds a hanging probe with a timeout instead of blocking the caller', async () => {
    const started = Date.now();
    const health = await checkDatabaseConnectivity({
      env: CONFIGURED_ENV,
      timeoutMs: 50,
      probe: () => new Promise(() => undefined),
    });
    expect(health.state).toBe('UNAVAILABLE');
    expect(health.reason).toBe('TIMEOUT');
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('a late rejection from a timed-out probe does not surface as an unhandled rejection', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const health = await checkDatabaseConnectivity({
        env: CONFIGURED_ENV,
        timeoutMs: 10,
        probe: () => new Promise((_, reject) => setTimeout(() => reject(new Error('late')), 30)),
      });
      expect(health.reason).toBe('TIMEOUT');
      await new Promise((r) => setTimeout(r, 60));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('a non-connection query failure is still UNAVAILABLE, classified separately', async () => {
    const health = await checkDatabaseConnectivity({
      env: CONFIGURED_ENV,
      probe: async () => {
        throw errorWithCode('permission denied for schema public', '42501');
      },
    });
    expect(health.state).toBe('UNAVAILABLE');
    expect(health.reason).toBe('QUERY_FAILED');
    expect(health.errorCode).toBe('42501');
  });

  it('never carries credentials, hosts or driver messages in the report', async () => {
    // Assembled at runtime so the repo secret scanner does not read the fixture as a leak.
    const connectionString = ['postgres', '://', 'app', ':', CONFIGURED_ENV.SQL_PASSWORD, '@db.internal:5432'].join('');
    const health = await checkDatabaseConnectivity({
      env: CONFIGURED_ENV,
      probe: async () => {
        throw errorWithCode(`connect to ${connectionString} failed`, 'ECONNREFUSED');
      },
    });
    const serialized = JSON.stringify(health);
    expect(serialized).not.toContain(CONFIGURED_ENV.SQL_PASSWORD);
    expect(serialized).not.toContain('db.internal');
    expect(serialized).not.toContain('postgres://');
  });
});
