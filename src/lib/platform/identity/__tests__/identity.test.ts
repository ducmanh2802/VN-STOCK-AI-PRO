import { beforeEach, describe, expect, it } from 'vitest';
import {
  IdentityService,
  InMemoryUserStore,
  DEFAULT_LOCKOUT_POLICY,
  type UserStore,
} from '../identityService.ts';
import { DEFAULT_SESSION_POLICY, InMemorySessionStore, SessionManager } from '../session.ts';
import { ScryptPasswordHasher, validatePassword } from '../password.ts';
import { StaticTokenVerifier } from '../tokenVerifier.ts';
import { InMemoryAuthEventSink } from '../types.ts';

const T0 = 1_700_000_000_000;
const ADVANCE = 60_000;

function harness() {
  let clock = T0;
  const store = new InMemoryUserStore();
  const sessions = new InMemorySessionStore();
  const sink = new InMemoryAuthEventSink();
  const manager = new SessionManager(sessions, () => clock, { ...DEFAULT_SESSION_POLICY, ttlMs: 3_600_000, renewTtlMs: 3_600_000, maxRenewals: 2 });
  const service = new IdentityService(store, sink, () => clock, manager, new ScryptPasswordHasher());
  return {
    store,
    sink,
    service,
    tick: (ms: number) => {
      clock += ms;
    },
  };
}

async function seeded() {
  const h = harness();
  await h.service.createUser({ userId: 'u-alice', identifier: 'alice@example.com', password: 'CorrectHorse9', now: T0 });
  await h.service.createUser({ userId: 'u-bob', identifier: 'bob@example.com', password: 'CorrectHorse9', now: T0 });
  return h;
}

describe('credential storage (§8 — never plaintext)', () => {
  it('stores only a scrypt record, never the password', async () => {
    const h = await seeded();
    const account = h.store.get('u-alice')!;
    expect(account.passwordHash).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(account.passwordHash).not.toContain('CorrectHorse9');
    expect(JSON.stringify(account)).not.toContain('CorrectHorse9');
  });

  it('hashes are salted (identical passwords → different records) and verify correctly', async () => {
    const hasher = new ScryptPasswordHasher();
    const a = await hasher.hash('CorrectHorse9');
    const b = await hasher.hash('CorrectHorse9');
    expect(a).not.toBe(b);
    expect(await hasher.verify('CorrectHorse9', a)).toBe(true);
    expect(await hasher.verify('WrongHorse9', a)).toBe(false);
  });

  it('malformed credential records fail closed instead of throwing', async () => {
    const hasher = new ScryptPasswordHasher();
    for (const bad of ['', 'not-a-record', 'scrypt$x$8$1$aaaa', 'bcrypt$1$2$3$4$5']) {
      expect(await hasher.verify('CorrectHorse9', bad)).toBe(false);
    }
  });

  it('password policy is enforced at creation', async () => {
    const h = await seeded();
    await expect(h.service.createUser({ userId: 'u-x', identifier: 'x@example.com', password: 'short', now: T0 }))
      .rejects.toThrow(/PASSWORD_POLICY/);
    expect(validatePassword('alice@example.com', 'alice@example.com').map((v) => v.code)).toContain('MATCHES_IDENTIFIER');
    await expect(h.service.createUser({ userId: 'u-alice', identifier: 'dup@example.com', password: 'CorrectHorse9', now: T0 }))
      .rejects.toThrow('USER_ALREADY_EXISTS');
  });
});

