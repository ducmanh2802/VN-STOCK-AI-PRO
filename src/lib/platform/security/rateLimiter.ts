export type BucketClass = 'public' | 'auth' | 'expensive' | 'auth:login';

export interface RateLimitPolicy {
  limit: number;
  windowMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export interface RateLimiter {
  allow(keyOrBucket: string, req?: any, bucket?: BucketClass): RateLimitDecision;
}

export function rateLimitIdentity(params: { userId?: string | null; ip?: string | null }): string {
  if (params.userId) return `user:${params.userId}`;
  return `ip:${params.ip || '127.0.0.1'}`;
}

export class InMemoryRateLimiter implements RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly policies: Record<string, RateLimitPolicy> = {
      public: { limit: 120, windowMs: 60_000 },
      auth: { limit: 10, windowMs: 60_000 },
      'auth:login': { limit: 10, windowMs: 60_000 },
      critical: { limit: 1000, windowMs: 60_000 },
      expensive: { limit: 30, windowMs: 60_000 },
    }
  ) {}

  allow(keyOrBucket: string, req?: any, bucketClass?: BucketClass): RateLimitDecision {
    const bucket = bucketClass || (this.policies[keyOrBucket] ? keyOrBucket : 'public');
    const policy = this.policies[bucket] ?? { limit: 60, windowMs: 60_000 };
    const nowMs = this.now();

    let idKey = keyOrBucket;
    if (req && !bucketClass) {
      const ip = req.ip || req.headers?.['x-forwarded-for'] || '127.0.0.1';
      idKey = `${keyOrBucket}:${ip}`;
    }

    const record = this.hits.get(idKey);
    if (!record || record.resetAt <= nowMs) {
      this.hits.set(idKey, { count: 1, resetAt: nowMs + policy.windowMs });
      return { allowed: true, remaining: policy.limit - 1, retryAfterMs: 0 };
    }

    if (record.count >= policy.limit) {
      const retryAfterMs = Math.max(1000, record.resetAt - nowMs);
      return { allowed: false, remaining: 0, retryAfterMs };
    }

    record.count++;
    return { allowed: true, remaining: policy.limit - record.count, retryAfterMs: 0 };
  }
}
