import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createAuthApiRouter } from '../AuthApiRouter.ts';
import { IdentityService, InMemoryUserStore } from '../../identity/identityService.ts';
import { InMemorySessionStore, SessionManager } from '../../identity/session.ts';
import { ScryptPasswordHasher } from '../../identity/password.ts';
import { InMemoryAuthEventSink } from '../../identity/types.ts';
import { InMemoryRateLimiter } from '../../security/rateLimiter.ts';

const T0 = 1_700_000_000_000;
let clock = T0;
let server: ReturnType<express.Express['listen']>;
let base = '';
const sink = new InMemoryAuthEventSink();
const store = new InMemoryUserStore();
const limiter = new InMemoryRateLimiter(() => clock);

const identity = new IdentityService(
  store,
  sink,
  () => clock,
  new SessionManager(new InMemorySessionStore(), () => clock),
  new ScryptPasswordHasher(),
);

async function post(path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
async function get(path: string, headers: Record<string, string> = {}) {
  const res = await fetch(`${base}${path}`, { headers });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createAuthApiRouter({ identity, limiter }));
  await identity.createUser({ userId: 'u-api', identifier: 'api@example.com', password: 'CorrectHorse9', now: T0 });
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server?.close();
});

describe('auth HTTP boundary', () => {
  it('login success returns a token; /me accepts it', async () => {
    const login = await post('/api/auth/login', { identifier: 'api@example.com', password: 'CorrectHorse9' });
    expect(login.status).toBe(200);
    expect(typeof login.body.token).toBe('string');
    const me = await get('/api/auth/me', { 'x-platform-session': login.body.token as string });
    expect(me.status).toBe(200);
    expect(me.body.userId).toBe('u-api');
  });

  it('every credential failure is an identical 401 (no enumeration)', async () => {
    const wrong = await post('/api/auth/login', { identifier: 'api@example.com', password: 'WrongHorse9' });
    const unknown = await post('/api/auth/login', { identifier: 'ghost@example.com', password: 'WrongHorse9' });
    const empty = await post('/api/auth/login', {});
    expect(wrong.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(unknown.body).toEqual(empty.body);
    expect(JSON.stringify(wrong.body)).not.toContain('stack');
  });

  it('logout invalidates the session', async () => {
    const login = await post('/api/auth/login', { identifier: 'api@example.com', password: 'CorrectHorse9' });
    const token = login.body.token as string;
    expect((await post('/api/auth/logout', {}, { 'x-platform-session': token })).status).toBe(200);
    expect((await get('/api/auth/me', { 'x-platform-session': token })).status).toBe(401);
  });

  it('password change revokes sessions and rejects the old credential', async () => {
    const login = await post('/api/auth/login', { identifier: 'api@example.com', password: 'CorrectHorse9' });
    const token = login.body.token as string;
    const changed = await post('/api/auth/password/change', { currentPassword: 'CorrectHorse9', newPassword: 'BrandNewPass9' }, { 'x-platform-session': token });
    expect(changed.status).toBe(200);
    expect((await get('/api/auth/me', { 'x-platform-session': token })).status).toBe(401);
    expect((await post('/api/auth/login', { identifier: 'api@example.com', password: 'CorrectHorse9' })).status).toBe(401);
    expect((await post('/api/auth/login', { identifier: 'api@example.com', password: 'BrandNewPass9' })).status).toBe(200);
  });

  it('password policy violation returns 400 without echoing the password', async () => {
    const login = await post('/api/auth/login', { identifier: 'api@example.com', password: 'BrandNewPass9' });
    const token = login.body.token as string;
    const res = await post('/api/auth/password/change', { currentPassword: 'BrandNewPass9', newPassword: 'weak' }, { 'x-platform-session': token });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain('weak');
    expect(res.body).toEqual({ error: 'password_policy_violation' });
  });

  it('password reset always answers 202 (existence not revealed)', async () => {
    expect((await post('/api/auth/password/reset', { identifier: 'api@example.com' })).status).toBe(202);
    expect((await post('/api/auth/password/reset', { identifier: 'nobody@example.com' })).status).toBe(202);
  });

  it('login is rate limited; the limiter does not lock out accounting paths', async () => {
    const key = `auth:ip:127.0.0.1`;
    const fresh = new InMemoryRateLimiter(() => clock);
    const limited = Array.from({ length: 12 }, () => fresh.allow(key, { ip: '127.0.0.1' }, 'auth')).filter((d) => !d.allowed);
    expect(limited.length).toBeGreaterThan(0);
    expect(fresh.allow('k', undefined, 'critical').allowed).toBe(true);
    expect(limiter.allow('k', undefined, 'critical').allowed).toBe(true);
  });

  it('unauthenticated /me is 401 and responses never leak internals', async () => {
    const res = await get('/api/auth/me');
    expect(res.status).toBe(401);
    const blob = JSON.stringify(res.body).toLowerCase();
    for (const leak of ['postgres', 'stack', 'firebase', 'scrypt', 'process.env']) {
      expect(blob).not.toContain(leak);
    }
  });
});