describe('§13 authentication acceptance', () => {
  it('valid credentials → authenticated with a session', async () => {
    const h = await seeded();
    const r = await h.service.authenticateWithPassword({ identifier: 'alice@example.com', password: 'CorrectHorse9' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.principal.userId).toBe('u-alice');
    expect(r.principal.provider).toBe('platform-session');
    expect(h.service.sessionsFor('u-alice')).toHaveLength(1);
    expect(h.sink.types()).toContain('LOGIN_SUCCESS');
  });

  it('invalid credentials are rejected and emit no session', async () => {
    const h = await seeded();
    const r = await h.service.authenticateWithPassword({ identifier: 'alice@example.com', password: 'WrongHorse9' });
    expect(r).toEqual({ ok: false, code: 'INVALID_CREDENTIALS' });
    expect(h.service.sessionsFor('u-alice')).toHaveLength(0);
    expect(h.sink.all().some((e) => e.type === 'LOGIN_FAILURE' && e.outcome === 'FAILURE')).toBe(true);
  });

  it('does not enumerate accounts (unknown user === wrong password)', async () => {
    const h = await seeded();
    const unknown = await h.service.authenticateWithPassword({ identifier: 'ghost@example.com', password: 'CorrectHorse9' });
    const wrong = await h.service.authenticateWithPassword({ identifier: 'alice@example.com', password: 'WrongHorse9' });
    expect(unknown).toEqual(wrong);
    expect(h.sink.all().filter((e) => e.type === 'LOGIN_FAILURE').every((e) => !JSON.stringify(e.metadata).includes('CorrectHorse9'))).toBe(true);
  });

  it('disabled user is rejected and cannot use an old session', async () => {
    const h = await seeded();
    const ok = await h.service.authenticateWithPassword({ identifier: 'alice@example.com', password: 'CorrectHorse9' });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    const liveToken = ok.token;
    expect(typeof liveToken).toBe('string');
    expect(h.service.authenticateToken(liveToken).ok).toBe(true); // session works while active
    h.service.disableUser('u-alice', 'policy');
    expect(await h.service.authenticateWithPassword({ identifier: 'alice@example.com', password: 'CorrectHorse9' }))
      .toEqual({ ok: false, code: 'ACCOUNT_DISABLED' });
    expect(h.service.authenticateToken(liveToken)).toEqual({ ok: false, code: 'SESSION_REVOKED' });
    expect(h.service.authenticateToken('garbage')).toEqual({ ok: false, code: 'NOT_AUTHENTICATED' });
    expect(h.sink.types()).toContain('ACCOUNT_DISABLED');
  });

  it('wrong password against a disabled account still reports INVALID_CREDENTIALS (no existence leak)', async () => {
    const h = await seeded();
    h.service.disableUser('u-bob', 'policy');
    expect(await h.service.authenticateWithPassword({ identifier: 'bob@example.com', password: 'WrongHorse9' }))
      .toEqual({ ok: false, code: 'INVALID_CREDENTIALS' });
  });

  it('expired session is rejected', async () => {
    const h = await seeded();
    const r = await h.service.authenticateWithPassword({ identifier: 'alice@example.com', password: 'CorrectHorse9' });
    if (!r.ok) throw new Error('setup failed');
    const token = r.token!;
    expect(h.service.authenticateToken(token).ok).toBe(true);
    h.tick(3_600_001);
    // The store still holds the session, but expiry denies it.
    expect(h.service.authenticateToken(token)).toEqual({ ok: false, code: 'SESSION_EXPIRED' });
    expect(h.service.sessionsFor('u-alice')).toHaveLength(0);
  });

  it('revoked session is rejected', async () => {
    const h = await seeded();
    const r = await h.service.authenticateWithPassword({ identifier: 'alice@example.com', password: 'CorrectHorse9' });
    if (!r.ok) throw new Error('setup failed');
    h.service.logout(r.principal);
    expect(h.service.authenticateToken(r.token!)).toEqual({ ok: false, code: 'SESSION_REVOKED' });
  });

  it('logout invalidates the session', async () => {
    const h = await seeded();
    const r = await h.service.authenticateWithPassword({ identifier: 'alice@example.com', password: 'CorrectHorse9' });
    if (!r.ok) throw new Error('setup failed');
    expect(h.service.sessionsFor('u-alice')).toHaveLength(1);
    expect(h.service.logout(r.principal)).toBe(true);
    expect(h.service.sessionsFor('u-alice')).toHaveLength(0);
    expect(h.sink.types()).toContain('LOGOUT');
  });
});

describe('password change (§13 previous credential invalidated)', () => {
  it('rejects a wrong current password', async () => {
    const h = await seeded();
    await expect(h.service.changePassword({ userId: 'u-alice', currentPassword: 'Nope1234', newPassword: 'NewStrongPass7' }))
      .rejects.toThrow('CURRENT_PASSWORD_INVALID');
  });

  it('rotates the credential and revokes every existing session', async () => {
    const h = await seeded();
    const first = await h.service.authenticateWithPassword({ identifier: 'alice@example.com', password: 'CorrectHorse9' });
    if (!first.ok) throw new Error('setup failed');
    const res = await h.service.changePassword({ userId: 'u-alice', currentPassword: 'CorrectHorse9', newPassword: 'NewStrongPass7' });
    expect(res.revokedSessions).toBe(1);
    expect(h.service.sessionsFor('u-alice')).toHaveLength(0);
    expect(await h.service.authenticateWithPassword({ identifier: 'alice@example.com', password: 'CorrectHorse9' }))
      .toEqual({ ok: false, code: 'INVALID_CREDENTIALS' });
    const after = await h.service.authenticateWithPassword({ identifier: 'alice@example.com', password: 'NewStrongPass7' });
    expect(after.ok).toBe(true);
  });

  it('enforces policy on the new password', async () => {
    const h = await seeded();
    await expect(h.service.changePassword({ userId: 'u-alice', currentPassword: 'CorrectHorse9', newPassword: 'weak' }))
      .rejects.toThrow(/PASSWORD_POLICY/);
  });
});

describe('lockout / throttling (§8)', () => {
  it('locks the account after the configured failures and keeps the code uniform', async () => {
    const h = await seeded();
    for (let i = 0; i < DEFAULT_LOCKOUT_POLICY.maxAttempts; i++) {
      expect((await h.service.authenticateWithPassword({ identifier: 'alice@example.com', password: 'WrongHorse9' })).ok).toBe(false);
    }
    const locked = await h.service.authenticateWithPassword({ identifier: 'alice@example.com', password: 'CorrectHorse9' });
    expect(locked).toEqual({ ok: false, code: 'ACCOUNT_LOCKED' });
    expect(h.store.get('u-alice')!.status).toBe('LOCKED');
    expect(h.sink.types()).toContain('ACCOUNT_LOCKED');
  });

  it('lockout applies to unknown identifiers too without creating accounts', async () => {
    const h = await seeded();
    for (let i = 0; i < DEFAULT_LOCKOUT_POLICY.maxAttempts; i++) {
      await h.service.authenticateWithPassword({ identifier: 'ghost@example.com', password: 'WrongHorse9' });
    }
    expect((await h.service.authenticateWithPassword({ identifier: 'ghost@example.com', password: 'WrongHorse9' })))
      .toEqual({ ok: false, code: 'ACCOUNT_LOCKED' });
    expect(h.store.get('ghost@example.com')).toBeNull();
  });
});

describe('external ID token path (existing Firebase deployment)', () => {
  it('authenticates a known external identity and honours disabled state', async () => {
    const h = harness();
    h.service.registerExternalUser({ userId: 'fb-1', identifier: 'fb@example.com', now: T0 });
    const verifier = new StaticTokenVerifier({
      'good-token': { userId: 'fb-1', email: 'fb@example.com', displayName: 'FB', disabled: false },
      'other-token': { userId: 'fb-2', email: 'x@example.com', displayName: 'X', disabled: true },
    });
    const ok = await h.service.authenticateExternalToken('good-token', verifier);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.principal.provider).toBe('external-id-token');
    const bad = await h.service.authenticateExternalToken('nope', verifier);
    expect(bad).toEqual({ ok: false, code: 'INVALID_CREDENTIALS' });
    const disabled = await h.service.authenticateExternalToken('other-token', verifier);
    expect(disabled).toEqual({ ok: false, code: 'ACCOUNT_DISABLED' });
  });

  it('provider failure is explicit (never a silent fallback to local auth)', async () => {
    const h = harness();
    const throwing = {
      name: 'throwing-provider',
      verify: async () => {
        throw new Error('network down');
      },
    };
    expect(await h.service.authenticateExternalToken('t', throwing)).toEqual({ ok: false, code: 'PROVIDER_UNAVAILABLE' });
  });

  it('external accounts have no local password', () => {
    const h = harness();
    h.service.registerExternalUser({ userId: 'fb-1', identifier: 'fb@example.com', now: T0 });
    expect(h.store.get('fb-1')!.passwordHash).toBeNull();
  });
});

