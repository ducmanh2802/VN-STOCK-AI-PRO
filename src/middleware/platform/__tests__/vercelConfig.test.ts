import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { securityHeaders } from '../security.ts';

/**
 * Vercel serves only the static frontend, so Express (and securityHeaders) never runs there.
 * vercel.json must therefore carry the same production header set itself, and must not
 * publish the bundled server (`npm run build` also writes dist/server.cjs + its source map).
 */
interface VercelConfig {
  buildCommand: string;
  outputDirectory: string;
  rewrites: Array<{ source: string; destination: string }>;
  headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
}

const config = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../../vercel.json', import.meta.url)), 'utf8')
) as VercelConfig;

const ORIGINAL_ENV = process.env.NODE_ENV;
const ORIGINAL_OVERRIDE = process.env.FRAME_ANCESTORS;

afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = ORIGINAL_ENV;
  if (ORIGINAL_OVERRIDE === undefined) delete process.env.FRAME_ANCESTORS; else process.env.FRAME_ANCESTORS = ORIGINAL_OVERRIDE;
});

function productionHeaders(): Record<string, string> {
  process.env.NODE_ENV = 'production';
  delete process.env.FRAME_ANCESTORS;
  const headers: Record<string, string> = {};
  const res = { setHeader: (k: string, v: string) => { headers[k] = v; } } as unknown as Response;
  securityHeaders({} as Request, res, (() => undefined) as NextFunction);
  return headers;
}

describe('vercel.json', () => {
  it('sends exactly the production header set of securityHeaders on every path', () => {
    const allPaths = config.headers.find(h => h.source === '/(.*)');
    expect(allPaths).toBeDefined();
    const vercel = Object.fromEntries(allPaths!.headers.map(h => [h.key, h.value]));
    expect(vercel).toEqual(productionHeaders());
  });

  it('builds only the frontend, so the server bundle and its source map are never published', () => {
    expect(config.buildCommand).toBe('npx vite build');
    expect(config.outputDirectory).toBe('dist');
  });

  it('falls back to index.html for app routes but not for /api or missing assets', () => {
    const [rewrite] = config.rewrites;
    expect(rewrite.destination).toBe('/index.html');
    const source = new RegExp(`^${rewrite.source}$`);
    for (const route of ['/', '/market', '/stock/HPG', '/learn/path/1']) expect(source.test(route)).toBe(true);
    for (const path of ['/api/health', '/api/market/indices', '/assets/index-abc.js']) expect(source.test(path)).toBe(false);
  });
});
