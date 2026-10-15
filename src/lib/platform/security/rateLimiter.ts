/**
 * PLATFORM SECURITY — RATE LIMITER (pure, clock injected)
 *
 * §50: protect login / reset / AI / research / replay without ever throttling a
 * critical internal financial operation (ledger posting, reconciliation).
 *
 * Fail-safe semantics: this limiter is a *defence in depth* layer. If accounting or
 * execution code calls it, the operation is refused by default unless the bucket is
 * declared `critical`, in which case limiting is bypassed rather than risk corrupting
 * a financial invariant.
 */

export type BucketClass = 'public' | 'auth' | 'expensive' | 'critical';

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterMs: number;
  readonly class: BucketClass;
}

interface Window {
  count: number;
  resetAt: number;
}

export interface RateLimiter {
  allow(key: string, req?: unknown, cls?: BucketClass): RateLimitDecision;
}

export interface RateLimitRule {
  readonly limit: number;
  readonly windowMs: number;
}

export const DEFAULT_RULES: Readonly<Record<Exclude<BucketClass, 'critical'>, RateLimitRule>> = {
  public: { limit: 120, windowMs: 60_000 },
  auth: { limit: 10, windowMs: 60_000 },
  expensive: { limit: 20, windowMs: 60_000 },
};

/** Identity for rate limiting: authenticated subject first, else client address. */
export function rateLimitIdentity(req: { userId?: string | null; ip?: string | null }): string {
  if (req && typeof req.userId === 'string' && req.userId.length > 0) return `u:${req.userId}`;
  if (req && typeof req.ip === 'string' && req.ip.length > 0) return `ip:${req.ip}`;
  return 'anonymous';
}

export class InMemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly now: () => number,
    private readonly rules: Readonly<Record<Exclude<BucketClass, 'critical'>, RateLimitRule>> = DEFAULT_RULES,
  ) {}

  allow(key: string, req?: unknown, cls: BucketClass = 'auth'): RateLimitDecision {
    if (cls === 'critical') {
      // Never throttle accounting/execution invariants.
      return { allowed: true, remaining: Number.POSITIVE_INFINITY, retryAfterMs: 0, class: cls };
    }
    const rule = this.rules[cls];
    const at = this.now();
    const k = `${cls}:${key}`;
    const w = this.windows.get(k);
    if (!w || at >= w.resetAt) {
      this.windows.set(k, { count: 1, resetAt: at + rule.windowMs });
      return { allowed: true, remaining: rule.limit - 1, retryAfterMs: 0, class: cls };
    }
    if (w.count >= rule.limit) {
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, w.resetAt - at), class: cls };
    }
    w.count += 1;
    return { allowed: true, remaining: rule.limit - w.count, retryAfterMs: 0, class: cls };
  }

  reset(): void {
    this.windows.clear();
  }
}