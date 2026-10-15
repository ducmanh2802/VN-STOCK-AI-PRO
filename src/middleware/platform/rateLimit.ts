import type { Request, Response, NextFunction } from 'express';
import {
  type BucketClass,
  type RateLimiter,
  rateLimitIdentity,
} from '../../lib/platform/security/rateLimiter.ts';

export interface RateLimitMiddlewareOptions {
  readonly limiter: RateLimiter;
  readonly bucket?: BucketClass;
}

export function rateLimit(options: RateLimitMiddlewareOptions) {
  const bucket = options.bucket ?? 'auth';

  return (req: Request, res: Response, next: NextFunction): void => {
    const userId = (req as any).user?.uid || (req as any).user?.id || (req as any).userId || null;
    const ip = req.ip || (req.socket && req.socket.remoteAddress) || null;
    const key = rateLimitIdentity({ userId, ip });

    const decision = options.limiter.allow(key, req, bucket);
    if (!decision.allowed) {
      const retryAfterSec = Math.max(1, Math.ceil(decision.retryAfterMs / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        error: 'Too Many Requests',
        retryAfterMs: decision.retryAfterMs,
      });
      return;
    }

    if (Number.isFinite(decision.remaining)) {
      res.setHeader('X-RateLimit-Remaining', String(decision.remaining));
    }
    next();
  };
}
