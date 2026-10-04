import { describe, expect, it } from 'vitest';
import {
  AUDIT_GENESIS_HASH,
  AuditLog,
  AuthEventAuditSink,
  InMemoryAuditStore,
} from '../auditLog.ts';
import { isSecretKey, redact, redactString, REDACTED } from '../../security/redaction.ts';
import { resolveWithin, validateUploadFilename } from '../../security/pathSafety.ts';
import { sanitizeCorrelationId } from '../../../../middleware/platform/security.ts';

const T = 1_700_000_000_000;

function seeded() {
  const store = new InMemoryAuditStore();
  const audit = new AuditLog(store);
  return { store, audit };
}

describe('§22/§23 audit record completeness', () => {
  it('captures WHO / WHAT / WHEN / WHICH OBJECT / VERSIONS / RESULT / CORRELATION', () => {
    const { audit } = seeded();
    const rec = audit.record({
      occurredAt: T,
      actorUserId: 'u-1',
      organizationId: 'org-1',
      workspaceId: 'ws-1',
      action: 'decision.create',
      resourceType: 'decision',
      resourceId: 'dec-9',
      beforeVersion: null,
      afterVersion: 'v2',
      requestId: 'req_1',
      correlationId: 'corr_1',
      result: 'SUCCESS',
      metadata: { symbol: 'HPG', evidenceRefs: 2 },
    });
    expect(rec).toMatchObject({
      actorUserId: 'u-1',
      organizationId: 'org-1',
      workspaceId: 'ws-1',
      action: 'decision.create',
      resourceType: 'decision',
      resourceId: 'dec-9',
      beforeVersion: null,
      afterVersion: 'v2',
      requestId: 'req_1',
      correlationId: 'corr_1',
      result: 'SUCCESS',
    });
    expect(rec.metadata).toEqual({ symbol: 'HPG', evidenceRefs: 2 });
    expect(rec.prevHash).toBe(AUDIT_GENESIS_HASH);
  });

  it('is deterministic for identical inputs', () => {
    const a = seeded().audit.record({ occurredAt: T, actorUserId: 'u', action: 'journal.create', resourceType: 'journal', result: 'SUCCESS' });
    const b = seeded().audit.record({ occurredAt: T, actorUserId: 'u', action: 'journal.create', resourceType: 'journal', result: 'SUCCESS' });
    expect(a.hash).toBe(b.hash);
  });
});

describe('§25 immutability + tamper evidence', () => {
  it('offers no update or delete operation', () => {
    const store = new InMemoryAuditStore();
    const audit = new AuditLog(store);
    audit.record({ occurredAt: T, actorUserId: 'u', action: 'journal.create', resourceType: 'journal', result: 'SUCCESS' });
    const api = audit as unknown as Record<string, unknown>;
    expect(api.update).toBeUndefined();
    expect(api.delete).toBeUndefined();
    expect(api.remove).toBeUndefined();
    expect(typeof audit.verifyIntegrity).toBe('function');
  });

  it('intact chains verify', () => {
    const { audit } = seeded();
    for (let i = 0; i < 5; i++) {
      audit.record({ occurredAt: T + i, actorUserId: 'u', action: 'journal.create', resourceType: 'journal', resourceId: `j${i}`, result: 'SUCCESS' });
    }
    expect(audit.verifyIntegrity()).toMatchObject({ ok: true, checked: 5, brokenAt: null });
  });

  it('detects a mutated record', () => {
    const store = new InMemoryAuditStore();
    const audit = new AuditLog(store);
    audit.record({ occurredAt: T, actorUserId: 'u', action: 'risk.rejection', resourceType: 'risk', result: 'DENIED' });
    const tampered = store.all()[0] as unknown as Record<string, unknown>;
    tampered.result = 'SUCCESS'; // simulate an out-of-band edit
    const report = audit.verifyIntegrity();
    expect(report.ok).toBe(false);
    expect(report.reason).toBe('record_hash_mismatch');
  });

  it('detects deletion and reordering via the prev-hash chain', () => {
    const store = new InMemoryAuditStore();
    const audit = new AuditLog(store);
    for (let i = 0; i < 3; i++) audit.record({ occurredAt: T + i, actorUserId: 'u', action: 'journal.create', resourceType: 'journal', result: 'SUCCESS' });
    const all = store.all();
    store.clear();
    store.append(all[2]!);
    store.append(all[0]!);
    expect(audit.verifyIntegrity().ok).toBe(false);
  });
});

