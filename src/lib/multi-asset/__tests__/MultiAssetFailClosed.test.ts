/**
 * PHASE 29 — MULTI-ASSET FAIL-CLOSED TESTS
 */
import { describe, expect, it } from 'vitest';
import { MultiAssetPositionEngine } from '../MultiAssetPositionEngine.ts';
import { QuantPlatformIntegrationEngine } from '../QuantPlatformIntegrationEngine.ts';

const ASOF = '2026-09-30';
const EVAL = '2026-09-30T08:00:00.000Z';

describe('Multi-asset fail-closed', () => {
  it('missing futures price => DATA_UNAVAILABLE summary (never zero-filled)', () => {
    const s = QuantPlatformIntegrationEngine.build({
      positions: [
        {
          symbol: 'VN30F1M', assetClass: 'DERIVATIVE', quantity: 1, markPrice: null,
          marginPerContract: 30_000_000, unrealizedPnl: 0, expiryDate: '2026-10-16',
        },
      ],
      asOfDate: ASOF,
      evaluatedAt: EVAL,
    });
    expect(s.summary.netAssets).toBeNull();
    expect(s.dataFreshness).toBe('UNAVAILABLE');
  });

  it('missing margin => DATA_UNAVAILABLE (never estimated)', () => {
    const s = QuantPlatformIntegrationEngine.build({
      positions: [
        {
          symbol: 'VN30F1M', assetClass: 'DERIVATIVE', quantity: 1, markPrice: 1500,
          marginPerContract: null, unrealizedPnl: 0, expiryDate: '2026-10-16',
        },
      ],
      asOfDate: ASOF,
      evaluatedAt: EVAL,
    });
    expect(s.summary.netAssets).toBeNull();
  });

  it('expired contract => INVALID freshness', () => {
    const s = QuantPlatformIntegrationEngine.build({
      positions: [
        {
          symbol: 'VN30F1M', assetClass: 'DERIVATIVE', quantity: 1, markPrice: 1500,
          marginPerContract: 1, unrealizedPnl: 0, expiryDate: '2026-09-01',
        },
      ],
      asOfDate: ASOF,
      evaluatedAt: EVAL,
    });
    expect(s.dataFreshness).toBe('INVALID');
  });

  it('fractional equity quantity => INVALID (lot semantics)', () => {
    const s = QuantPlatformIntegrationEngine.build({
      positions: [{ symbol: 'HPG', assetClass: 'EQUITY', quantity: 10.5, markPrice: 28000 }],
      asOfDate: ASOF,
      evaluatedAt: EVAL,
    });
    expect(s.dataFreshness).toBe('INVALID');
  });

  it('deterministic on identical inputs', () => {
    const req = {
      positions: [{ symbol: 'HPG', assetClass: 'EQUITY' as const, quantity: 100, markPrice: 28000 }],
      cashBalance: 10_000_000,
      asOfDate: ASOF,
      evaluatedAt: EVAL,
    };
    const a = QuantPlatformIntegrationEngine.build(req);
    const b = QuantPlatformIntegrationEngine.build(req);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('valid futures expiry => valuation succeeds (no regression)', () => {
    const v = MultiAssetPositionEngine.valueOne(
      {
        symbol: 'VN30F1M', assetClass: 'DERIVATIVE', quantity: 2, markPrice: 1500,
        marginPerContract: 30_000_000, unrealizedPnl: 5_000_000, expiryDate: '2026-10-16',
      },
      ASOF
    );
    expect(v.status).toBe('OK');
    expect(v.marketValue).toBe(2 * 1500 * 100_000);
    expect(v.direction).toBe('LONG');
  });

  it('missing expiryDate (undefined) => INVALID, never valued', () => {
    const v = MultiAssetPositionEngine.valueOne(
      {
        symbol: 'VN30F1M', assetClass: 'DERIVATIVE', quantity: 1, markPrice: 1500,
        marginPerContract: 30_000_000, unrealizedPnl: 0,
      } as never,
      ASOF
    );
    expect(v.status).toBe('INVALID');
    expect(v.marketValue).toBeNull();
    expect(v.marginRequired).toBeNull();
    expect(v.unrealizedPnl).toBeNull();
  });

  it('missing expiryDate (null) => INVALID summary, never zero-filled', () => {
    const s = QuantPlatformIntegrationEngine.build({
      positions: [
        {
          symbol: 'VN30F1M', assetClass: 'DERIVATIVE', quantity: 1, markPrice: 1500,
          marginPerContract: 30_000_000, unrealizedPnl: 0, expiryDate: null,
        },
      ],
      asOfDate: ASOF,
      evaluatedAt: EVAL,
    });
    expect(s.positions[0].status).toBe('INVALID');
    expect(s.summary.netAssets).toBeNull();
    expect(s.dataFreshness).toBe('INVALID');
  });

  it('invalid expiryDate format => INVALID (never normalized)', () => {
    const v = MultiAssetPositionEngine.valueOne(
      {
        symbol: 'VN30F1M', assetClass: 'DERIVATIVE', quantity: 1, markPrice: 1500,
        marginPerContract: 30_000_000, unrealizedPnl: 0, expiryDate: 'not-a-date',
      },
      ASOF
    );
    expect(v.status).toBe('INVALID');
    expect(v.marketValue).toBeNull();
  });
});