describe('session mechanics (§9)', () => {
  it('never stores the raw token and rejects wrong tokens', async () => {
    const h = harness();
    const manager = new SessionManager(new InMemorySessionStore(), () => T0);
    const { token, session } = manager.issue('u-1');
    expect(session.tokenHash).not.toBe(token);
    expect(manager.authenticate(token).ok).toBe(true);
    expect(manager.authenticate(`${token}x`).ok).toBe(false);
    expect(manager.authenticate('').ok).toBe(false);
  });

  it('renewal is bounded and then forces re-authentication', () => {
    let clock = T0;
    const manager = new SessionManager(new InMemorySessionStore(), () => clock, { ttlMs: 1000, renewTtlMs: 1000, maxRenewals: 2 });
    const { session } = manager.issue('u-1');
    expect(manager.renew(session.sessionId).ok).toBe(true);
    clock += 10;
    expect(manager.renew(session.sessionId).ok).toBe(true);
    clock += 10;
    const third = manager.renew(session.sessionId);
    expect(third.ok).toBe(false);
    expect(manager.authenticate(manager.issue('u-2').token).ok).toBe(true);
  });

  it('revoked session reports SESSION_REVOKED, expired reports SESSION_EXPIRED', () => {
    let clock = T0;
    const store = new InMemorySessionStore();
    const manager = new SessionManager(store, () => clock, { ttlMs: 100, renewTtlMs: 100, maxRenewals: 5 });
    const a = manager.issue('u-1');
    manager.logout(a.session.sessionId);
    expect(manager.authenticate(a.token)).toEqual({ ok: false, code: 'SESSION_REVOKED' });
    const b = manager.issue('u-2');
    clock += 101;
    expect(manager.authenticate(b.token)).toEqual({ ok: false, code: 'SESSION_EXPIRED' });
  });

  it('logout is idempotent', () => {
    const manager = new SessionManager(new InMemorySessionStore(), () => T0);
    const { session } = manager.issue('u-1');
    expect(manager.logout(session.sessionId)).toBe(true);
    expect(manager.logout(session.sessionId)).toBe(false);
  });
});

