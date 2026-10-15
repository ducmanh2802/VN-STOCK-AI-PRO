/**
 * PLATFORM-03 — REQUEST CORRELATION (§26) + SECURITY HEADERS (§28/§54)
 *
 * Correlation: every HTTP request gets a requestId; an inbound x-correlation-id is
 * honoured (sanitised) so a trace can be stitched across the whole request chain.
 * Neither value is ever derived from financial data.
 */
import { randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { isDatabaseUnavailable } from '../../db/dbFailure.ts';

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
 * Outbound hosts the SPA legitimately contacts from the browser.
 *
 * The market-data service layer (src/services/market|etf|derivatives) fetches the
 * public VPS/KBS feeds directly, and index.html loads webfonts from Google Fonts.
 * Both were denied by the previous policy, so the browser blocked them with
 * "Refused to connect" / CSP violations and those panels could never load.
 *
 * This is an explicit allowlist of two known public market-data origins plus the
 * Google Fonts CDN — NOT a wildcard. Same-origin, script, and object policies are
 * unchanged, so no new XSS or exfiltration surface is opened, and no secret is
 * ever exposed to the browser (AI/Gemini and database access stay server-side).
 */
const CSP_ALLOWED_CONNECT_HOSTS = [
  'https://bgapidatafeed.vps.com.vn',
  'https://kbbuddywts.kbsec.com.vn',
].join(' ');

/**
 * Build the CSP for the current environment.
 *
 * Production keeps `script-src 'self'` (no inline execution).
 *
 * Development MUST allow `'unsafe-inline'` for scripts: the Vite dev server injects an
 * inline React-Refresh preamble, and `script-src 'self'` blocks it. That produced a
 * completely BLANK screen in dev (bodyChars 0, "Executing inline script violates ...
 * Content Security Policy"), which is fatal in Google AI Studio because the editor
 * runs `npm run dev`. The relaxation is scoped to non-production only — the deployed
 * build is unaffected.
 */
export function buildContentSecurityPolicy(env: string | undefined = process.env.NODE_ENV): string {
  const isDev = env !== 'production';
  const scriptSrc = isDev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'";
  return "default-src 'self'; "
    + `${scriptSrc}; `
    + "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    + "img-src 'self' data: blob:; "
    + `connect-src 'self' ${CSP_ALLOWED_CONNECT_HOSTS}; `
    + "font-src 'self' data: https://fonts.gstatic.com; "
    + "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";
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
  res.setHeader('Content-Security-Policy', buildContentSecurityPolicy());
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

/**
 * Handler error helper for data routes.
 *
 * A dependency outage (Postgres unreachable / not configured) is answered with
 * 503 + `code: DATA_UNAVAILABLE` so clients and operators can tell "the store is
 * down" from "the handler is broken"; everything else stays a 500. The public
 * message is unchanged and no internal detail is exposed in production (§29).
 */
export function sendDataError(res: Response, publicMessage: string, internal?: unknown): void {
  if (!isDatabaseUnavailable(internal)) {
    sendSafeError(res, 500, publicMessage, internal);
    return;
  }
  const body: Record<string, unknown> = {
    error: publicMessage,
    code: 'DATA_UNAVAILABLE',
    dataStatus: 'DATA_UNAVAILABLE',
  };
  if (!isProduction() && internal !== undefined) {
    body.dev = internal instanceof Error ? internal.message : String(internal);
  }
  res.status(503).json(body);
}