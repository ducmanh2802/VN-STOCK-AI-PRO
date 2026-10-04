/**
 * PLATFORM-01 — AUTHENTICATION HTTP BOUNDARY
 *
 * §12/§29/§50 rules honoured here:
 *  - uniform 401 body for every credential failure (no account enumeration)
 *  - NO stack traces, SQL, env vars, tokens or provider detail in responses
 *  - rate limited (login is cheap to guess, expensive to hash)
 *  - tokens are returned in the body over TLS and are HttpOnly when cookie mode is
 *    used by the deployment; the client bundle never receives platform secrets
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { IdentityService } from '../identity/identityService.ts';
import type { TokenVerifier } from '../identity/tokenVerifier.ts';
import type { RateLimiter } from '../security/rateLimiter.ts';

const loginSchema = z.object({
  identifier: z.string().min(1).max(320),
  password: z.string().min(1).max(200),
});

const changeSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(1).max(200),
});

const resetSchema = z.object({ identifier: z.string().min(1).max(320) });

/** Every auth failure returns this identical body — existence must never be inferable. */
function unauthorized(res: Response): void {
  res.status(401).json({ error: 'invalid_credentials' });
}

export interface AuthApiOptions {
  readonly identity: IdentityService;
  readonly verifier?: TokenVerifier;
  readonly limiter: RateLimiter;
  /** Header carrying the session token; also accepted as an HttpOnly cookie upstream. */
  readonly tokenHeader?: string;
}

function bearerOf(req: Request, header: string): string | null {
  const direct = req.headers[header];
  if (typeof direct === 'string' && direct.length > 0) return direct;
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

export function createAuthApiRouter(opts: AuthApiOptions): Router {
  const router = Router();
  const header = opts.tokenHeader ?? 'x-platform-session';

  router.post('/login', async (req: Request, res: Response) => {
    if (!opts.limiter.allow('auth:login', req)) {
      return res.status(429).json({ error: 'rate_limited' });
    }
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return unauthorized(res);
    try {
      const result = await opts.identity.authenticateWithPassword(parsed.data);
      if (!result.ok) return unauthorized(res);
      return res.status(200).json({
        userId: result.principal.userId,
        sessionId: result.principal.sessionId,
        expiresAt: result.principal.expiresAt,
        token: result.token,
      });
    } catch {
      // Never leak internals; the audit sink already recorded the failure.
      return unauthorized(res);
    }
  });

  router.post('/logout', (req: Request, res: Response) => {
    const token = bearerOf(req, header);
    const authed = opts.identity.authenticateToken(token);
    if (!authed.ok) return unauthorized(res);
    opts.identity.logout(authed.principal);
    return res.status(200).json({ ok: true });
  });

  router.get('/me', (req: Request, res: Response) => {
    const token = bearerOf(req, header);
    const authed = opts.identity.authenticateToken(token);
    if (!authed.ok) return unauthorized(res);
    return res.status(200).json({
      userId: authed.principal.userId,
      sessionId: authed.principal.sessionId,
      expiresAt: authed.principal.expiresAt,
      provider: authed.principal.provider,
    });
  });

  router.post('/password/change', async (req: Request, res: Response) => {
    if (!opts.limiter.allow('auth:password', req)) {
      return res.status(429).json({ error: 'rate_limited' });
    }
    const token = bearerOf(req, header);
    const authed = opts.identity.authenticateToken(token);
    if (!authed.ok) return unauthorized(res);
    const parsed = changeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_request' });
    try {
      const out = await opts.identity.changePassword({ userId: authed.principal.userId, ...parsed.data });
      return res.status(200).json({ ok: true, revokedSessions: out.revokedSessions });
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      if (code === 'CURRENT_PASSWORD_INVALID') return res.status(403).json({ error: 'current_password_invalid' });
      if (code.startsWith('PASSWORD_POLICY')) return res.status(400).json({ error: 'password_policy_violation' });
      return res.status(500).json({ error: 'internal_error' });
    }
  });

  router.post('/password/reset', (req: Request, res: Response) => {
    if (!opts.limiter.allow('auth:reset', req)) {
      return res.status(429).json({ error: 'rate_limited' });
    }
    const parsed = resetSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_request' });
    // Always the same answer whether or not the account exists (no enumeration).
    opts.identity.requestPasswordReset(parsed.data.identifier);
    return res.status(202).json({ status: 'accepted' });
  });

  if (opts.verifier) {
    router.post('/session', async (req: Request, res: Response) => {
      if (!opts.limiter.allow('auth:session', req)) return res.status(429).json({ error: 'rate_limited' });
      const token = bearerOf(req, header);
      if (!token) return unauthorized(res);
      const result = await opts.identity.authenticateExternalToken(token, opts.verifier!);
      if (!result.ok) return unauthorized(res);
      return res.status(200).json({ userId: result.principal.userId, provider: result.principal.provider });
    });
  }

  return router;
}