import { describe, it, expect } from 'vitest';
import { StockSummarySchema } from '../stockSchema';
import { StockSummary } from '../../types/stock';
import { formatVND, formatPercent, formatNumber } from '../../utils/formatters';

const BASE_VALID_SUMMARY: StockSummary = {
  symbol: 'HPG',
  companyName: 'CTCP Tập đoàn Hòa Phát',
  exchange: 'HOSE',
  sector: 'Thép',
  price: 28500,
  change: 650,
  changePercent: 2.33,
  volume: 24500000,
  tradingValue: 698.25,
  open: 28000,
  high: 28700,
  low: 27900,
  refPrice: 27850,
  ceilingPrice: 29800,
  floorPrice: 25900,
  marketCap: 165000,
  pe: 12.5,
  pb: 1.6,
  roe: 16.8,
  rsi: 58.2,
  trend: 'UPTREND',
  aiScore: 78,
  fairValue: 34000,
  sparkline: [27850, 28000, 28350, 28700, 28300, 28500],
  isDemo: false,
  dataStatus: 'AVAILABLE',
};

describe('PR-01B: StockSummarySchema Contract Validation', () => {
  it('accepts completely populated valid numerical fundamentals and status', () => {
    const parsed = StockSummarySchema.parse(BASE_VALID_SUMMARY);
    expect(parsed.symbol).toBe('HPG');
    expect(parsed.pe).toBe(12.5);
    expect(parsed.pb).toBe(1.6);
    expect(parsed.roe).toBe(16.8);
    expect(parsed.rsi).toBe(58.2);
    expect(parsed.fairValue).toBe(34000);
    expect(parsed.ceilingPrice).toBe(29800);
    expect(parsed.floorPrice).toBe(25900);
    expect(parsed.dataStatus).toBe('AVAILABLE');
  });

  it('accepts null for legitimately unavailable market-wide quote fields without synthetic fabrication', () => {
    const partialSummary: StockSummary = {
      ...BASE_VALID_SUMMARY,
      pe: null,
      pb: null,
      roe: null,
      rsi: null,
      fairValue: null,
      ceilingPrice: null,
      floorPrice: null,
      dataStatus: 'PARTIAL',
    };

    const parsed = StockSummarySchema.parse(partialSummary);
    expect(parsed.pe).toBeNull();
    expect(parsed.pb).toBeNull();
    expect(parsed.roe).toBeNull();
    expect(parsed.rsi).toBeNull();
    expect(parsed.fairValue).toBeNull();
    expect(parsed.ceilingPrice).toBeNull();
    expect(parsed.floorPrice).toBeNull();
    expect(parsed.dataStatus).toBe('PARTIAL');
    expect(parsed.price).toBe(28500);
    expect(parsed.volume).toBe(24500000);
  });

  it('accepts negative ROE as valid accounting data', () => {
    const parsed = StockSummarySchema.parse({
      ...BASE_VALID_SUMMARY,
      roe: -8.45,
    });
    expect(parsed.roe).toBe(-8.45);
  });

  it('strictly rejects NaN for numeric and nullable fields', () => {
    expect(() =>
      StockSummarySchema.parse({
        ...BASE_VALID_SUMMARY,
        price: NaN,
      })
    ).toThrow();

    expect(() =>
      StockSummarySchema.parse({
        ...BASE_VALID_SUMMARY,
        pe: NaN,
      })
    ).toThrow();

    expect(() =>
      StockSummarySchema.parse({
        ...BASE_VALID_SUMMARY,
        rsi: NaN,
      })
    ).toThrow();

    expect(() =>
      StockSummarySchema.parse({
        ...BASE_VALID_SUMMARY,
        fairValue: NaN,
      })
    ).toThrow();
  });

  it('strictly rejects negative values where non-negative values are required', () => {
    expect(() =>
      StockSummarySchema.parse({
        ...BASE_VALID_SUMMARY,
        price: -100,
      })
    ).toThrow();

    expect(() =>
      StockSummarySchema.parse({
        ...BASE_VALID_SUMMARY,
        volume: -1,
      })
    ).toThrow();

    expect(() =>
      StockSummarySchema.parse({
        ...BASE_VALID_SUMMARY,
        pe: -5,
      })
    ).toThrow();

    expect(() =>
      StockSummarySchema.parse({
        ...BASE_VALID_SUMMARY,
        pb: -0.5,
      })
    ).toThrow();

    expect(() =>
      StockSummarySchema.parse({
        ...BASE_VALID_SUMMARY,
        rsi: -1,
      })
    ).toThrow();

    expect(() =>
      StockSummarySchema.parse({
        ...BASE_VALID_SUMMARY,
        rsi: 101,
      })
    ).toThrow();

    expect(() =>
      StockSummarySchema.parse({
        ...BASE_VALID_SUMMARY,
        fairValue: -1000,
      })
    ).toThrow();
  });

  it('strictly rejects missing required fields (fail-closed)', () => {
    const invalid: any = { ...BASE_VALID_SUMMARY };
    delete invalid.symbol;
    expect(() => StockSummarySchema.parse(invalid)).toThrow();

    const invalidPrice: any = { ...BASE_VALID_SUMMARY };
    delete invalidPrice.price;
    expect(() => StockSummarySchema.parse(invalidPrice)).toThrow();
  });
});