describe('§28/§43 secrets never reach the audit log', () => {
  it('redacts secret-named keys at any depth', () => {
    const { audit } = seeded();
    const rec = audit.record({
      occurredAt: T,
      actorUserId: 'u',
      action: 'auth.login',
      resourceType: 'identity',
      result: 'SUCCESS',
      metadata: {
        password: 'CorrectHorse9',
        authorization: 'Bearer abc123',
        apiKey: 'sk-live-123456',
        nested: { clientSecret: 'shhh', sessionId: 'sess_1', keep: 'visible' },
        symbol: 'HPG',
      },
    });
    const blob = JSON.stringify(rec);
    expect(blob).not.toContain('CorrectHorse9');
    expect(blob).not.toContain('sk-live-123456');
    expect(blob).not.toContain('shhh');
    expect(blob).not.toContain('Bearer abc123');
    expect(blob).toContain(REDACTED);
    expect(blob).toContain('HPG');
    expect(blob).toContain('visible');
  });

  it('detects secrets by value shape even under an innocent key', () => {
    expect(redactString('token is Bearer eyJhbGciOi.eyJzdWIiOi.SflKxwRJSM')).toContain(REDACTED);
    const { audit } = seeded();
    const rec = audit.record({
      occurredAt: T,
      actorUserId: 'u',
      action: 'auth.login',
      resourceType: 'identity',
      result: 'SUCCESS',
      metadata: { note: `-----BEGIN ${'RSA'} PRIVATE KEY-----\n${'MIIE'}\n-----END ${'RSA'} PRIVATE KEY-----` },
    });
    expect(JSON.stringify(rec)).not.toContain('MIIE');
  });

  it('key classifier covers the credential vocabulary', () => {
    for (const k of ['password', 'Password', 'api_key', 'APIKEY', 'refreshToken', 'Authorization', 'cookie', 'client_secret', 'privateKey']) {
      expect(isSecretKey(k)).toBe(true);
    }
    expect(isSecretKey('symbol')).toBe(false);
    expect(isSecretKey('quantity')).toBe(false);
  });

  it('bounds recursion and size instead of exploding', () => {
    const deep: Record<string, unknown> = { a: { b: { c: { d: { e: { f: { g: 'too deep' } } } } } } };
    expect(JSON.stringify(redact(deep))).toContain('TRUNCATED');
    expect(JSON.stringify(redact({ big: 'x'.repeat(5000) })).length).toBeLessThan(2200);
    expect(JSON.stringify(redact({ list: new Array(500).fill(1) })).length).toBeLessThan(5000);
  });
});

describe('§26 correlation ids', () => {
  it('accepts only safe ids and rejects injection attempts', () => {
    expect(sanitizeCorrelationId('corr-abc_1.2:3')).toBe('corr-abc_1.2:3');
    expect(sanitizeCorrelationId('bad value')).toBeNull();
    expect(sanitizeCorrelationId('x'.repeat(200))).toBeNull();
    expect(sanitizeCorrelationId('<script>alert(1)</script>')).toBeNull();
    expect(sanitizeCorrelationId(42)).toBeNull();
    expect(sanitizeCorrelationId(undefined)).toBeNull();
  });
});

describe('§52 path traversal + upload safety', () => {
  it('resolves paths strictly inside the base directory', () => {
    expect(resolveWithin('/srv/data', 'reports/2026/q3.csv').safe).toBe(true);
    expect(resolveWithin('/srv/data', '../../etc/passwd')).toMatchObject({ safe: false, reason: 'path_traversal' });
    expect(resolveWithin('/srv/data', '/etc/passwd')).toMatchObject({ safe: false, reason: 'path_traversal' });
    expect(resolveWithin('/srv/data', 'a/../../b')).toMatchObject({ safe: false });
    expect(resolveWithin('/srv/data', '')).toMatchObject({ safe: false, reason: 'empty_path' });
    expect(resolveWithin('/srv/data', 'a\0b')).toMatchObject({ safe: false, reason: 'nul_byte' });
  });

  it('validates filenames by extension and size, never by client MIME type', () => {
    expect(validateUploadFilename('q3.csv', 1024, 512).ok).toBe(true);
    expect(validateUploadFilename('evil.exe', 1024, 10)).toMatchObject({ ok: false, reason: 'extension_not_allowed' });
    expect(validateUploadFilename('../q3.csv', 1024, 10)).toMatchObject({ ok: false, reason: 'invalid_filename' });
    expect(validateUploadFilename('q3.csv', 1024, 4096)).toMatchObject({ ok: false, reason: 'size_exceeded' });
    expect(validateUploadFilename('q3.csv', 1024, 0)).toMatchObject({ ok: false, reason: 'size_exceeded' });
  });
});

describe('identity events reach the audit trail (§11 + §24)', () => {
  it('bridges auth events with the correct action mapping and outcome', () => {
    const { audit } = seeded();
    const sink = new AuthEventAuditSink(audit, () => T);
    sink.record({ type: 'LOGIN_SUCCESS', userId: 'u-1', sessionId: 'sess-1', occurredAt: T, outcome: 'SUCCESS', metadata: {} });
    sink.record({ type: 'LOGIN_FAILURE', userId: null, sessionId: null, occurredAt: T, outcome: 'FAILURE', metadata: { reason: 'invalid_credentials' } });
    sink.record({ type: 'PASSWORD_CHANGED', userId: 'u-1', sessionId: null, occurredAt: T, outcome: 'SUCCESS', metadata: {} });
    const actions = audit.all().map((r) => `${r.action}:${r.result}`);
    expect(actions).toEqual(['auth.login:SUCCESS', 'auth.login:FAILURE', 'auth.password_change:SUCCESS']);
    expect(audit.verifyIntegrity().ok).toBe(true);
  });
});

describe('audit read path', () => {
  it('filters without mutating and stays bounded', () => {
    const { audit } = seeded();
    audit.record({ occurredAt: T, actorUserId: 'u-1', action: 'decision.create', resourceType: 'decision', resourceId: 'd1', workspaceId: 'ws', result: 'SUCCESS' });
    audit.record({ occurredAt: T + 1, actorUserId: 'u-2', action: 'risk.rejection', resourceType: 'risk', resourceId: 'r1', workspaceId: 'ws', result: 'DENIED' });
    expect(audit.query({ actorUserId: 'u-1' })).toHaveLength(1);
    expect(audit.query({ action: 'risk.rejection' })).toHaveLength(1);
    expect(audit.query({ workspaceId: 'ws', limit: 1 })).toHaveLength(1);
    expect(audit.all()).toHaveLength(2);
  });
});