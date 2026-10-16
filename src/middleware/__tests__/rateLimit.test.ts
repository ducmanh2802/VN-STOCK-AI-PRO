import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { rateLimit } from '../platform/rateLimit.ts';
import { InMemoryRateLimiter } from '../../lib/platform/security/rateLimiter.ts';

function createMockResponse() {
  const headers: Record<string, string> = {};
  const state: { statusCode: number | null; body: any } = {
    statusCode: null,
    body: null,
  };
  const res = {
    setHeader(key: string, value: string) {
      headers[key.toLowerCase()] = String(value);
      return res;
    },
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(body: any) {
      state.body = body;
      return res;
    },
  };
  return { res: res as unknown as Response, state, headers };
}

describe('src/middleware/platform/rateLimit.ts', () => {
  it('allows requests within limit and sets X-RateLimit-Remaining header', () => {
    let now = 1_000_000;
    const limiter = new InMemoryRateLimiter(() => now, {
      public: { limit: 2, windowMs: 60_000 },
      auth: { limit: 2, windowMs: 60_000 },
      expensive: { limit: 2, windowMs: 60_000 },
    });

    const middleware = rateLimit({ limiter, bucket: 'public' });
    const req = { ip: '127.0.0.1' } as unknown as Request;
    const { res, state, headers } = createMockResponse();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(state.statusCode).toBeNull();
    expect(headers['x-ratelimit-remaining']).toBe('1');
  });

  it('rejects requests over limit with 429 and Retry-After header', () => {
    let now = 1_000_000;
    const limiter = new InMemoryRateLimiter(() => now, {
      public: { limit: 1, windowMs: 60_000 },
      auth: { limit: 1, windowMs: 60_000 },
      expensive: { limit: 1, windowMs: 60_000 },
    });

    const middleware = rateLimit({ limiter, bucket: 'public' });
    const req = { ip: '192.168.1.1' } as unknown as Request;

    // First request: allowed
    const first = createMockResponse();
    const next1 = vi.fn();
    middleware(req, first.res, next1);
    expect(next1).toHaveBeenCalledTimes(1);

    // Second request: throttled
    const second = createMockResponse();
    const next2 = vi.fn();
    middleware(req, second.res, next2);
    expect(next2).not.toHaveBeenCalled();
    expect(second.state.statusCode).toBe(429);
    expect(second.state.body).toMatchObject({ error: 'Too Many Requests' });
    expect(second.headers['retry-after']).toBeDefined();
  });
});
