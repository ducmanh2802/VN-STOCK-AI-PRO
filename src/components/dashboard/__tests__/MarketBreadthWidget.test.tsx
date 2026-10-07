import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { MarketBreadthWidget } from '../MarketBreadthWidget';
import type { MarketBreadth } from '../../../types/market';

/**
 * P27 §12 / §21 — the breadth widget must never crash and never present a
 * partial measurement as whole-market breadth.
 *
 * Regression: a coverage block placed in the LOADING branch read
 * `breadth.coverage` while `breadth` was null and took the whole app down with
 * `TypeError: Cannot read properties of null (reading 'coverage')`.
 */

const BREADTH: MarketBreadth = {
  advances: 268,
  ceilings: 14,
  declines: 154,
  floors: 2,
  unchanged: 78,
  totalStocks: 500,
  coverage: {
    universe: 'VN_STOCK_UNIVERSE',
    coveredStocks: 500,
    pricedStocks: 480,
    percentPriced: 96,
    note: 'Counts are over the covered stock universe served by the VPS realtime feed.',
  },
  advanceDeclineRatio: 1.74,
  breadthStatus: 'BÊN MUA CHIẾM ƯU THẾ',
  volumeBreadth: {
    advancingValue: 14580.4,
    advancingPercent: 68,
    decliningValue: 5420.1,
    decliningPercent: 25.3,
    unchangedValue: 1430,
    unchangedPercent: 6.7,
    totalValue: 21430.5,
  },
  exchangeBreakdown: {
    hose: { advances: 268, declines: 154, unchanged: 78, ceilings: 14, floors: 2 },
    vn30: { advances: 20, declines: 8, unchanged: 2, ceilings: 2, floors: 0 },
    hnx: { advances: 105, declines: 62, unchanged: 55, ceilings: 8, floors: 1 },
    upcom: { advances: 142, declines: 130, unchanged: 84, ceilings: 5, floors: 3 },
  },
  updatedAt: '2026-10-07T05:00:00.000Z',
  isDemo: false,
};

describe('MarketBreadthWidget', () => {
  it('renders the loading state without crashing when breadth is null', () => {
    const html = renderToStaticMarkup(
      <MarketBreadthWidget breadth={null} isLoading={true} />
    );
    expect(html).toContain('market-breadth-loading');
    expect(html).not.toContain('Phạm vi:');
  });

  it('renders the empty state when there is no breadth at all', () => {
    const html = renderToStaticMarkup(<MarketBreadthWidget breadth={null} />);
    expect(html).toContain('market-breadth-empty');
    expect(html).not.toContain('Phạm vi:');
  });

  it('renders the measured coverage alongside the counts', () => {
    const html = renderToStaticMarkup(<MarketBreadthWidget breadth={BREADTH} />);

    expect(html).toContain('section-market-breadth');
    expect(html).toContain('Phạm vi: 500 mã');
    expect(html).toContain('480 mã (96%)');
    expect(html).toContain('268');
    expect(html).toContain('154');
  });

  it('never claims the numbers are demo data', () => {
    const html = renderToStaticMarkup(<MarketBreadthWidget breadth={BREADTH} />);
    expect(html).not.toContain('DEMO DATA');
  });

  it('handles an error state without throwing', () => {
    const html = renderToStaticMarkup(
      <MarketBreadthWidget breadth={null} isError={true} error={new Error('offline')} />
    );
    expect(html).toContain('market-breadth-error');
  });
});
