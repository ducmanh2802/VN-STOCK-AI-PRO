/**
 * PLATFORM — HTTP ADAPTER FOR THE §50 RATE LIMITER
 *
 * The limiter itself is pure and clock-injected (`src/lib/platform/security/rateLimiter.ts`).
 * This module only translates an Express request into a bucket decision and a 429.
 *
 * Scope: the expensive, externally-billable lanes — the Gemini proxy (`POST
 * /api/ai/chat`) and the real-KBS backtest runner (`POST /api/backtest/run`).
 * Data reads are deliberately NOT throttled: a dashboard polling quotes must never
 * be refused because another tab was open. Financial execution stays in the
 * `critical` bucket, which the limiter bypasses by design.
 */
import type { NextFunction, Request, Response } from 'express';
import {
  rateLimitIdentity,
  type BucketClass,
  type RateLimiter,
} from '../../lib/platform/security/rateLimiter.ts';

export interface RateLimitOptions {
  readonly limiter: RateLimiter;
  readonly bucket: Exclude<BucketClass, 'critical'>;
  /** Overrides the identity (default: authenticated user, else client address). */
  readonly key?: (req: Request) => string;
}

export function rateLimit(options: RateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const identity = options.key ? options.key(req) : rateLimitIdentity({ ip: req.ip ?? null });
    const decision = options.limiter.allow(identity, { ip: req.ip ?? null }, options.bucket);

    if (decision.allowed) {
      res.setHeader('X-RateLimit-Remaining', String(decision.remaining));
      next();
      return;
    }

    const retryAfterSec = Math.max(1, Math.ceil(decision.retryAfterMs / 1000));
    res.setHeader('Retry-After', String(retryAfterSec));
    res.status(429).json({
      error: 'rate_limited',
      code: 'RATE_LIMITED',
      bucket: options.bucket,
      retryAfterMs: decision.retryAfterMs,
    });
  };
}
