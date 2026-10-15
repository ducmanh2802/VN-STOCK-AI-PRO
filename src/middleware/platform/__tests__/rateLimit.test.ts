import { describe, expect, it } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { InMemoryRateLimiter } from '../../../lib/platform/security/rateLimiter.ts';
import { rateLimit } from '../rateLimit.ts';

interface FakeResponse {
  readonly res: Response;
  readonly headers: Record<string, string>;
  status(): number | null;
  body(): unknown;
}

function fakeRes(): FakeResponse {
  const headers: Record<string, string> = {};
  let code: number | null = null;
  let payload: unknown = null;
  const res = {
    setHeader(key: string, value: string) {
      headers[key] = value;
      return this;
    },
    status(next: number) {
      code = next;
      return this;
    },
    json(body: unknown) {
      payload = body;
      return this;
    },
  } as unknown as Response;
  return { res, headers, status: () => code, body: () => payload };
}

function fakeReq(ip = '10.0.0.1'): Request {
  return { ip } as Request;
}

function run(middleware: ReturnType<typeof rateLimit>, req: Request, f: FakeResponse) {
  let called = false;
  const next: NextFunction = () => {
    called = true;
  };
  middleware(req, f.res, next);
  return called;
}

describe('rateLimit HTTP middleware (§50)', () => {
  it('passes traffic under the bucket limit and reports the remaining budget', () => {
    const limiter = new InMemoryRateLimiter(() => 0);
    const middleware = rateLimit({ limiter, bucket: 'expensive' });

    for (let i = 0; i < 20; i += 1) {
      const f = fakeRes();
      expect(run(middleware, fakeReq(), f)).toBe(true);
      expect(f.status()).toBeNull();
      expect(Number(f.headers['X-RateLimit-Remaining'])).toBe(19 - i);
    }
  });

  it('answers 429 RATE_LIMITED with Retry-After once the bucket is spent', () => {
    const limiter = new InMemoryRateLimiter(() => 0);
    const middleware = rateLimit({ limiter, bucket: 'expensive' });

    for (let i = 0; i < 20; i += 1) {
      run(middleware, fakeReq(), fakeRes());
    }

    const f = fakeRes();
    expect(run(middleware, fakeReq(), f)).toBe(false);
    expect(f.status()).toBe(429);
    expect(f.headers['Retry-After']).toBeDefined();
    expect(Number(f.headers['Retry-After'])).toBeGreaterThanOrEqual(1);
    expect(f.body()).toMatchObject({ error: 'rate_limited', code: 'RATE_LIMITED', bucket: 'expensive' });
  });

  it('refills after the injected clock passes the window', () => {
    let clock = 0;
    const limiter = new InMemoryRateLimiter(() => clock);
    const middleware = rateLimit({ limiter, bucket: 'auth' });

    for (let i = 0; i < 10; i += 1) {
      run(middleware, fakeReq(), fakeRes());
    }
    const blocked = fakeRes();
    expect(run(middleware, fakeReq(), blocked)).toBe(false);

    clock = 60_000;
    const after = fakeRes();
    expect(run(middleware, fakeReq(), after)).toBe(true);
    expect(after.status()).toBeNull();
  });

  it('keeps separate budgets per client address', () => {
    const limiter = new InMemoryRateLimiter(() => 0);
    const middleware = rateLimit({ limiter, bucket: 'auth' });

    for (let i = 0; i < 10; i += 1) {
      run(middleware, fakeReq('10.0.0.1'), fakeRes());
    }
    expect(run(middleware, fakeReq('10.0.0.1'), fakeRes())).toBe(false);
    expect(run(middleware, fakeReq('10.0.0.2'), fakeRes())).toBe(true);
  });

  it('never throttles the critical bucket (financial invariants)', () => {
    const limiter = new InMemoryRateLimiter(() => 0);
    const middleware = rateLimit({ limiter, bucket: 'critical' } as never);

    let allowed = 0;
    for (let i = 0; i < 50; i += 1) {
      if (run(middleware, fakeReq(), fakeRes())) allowed += 1;
    }
    expect(allowed).toBe(50);
  });
});
