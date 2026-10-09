import { describe, it, expect } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { createNewsMacroListRouter } from '../NewsMacroListRouter';
import {
  NewsMacroListService,
  type NewsMacroDataSource,
} from '../../../../services/newsMacro/NewsMacroListService';
import type { NewsMacroQuery } from '../../../../lib/db/NewsMacroRepository';

const article = {
  id: 11,
  stockSymbol: 'HPG',
  title: 'Hòa Phát công bố kết quả kinh doanh',
  source: 'KBS',
  url: 'https://kbs.vn/hpg-2026',
  summary: 'Tóm tắt',
  sentiment: 'POSITIVE',
  publishedAt: new Date('2026-10-01T02:30:00.000Z'),
};

const observed: Partial<Record<keyof NewsMacroDataSource, NewsMacroQuery>> = {};

function source(overrides: Partial<NewsMacroDataSource> = {}): NewsMacroDataSource {
  return {
    listNews: (q) => {
      observed.listNews = q;
      return Promise.resolve([article]);
    },
    listPolicyEvents: () => Promise.resolve([]),
    listEarningsCalendar: () => Promise.resolve([]),
    listMacroObservations: () => Promise.resolve([]),
    ...overrides,
  };
}

function createHarness(dataSource: NewsMacroDataSource) {
  const service = new NewsMacroListService(dataSource);
  const app = express();
  // Mirrors server.ts: the four list routes are mounted on /api as a whole.
  app.use('/api', createNewsMacroListRouter(service));

  return new Promise<{ baseUrl: string; close: () => Promise<void> }>((resolve) => {
    const server: Server = app.listen(0, '127.0.0.1', () => {
      const address = server.address() as { port: number };
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}/api`,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

describe('NewsMacroListRouter — the four list routes', () => {
  it('serves news, policy-events, earnings-calendar and macro-observations (no 404)', async () => {
    const harness = await createHarness(source());
    try {
      for (const path of ['/news', '/policy-events', '/earnings-calendar', '/macro/observations']) {
        const res = await fetch(`${harness.baseUrl}${path}`);
        expect(res.status, `${path} should exist`).toBe(200);
        const body = (await res.json()) as { dataStatus: string; items: unknown[]; count: number };
        expect(body.dataStatus).toBe('OK');
        expect(Array.isArray(body.items)).toBe(true);
        expect(body.count).toBe(body.items.length);
      }
    } finally {
      await harness.close();
    }
  });

  it('returns the deduped news item with canonical fields', async () => {
    const harness = await createHarness(source());
    try {
      const res = await fetch(`${harness.baseUrl}/news`);
      const body = (await res.json()) as {
        kind: string;
        items: Array<{ key: string; canonicalTimestamp: string; source: string; url: string }>;
        nextCursor: string | null;
      };
      expect(body.kind).toBe('NEWS');
      expect(body.items[0]).toMatchObject({
        key: 'news:url:kbs.vn/hpg-2026',
        canonicalTimestamp: '2026-10-01T02:30:00.000Z',
        source: 'KBS',
      });
      expect(body.nextCursor).toBeNull();
    } finally {
      await harness.close();
    }
  });

  it('forwards limit, cursor and filters to the shared service', async () => {
    const harness = await createHarness(source());
    try {
      const res = await fetch(
        `${harness.baseUrl}/news?limit=5&symbol=hpg&cursor=${encodeURIComponent('2026-10-01T02:30:00.000Z#11')}`
      );
      expect(res.status).toBe(200);
      expect(observed.listNews).toMatchObject({ limit: 20, symbol: 'HPG' });
      expect(observed.listNews?.cursor).toEqual({ ts: '2026-10-01T02:30:00.000Z', id: 11 });
    } finally {
      await harness.close();
    }
  });

  it('answers 400 with a typed code for invalid params', async () => {
    const harness = await createHarness(source());
    try {
      const badLimit = await fetch(`${harness.baseUrl}/news?limit=0`);
      expect(badLimit.status).toBe(400);
      expect(await badLimit.json()).toMatchObject({ error: { code: 'INVALID_LIMIT' } });

      const badCursor = await fetch(`${harness.baseUrl}/macro/observations?cursor=garbage`);
      expect(badCursor.status).toBe(400);
      expect(await badCursor.json()).toMatchObject({ error: { code: 'INVALID_CURSOR' } });

      const badFilter = await fetch(`${harness.baseUrl}/earnings-calendar?symbol=%3BDROP`);
      expect(badFilter.status).toBe(400);
      expect(await badFilter.json()).toMatchObject({ error: { code: 'INVALID_FILTER' } });
    } finally {
      await harness.close();
    }
  });

  it('answers 503 DATA_UNAVAILABLE with an empty list when the store is down', async () => {
    const harness = await createHarness(
      source({
        listNews: () => Promise.reject(new Error('ECONNREFUSED 127.0.0.1:5432')),
        listPolicyEvents: () => Promise.reject(new Error('ECONNREFUSED 127.0.0.1:5432')),
        listEarningsCalendar: () => Promise.reject(new Error('ECONNREFUSED 127.0.0.1:5432')),
        listMacroObservations: () => Promise.reject(new Error('ECONNREFUSED 127.0.0.1:5432')),
      })
    );
    try {
      for (const path of ['/news', '/policy-events', '/earnings-calendar', '/macro/observations']) {
        const res = await fetch(`${harness.baseUrl}${path}`);
        expect(res.status, `${path} must be 503 when the store is down`).toBe(503);
        const body = (await res.json()) as {
          items: unknown[];
          dataStatus: string;
          error: { code: string };
          count: number;
        };
        expect(body.items).toEqual([]);
        expect(body.count).toBe(0);
        expect(body.dataStatus).toBe('DATA_UNAVAILABLE');
        expect(body.error.code).toBe('DATA_UNAVAILABLE');
      }
    } finally {
      await harness.close();
    }
  });

  it('never leaks the underlying driver error message to an unauthenticated caller', async () => {
    const harness = await createHarness(
      source({
        listNews: () =>
          Promise.reject(new Error('password authentication failed for user "postgres"')),
      })
    );
    try {
      const res = await fetch(`${harness.baseUrl}/news`);
      const text = await res.text();
      expect(res.status).toBe(503);
      expect(text).not.toContain('password');
      expect(text).not.toContain('postgres');
    } finally {
      await harness.close();
    }
  });
});