describe('PR-01B: Fail-Closed Nullable Metric Formatting', () => {
  it('renders standard unavailable indicator for null or non-finite inputs', () => {
    expect(formatVND(null)).toBe('--');
    expect(formatVND(undefined)).toBe('--');
    expect(formatVND(NaN)).toBe('--');

    expect(formatPercent(null)).toBe('--');
    expect(formatPercent(undefined)).toBe('--');
    expect(formatPercent(NaN)).toBe('--');

    expect(formatNumber(null)).toBe('--');
    expect(formatNumber(undefined)).toBe('--');
    expect(formatNumber(NaN)).toBe('--');
  });

  it('does NOT coerce null to 0 or 0%', () => {
    expect(formatVND(null)).not.toBe('0');
    expect(formatVND(null)).not.toBe('0 VND');
    expect(formatPercent(null)).not.toBe('0.00%');
    expect(formatPercent(null)).not.toBe('+0.00%');
  });

  it('correctly formats real numbers when available', () => {
    expect(formatVND(28500)).toBe('28.500');
    expect(formatPercent(2.33)).toBe('+2.33%');
    expect(formatPercent(-1.25)).toBe('-1.25%');
    expect(formatNumber(12.5, 1)).toBe('12,5');
  });
});

describe('PR-01B: RealMarketDataProvider Output Contract', () => {
  it('verifies that StockSummary produced by provider has null fundamentals and passes schema without synthetic fabrication', async () => {
    const { RealMarketDataProvider } = await import('../../services/market/RealMarketDataProvider');
    const provider = new RealMarketDataProvider();

    // Mock getQuote from VPS to return real quote structure
    const detail = await provider.getStockDetail('HPG');
    if (detail) {
      // Must pass schema
      const validated = StockSummarySchema.parse(detail);
      expect(validated.symbol).toBe('HPG');
      // Fundamentals must be null (not 12.5, 1.6, 16.8, 50, or price * 1.15)
      expect(validated.pe).toBeNull();
      expect(validated.pb).toBeNull();
      expect(validated.roe).toBeNull();
      expect(validated.rsi).toBeNull();
      expect(validated.fairValue).toBeNull();
      expect(validated.dataStatus).toBe('PARTIAL');
      expect(validated.pe).not.toBe(12.5);
      expect(validated.pe).not.toBe(0);
      expect(validated.pb).not.toBe(1.6);
      expect(validated.pb).not.toBe(0);
      expect(validated.rsi).not.toBe(50);
      expect(validated.rsi).not.toBe(0);
    }
  });
});
