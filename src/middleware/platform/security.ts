/**
 * PLATFORM-03 — REQUEST CORRELATION (§26) + SECURITY HEADERS (§28/§54)
 *
 * Correlation: every HTTP request gets a requestId; an inbound x-correlation-id is
 * honoured (sanitised) so a trace can be stitched across the whole request chain.
 * Neither value is ever derived from financial data.
 */
import { randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const SAFE_ID = /^[A-Za-z0-9_.:-]{1,128}$/;

export function newRequestId(): string {
  return `req_${randomBytes(8).toString('hex')}`;
}

export function sanitizeCorrelationId(value: unknown): string | null {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) return null;
  return value;
}

declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string;
    correlationId?: string | null;
  }
}

export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  req.requestId = newRequestId();
  req.correlationId = sanitizeCorrelationId(req.headers['x-correlation-id']);
  res.setHeader('x-request-id', req.requestId);
  if (req.correlationId) res.setHeader('x-correlation-id', req.correlationId);
  next();
}

/**
 * Conservative header set. No external dependency (helmet is not in the project), and
 * no claim is made that this replaces a full CSP audit — see the architecture doc.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  // The SPA is served from the same origin; scripts stay restricted to self.
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  );
  next();
}

/**
 * §48/§29 graceful response helpers.
 * `safeError` never forwards internal detail to the client in production.
 */
export function isProduction(env: string | undefined = process.env.NODE_ENV): boolean {
  return env === 'production';
}

export function sendSafeError(res: Response, status: number, publicMessage: string, internal?: unknown): void {
  if (!isProduction() && internal !== undefined) {
    // Development diagnostics only, never enabled in production (§29).
    res.status(status).json({ error: publicMessage, dev: internal instanceof Error ? internal.message : String(internal) });
    return;
  }
  res.status(status).json({ error: publicMessage });
}