describe('event hygiene (§11)', () => {
  it('never emits secret material in audit metadata', async () => {
    const h = await seeded();
    await h.service.authenticateWithPassword({ identifier: 'alice@example.com', password: 'CorrectHorse9' });
    await h.service.authenticateWithPassword({ identifier: 'alice@example.com', password: 'WrongHorse9' });
    const blob = JSON.stringify(h.sink.all());
    expect(blob).not.toContain('CorrectHorse9');
    expect(blob).not.toContain('WrongHorse9');
    expect(blob.toLowerCase()).not.toContain('password"');
  });
});

describe('determinism', () => {
  let clock = T0;
  beforeEach(() => {
    clock = T0;
  });
  it('identical inputs produce identical account state', async () => {
    const build = async () => {
      const store: UserStore = new InMemoryUserStore();
      const sink = new InMemoryAuthEventSink();
      const s = new IdentityService(store, sink, () => T0, new SessionManager(new InMemorySessionStore(), () => T0), new ScryptPasswordHasher());
      await s.createUser({ userId: 'u-1', identifier: 'a@example.com', password: 'CorrectHorse9', now: T0 });
      const r = await s.authenticateWithPassword({ identifier: 'a@example.com', password: 'CorrectHorse9' });
      return { status: store.get('u-1')!.status, lastLoginAt: store.get('u-1')!.lastLoginAt, ok: r.ok, events: sink.types() };
    };
    expect(await build()).toEqual(await build());
    expect(clock).toBe(T0);
  });
});