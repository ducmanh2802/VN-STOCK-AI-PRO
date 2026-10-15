import { afterEach, describe, expect, it } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { buildContentSecurityPolicy, frameAncestors, securityHeaders } from '../security.ts';

const ORIGINAL_ENV = process.env.NODE_ENV;
const ORIGINAL_OVERRIDE = process.env.FRAME_ANCESTORS;

function headersFor(nodeEnv: string | undefined, override?: string): Record<string, string> {
  if (nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = nodeEnv;
  if (override === undefined) delete process.env.FRAME_ANCESTORS; else process.env.FRAME_ANCESTORS = override;
  const headers: Record<string, string> = {};
  const res = { setHeader: (k: string, v: string) => { headers[k] = v; } } as unknown as Response;
  securityHeaders({} as Request, res, (() => undefined) as NextFunction);
  return headers;
}

afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = ORIGINAL_ENV;
  if (ORIGINAL_OVERRIDE === undefined) delete process.env.FRAME_ANCESTORS; else process.env.FRAME_ANCESTORS = ORIGINAL_OVERRIDE;
});

describe('frame-ancestors policy', () => {
  it('production and test cannot be framed and keep X-Frame-Options: DENY', () => {
    for (const env of ['production', 'test']) {
      const h = headersFor(env);
      expect(h['X-Frame-Options']).toBe('DENY');
      expect(h['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    }
  });

  it('the dev server (npm run dev, NODE_ENV unset or development) can be framed by the AI Studio Preview', () => {
    for (const env of [undefined, 'development']) {
      const h = headersFor(env);
      expect(h['X-Frame-Options']).toBeUndefined();
      expect(h['Content-Security-Policy']).toContain("frame-ancestors 'self' https: http://localhost:* http://127.0.0.1:*");
      expect(h['Content-Security-Policy']).not.toContain("frame-ancestors 'none'");
    }
  });

  it('keeps every other header in every environment', () => {
    for (const env of ['production', 'development']) {
      const h = headersFor(env);
      expect(h['X-Content-Type-Options']).toBe('nosniff');
      expect(h['Referrer-Policy']).toBe('no-referrer');
      expect(h['Cross-Origin-Opener-Policy']).toBe('same-origin');
      expect(h['Content-Security-Policy']).toContain("object-src 'none'");
    }
  });

  it('honours an explicit FRAME_ANCESTORS allow-list, also in production', () => {
    const h = headersFor('production', "'self' https://aistudio.google.com");
    expect(h['Content-Security-Policy']).toContain("frame-ancestors 'self' https://aistudio.google.com;");
    expect(h['X-Frame-Options']).toBeUndefined();
  });

  it('ignores an override that could inject another directive', () => {
    expect(frameAncestors('production', "'self'; script-src *")).toBe("'none'");
    expect(buildContentSecurityPolicy('production')).not.toContain('script-src *');
  });
});
