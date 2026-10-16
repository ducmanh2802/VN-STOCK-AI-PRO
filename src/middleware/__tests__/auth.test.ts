import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Response, NextFunction } from 'express';
import { requireAuth, type AuthRequest } from '../auth.ts';
import { adminAuth, AdminAuthUnavailableError } from '../../lib/firebase-admin.ts';

function createMockResponse() {
  const state: { statusCode: number | null; body: any } = {
    statusCode: null,
    body: null,
  };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(body: any) {
      state.body = body;
      return res;
    },
  };
  return { res: res as unknown as Response, state };
}

describe('src/middleware/auth.ts — requireAuth', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects missing Authorization header with 401', async () => {
    const req = { headers: {} } as AuthRequest;
    const { res, state } = createMockResponse();
    const next = vi.fn();

    await requireAuth(req, res, next);

    expect(state.statusCode).toBe(401);
    expect(state.body).toEqual({ error: 'Unauthorized: Missing token' });
    expect(next).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it('rejects non-Bearer Authorization header with 401', async () => {
    const req = { headers: { authorization: 'Basic dXNlcjpwYXNz' } } as AuthRequest;
    const { res, state } = createMockResponse();
    const next = vi.fn();

    await requireAuth(req, res, next);

    expect(state.statusCode).toBe(401);
    expect(state.body).toEqual({ error: 'Unauthorized: Missing token' });
    expect(next).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it('rejects empty Bearer token with 401', async () => {
    const req = { headers: { authorization: 'Bearer ' } } as AuthRequest;
    const { res, state } = createMockResponse();
    const next = vi.fn();

    await requireAuth(req, res, next);

    expect(state.statusCode).toBe(401);
    expect(state.body).toEqual({ error: 'Unauthorized: Missing token' });
    expect(next).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it('fails closed with 401 AUTH_CONFIGURATION_REQUIRED when AdminAuthUnavailableError is thrown', async () => {
    vi.spyOn(adminAuth, 'verifyIdToken').mockRejectedValue(
      new AdminAuthUnavailableError('FIREBASE_PROJECT_ID not set')
    );

    const req = { headers: { authorization: 'Bearer some-token' } } as AuthRequest;
    const { res, state } = createMockResponse();
    const next = vi.fn();

    await requireAuth(req, res, next);

    expect(state.statusCode).toBe(401);
    expect(state.body).toEqual({ status: 'AUTH_CONFIGURATION_REQUIRED' });
    expect(next).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it('rejects invalid or expired token with 401 Unauthorized: Invalid token', async () => {
    vi.spyOn(adminAuth, 'verifyIdToken').mockRejectedValue(new Error('Firebase ID token has expired'));

    const req = { headers: { authorization: 'Bearer expired-token' } } as AuthRequest;
    const { res, state } = createMockResponse();
    const next = vi.fn();

    await requireAuth(req, res, next);

    expect(state.statusCode).toBe(401);
    expect(state.body).toEqual({ error: 'Unauthorized: Invalid token' });
    expect(next).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it('sets req.user and calls next() on valid token', async () => {
    const mockDecoded = {
      uid: 'user-123',
      email: 'user@example.com',
      name: 'Nguyen Van A',
      aud: 'proj',
      auth_time: 12345,
      exp: 99999,
      firebase: { identities: {}, sign_in_provider: 'google.com' },
      iat: 12345,
      iss: 'firebase',
      sub: 'user-123',
    };
    vi.spyOn(adminAuth, 'verifyIdToken').mockResolvedValue(mockDecoded as any);

    const req = { headers: { authorization: 'Bearer valid-jwt-token' } } as AuthRequest;
    const { res, state } = createMockResponse();
    const next = vi.fn();

    await requireAuth(req, res, next);

    expect(state.statusCode).toBeNull();
    expect(req.user).toEqual(mockDecoded);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
