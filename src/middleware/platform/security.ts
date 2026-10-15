import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { isDatabaseUnavailable } from '../../db/dbFailure.ts';

declare global {
  namespace Express {
    interface Request {
      id?: string;
      correlationId?: string;
    }
  }
}

const SAFE_CORRELATION_ID_REGEX = /^[a-zA-Z0-9_\-.:]{1,64}$/;

export function sanitizeCorrelationId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 64) return null;
  if (!SAFE_CORRELATION_ID_REGEX.test(trimmed)) return null;
  return trimmed;
}

export function buildContentSecurityPolicy(): string {
  const isDev = process.env.NODE_ENV !== 'production';
  const scriptSrc = isDev ? "'self' 'unsafe-inline'" : "'self'";

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https:",
    "connect-src 'self' https://bgapidatafeed.vps.com.vn https://kbbuddywts.kbsec.com.vn https://fonts.googleapis.com https://fonts.gstatic.com",
    "frame-ancestors 'self'",
  ].join('; ');
}

export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = crypto.randomUUID();
  req.id = requestId;
  res.setHeader('x-request-id', requestId);

  const rawCorrelation = req.headers['x-correlation-id'];
  const sanitized = sanitizeCorrelationId(rawCorrelation);
  if (sanitized) {
    req.correlationId = sanitized;
    res.setHeader('x-correlation-id', sanitized);
  }

  next();
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Content-Security-Policy', buildContentSecurityPolicy());
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
}

export function sendSafeError(
  res: Response,
  statusCode: number,
  message: string,
  error?: unknown
): void {
  const isProd = process.env.NODE_ENV === 'production';
  const body: Record<string, unknown> = {
    error: message,
  };

  if (!isProd && error instanceof Error) {
    body.dev = error.message;
  }

  res.status(statusCode).json(body);
}

export function sendDataError(
  res: Response,
  message: string,
  error?: unknown
): void {
  const isProd = process.env.NODE_ENV === 'production';

  if (isDatabaseUnavailable(error)) {
    const body: Record<string, unknown> = {
      error: message,
      code: 'DATA_UNAVAILABLE',
      dataStatus: 'DATA_UNAVAILABLE',
    };

    if (!isProd && error instanceof Error) {
      body.dev = error.message;
    }

    res.status(503).json(body);
    return;
  }

  const body: Record<string, unknown> = {
    error: message,
  };

  if (!isProd && error instanceof Error) {
    body.dev = error.message;
  }

  res.status(500).json(body);
}
