/**
 * PHASE 18.3.2 — DETERMINISTIC MARKET SNAPSHOT TEST SUITE
 * ========================================================
 * Comprehensive test coverage proving:
 *   - Immutability & defensive copying
 *   - Deterministic canonical serialization & hashing
 *   - Deterministic content-addressed snapshot IDs
 *   - Fail-closed validation for Vietnamese equities
 *   - Side-effect-free construction
 */

import { describe, it, expect } from 'vitest';
import {
  MarketSnapshotBuilder,
  MarketSnapshotValidationError,
} from '../MarketSnapshotBuilder.ts';
import {
  canonicalSerialize,
  computeSnapshotHash,
  computeSnapshotId,
  sha256,
} from '../snapshotHash.ts';
import {
  createMarketSnapshot,
  verifySnapshotIntegrity,
  serializeMarketSnapshot,
} from '../MarketSnapshot.ts';
import type { MarketSnapshot, MarketSnapshotInput } from '../types.ts';

function createValidInput(): MarketSnapshotInput {
  return {
    capturedAt: '2026-03-20T09:45:00.000Z',
    source: {
      provider: 'VPS',
      feed: 'REALTIME_STREAM',
    },
    market: {
      exchange: 'HOSE',
      tradingDate: '2026-03-20',
      session: 'CONTINUOUS',
      isOpen: true,
    },
    instrument: {
      symbol: 'HPG',
      name: 'Tập đoàn Hòa Phát',
    },
    quote: {
      last: 28500,
      bid: 28450,
      ask: 28500,
      open: 28200,
      high: 28700,
      low: 28100,
      close: 28500,
      reference: 28200,
      ceiling: 30150,
      floor: 26250,
      volume: 15420000,
      timestamp: '2026-03-20T09:44:58.000Z',
    },
    fundamental: {
      pe: 10.5,
      pb: 1.4,
      eps: 2714,
      roe: 0.15,
      roa: 0.08,
      revenue: 140000000000000,
      netIncome: 12000000000000,
      freeCashFlow: 8500000000000,
      debtToEquity: 0.65,
      asOf: '2025-12-31',
    },
    valuation: {
      fairValue: 34000,
      dcfValue: 35500,
      marginOfSafety: 0.193,
      asOf: '2026-03-15',
    },
    recommendation: {
      recommendationId: 'REC_HPG_20260320_001',
      strategyVersion: 'QUANT_V2.1',
      signal: 'BUY',
      horizon: 'MEDIUM_TERM',
      confidence: 0.85,
    },
    integrity: {
      dataFreshnessMs: 2000,
      validationStatus: 'VALID',
      warnings: [],
    },
    versions: {
      snapshotSchemaVersion: '1.0.0',
      strategyVersion: 'QUANT_V2.1',
      riskPolicyVersion: 'RISK_POL_1.0',
    },
  };
}

describe('PHASE 18.3.2 — Deterministic Market Snapshot', () => {
  // Test 1: Same input -> same canonical serialization
  it('Test 1: Same input -> same canonical serialization', () => {
    const input1 = createValidInput();
    const input2 = createValidInput();

    const serial1 = canonicalSerialize(input1);
    const serial2 = canonicalSerialize(input2);

    expect(serial1).toBe(serial2);
    expect(typeof serial1).toBe('string');
  });

  // Test 2: Same input -> same hash
  it('Test 2: Same input -> same hash', () => {
    const snapshot1 = MarketSnapshotBuilder.buildFrom(createValidInput());
    const snapshot2 = MarketSnapshotBuilder.buildFrom(createValidInput());

    expect(snapshot1.hash).toBe(snapshot2.hash);
    expect(snapshot1.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  // Test 3: Same input -> same snapshotId
  it('Test 3: Same input -> same snapshotId', () => {
    const snapshot1 = MarketSnapshotBuilder.buildFrom(createValidInput());
    const snapshot2 = MarketSnapshotBuilder.buildFrom(createValidInput());

    expect(snapshot1.snapshotId).toBe(snapshot2.snapshotId);
    expect(snapshot1.snapshotId).toBe(`SNAP_${snapshot1.hash.toUpperCase()}`);
  });

  // Test 4: Property order changes in input -> same hash
  it('Test 4: Property order changes in input -> same hash', () => {
    const inputNormal = createValidInput();

    // Reconstruct input with scrambled key order
    const inputScrambled: MarketSnapshotInput = {
      versions: { ...inputNormal.versions },
      instrument: { name: inputNormal.instrument.name, symbol: inputNormal.instrument.symbol },
      quote: {
        timestamp: inputNormal.quote.timestamp,
        volume: inputNormal.quote.volume,
        last: inputNormal.quote.last,
        ask: inputNormal.quote.ask,
        bid: inputNormal.quote.bid,
        floor: inputNormal.quote.floor,
        ceiling: inputNormal.quote.ceiling,
        reference: inputNormal.quote.reference,
        close: inputNormal.quote.close,
        low: inputNormal.quote.low,
        high: inputNormal.quote.high,
        open: inputNormal.quote.open,
      },
      market: {
        isOpen: inputNormal.market.isOpen,
        session: inputNormal.market.session,
        tradingDate: inputNormal.market.tradingDate,
        exchange: inputNormal.market.exchange,
      },
      source: {
        feed: inputNormal.source.feed,
        provider: inputNormal.source.provider,
      },
      integrity: { ...inputNormal.integrity },
      capturedAt: inputNormal.capturedAt,
      recommendation: { ...inputNormal.recommendation },
      valuation: { ...inputNormal.valuation },
      fundamental: { ...inputNormal.fundamental },
    };

    const snapshotNormal = MarketSnapshotBuilder.buildFrom(inputNormal);
    const snapshotScrambled = MarketSnapshotBuilder.buildFrom(inputScrambled);

    expect(snapshotNormal.hash).toBe(snapshotScrambled.hash);
    expect(snapshotNormal.snapshotId).toBe(snapshotScrambled.snapshotId);
  });

  // Test 5: Original input mutation -> snapshot unchanged
  it('Test 5: Original input mutation -> snapshot unchanged', () => {
    const input = createValidInput();
    const snapshot = MarketSnapshotBuilder.buildFrom(input);

    const initialLast = snapshot.quote.last;
    const initialSymbol = snapshot.instrument.symbol;

    // Mutate input
    (input.quote as unknown as Record<string, unknown>).last = 999999;
    (input.instrument as unknown as Record<string, unknown>).symbol = 'VIOLATED';
    if (input.fundamental) (input.fundamental as unknown as Record<string, unknown>).pe = 999;

    expect(snapshot.quote.last).toBe(initialLast);
    expect(snapshot.instrument.symbol).toBe(initialSymbol);
    expect(snapshot.fundamental?.pe).toBe(10.5);
  });

  // Test 6: Snapshot mutation attempt -> prevented
  it('Test 6: Snapshot mutation attempt -> prevented', () => {
    const snapshot = MarketSnapshotBuilder.buildFrom(createValidInput());

    expect(() => {
      // @ts-expect-error - testing runtime immutability enforcement
      snapshot.quote.last = 999999;
    }).toThrow(TypeError);

    expect(() => {
      // @ts-expect-error - testing runtime immutability enforcement
      snapshot.instrument.symbol = 'NEW';
    }).toThrow(TypeError);

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.quote)).toBe(true);
    expect(Object.isFrozen(snapshot.market)).toBe(true);
  });

  // Test 7: Invalid negative price -> rejected
  it('Test 7: Invalid negative price -> rejected', () => {
    const input = createValidInput();
    input.quote = { ...input.quote, last: -25000 };

    expect(() => MarketSnapshotBuilder.buildFrom(input)).toThrow(MarketSnapshotValidationError);

    const validation = MarketSnapshotBuilder.validateInput(input);
    expect(validation.isValid).toBe(false);
    expect(validation.errors.some((e) => e.includes('positive finite number'))).toBe(true);
  });

  // Test 8: Invalid bid/ask -> rejected
  it('Test 8: Invalid bid/ask (crossed market: ask < bid) -> rejected', () => {
    const input = createValidInput();
    input.quote = { ...input.quote, bid: 29000, ask: 28000 }; // Crossed market

    expect(() => MarketSnapshotBuilder.buildFrom(input)).toThrow(MarketSnapshotValidationError);

    const validation = MarketSnapshotBuilder.validateInput(input);
    expect(validation.isValid).toBe(false);
    expect(validation.errors.some((e) => e.includes('Crossed market violation'))).toBe(true);
  });

  // Test 9: Invalid OHLC -> rejected
  it('Test 9: Invalid OHLC (high < low) -> rejected', () => {
    const input = createValidInput();
    input.quote = { ...input.quote, high: 27000, low: 29000 };

    expect(() => MarketSnapshotBuilder.buildFrom(input)).toThrow(MarketSnapshotValidationError);

    const validation = MarketSnapshotBuilder.validateInput(input);
    expect(validation.isValid).toBe(false);
    expect(validation.errors.some((e) => e.includes('Invalid OHLC bounds'))).toBe(true);
  });

  // Test 10: Invalid ceiling/floor -> rejected
  it('Test 10: Invalid ceiling/floor (ceiling < floor, or price > ceiling) -> rejected', () => {
    const input1 = createValidInput();
    input1.quote = { ...input1.quote, ceiling: 25000, floor: 30000 };

    expect(() => MarketSnapshotBuilder.buildFrom(input1)).toThrow(MarketSnapshotValidationError);

    const input2 = createValidInput();
    input2.quote = { ...input2.quote, last: 32000, ceiling: 30000 }; // Exceeds ceiling

    expect(() => MarketSnapshotBuilder.buildFrom(input2)).toThrow(MarketSnapshotValidationError);
  });

  // Test 11: Invalid timestamp -> rejected
  it('Test 11: Invalid timestamp -> rejected', () => {
    const input = createValidInput();
    input.capturedAt = 'NOT_A_TIMESTAMP';

    expect(() => MarketSnapshotBuilder.buildFrom(input)).toThrow(MarketSnapshotValidationError);

    const validation = MarketSnapshotBuilder.validateInput(input);
    expect(validation.isValid).toBe(false);
    expect(validation.errors.some((e) => e.includes('not a valid ISO timestamp'))).toBe(true);
  });

  // Test 12: Negative freshness -> rejected
  it('Test 12: Negative freshness -> rejected', () => {
    const input = createValidInput();
    input.integrity = { ...input.integrity, dataFreshnessMs: -500 };

    expect(() => MarketSnapshotBuilder.buildFrom(input)).toThrow(MarketSnapshotValidationError);

    const validation = MarketSnapshotBuilder.validateInput(input);
    expect(validation.isValid).toBe(false);
    expect(validation.errors.some((e) => e.includes('non-negative finite number'))).toBe(true);
  });

  // Test 13: Undefined optional values are handled deterministically
  it('Test 13: Undefined optional values are handled deterministically', () => {
    const input1 = createValidInput();
    const input2 = createValidInput();

    // In input1, optional fields omitted or undefined
    input1.quote = { ...input1.quote, bid: undefined, ask: undefined };
    delete (input2.quote as unknown as Record<string, unknown>).bid;
    delete (input2.quote as unknown as Record<string, unknown>).ask;

    const snapshot1 = MarketSnapshotBuilder.buildFrom(input1);
    const snapshot2 = MarketSnapshotBuilder.buildFrom(input2);

    expect(snapshot1.hash).toBe(snapshot2.hash);
    expect(snapshot1.snapshotId).toBe(snapshot2.snapshotId);
  });

  // Test 14: Two separately-created equivalent snapshots are identical
  it('Test 14: Two separately-created equivalent snapshots are identical', () => {
    const snapshot1 = MarketSnapshotBuilder.buildFrom(createValidInput());
    const snapshot2 = MarketSnapshotBuilder.buildFrom(createValidInput());

    expect(serializeMarketSnapshot(snapshot1)).toBe(serializeMarketSnapshot(snapshot2));
    expect(snapshot1.hash).toBe(snapshot2.hash);
    expect(snapshot1.snapshotId).toBe(snapshot2.snapshotId);
  });

  // Test 15: Different price -> different hash
  it('Test 15: Different price -> different hash', () => {
    const input1 = createValidInput();
    const input2 = createValidInput();
    input2.quote = { ...input2.quote, last: 28600 };

    const snapshot1 = MarketSnapshotBuilder.buildFrom(input1);
    const snapshot2 = MarketSnapshotBuilder.buildFrom(input2);

    expect(snapshot1.hash).not.toBe(snapshot2.hash);
    expect(snapshot1.snapshotId).not.toBe(snapshot2.snapshotId);
  });

  // Test 16: Different timestamp -> different hash
  it('Test 16: Different timestamp -> different hash', () => {
    const input1 = createValidInput();
    const input2 = createValidInput();
    input2.quote = { ...input2.quote, timestamp: '2026-03-20T09:44:59.000Z' };

    const snapshot1 = MarketSnapshotBuilder.buildFrom(input1);
    const snapshot2 = MarketSnapshotBuilder.buildFrom(input2);

    expect(snapshot1.hash).not.toBe(snapshot2.hash);
  });

  // Test 17: Different symbol -> different hash
  it('Test 17: Different symbol -> different hash', () => {
    const input1 = createValidInput();
    const input2 = createValidInput();
    input2.instrument = { symbol: 'FPT', name: 'Công ty Cổ phần FPT' };

    const snapshot1 = MarketSnapshotBuilder.buildFrom(input1);
    const snapshot2 = MarketSnapshotBuilder.buildFrom(input2);

    expect(snapshot1.hash).not.toBe(snapshot2.hash);
  });

  // Test 18: Different provider/source -> different hash
  it('Test 18: Different provider/source -> different hash', () => {
    const input1 = createValidInput();
    const input2 = createValidInput();
    input2.source = { provider: 'KBS', feed: 'REALTIME_STREAM' };

    const snapshot1 = MarketSnapshotBuilder.buildFrom(input1);
    const snapshot2 = MarketSnapshotBuilder.buildFrom(input2);

    expect(snapshot1.hash).not.toBe(snapshot2.hash);
  });

  // Test 19: Recommendation metadata can be included without changing market quote data
  it('Test 19: Recommendation metadata can be included without changing market quote data', () => {
    const inputWithoutRec = createValidInput();
    inputWithoutRec.recommendation = null;

    const inputWithRec = createValidInput();

    const snapshotWithoutRec = MarketSnapshotBuilder.buildFrom(inputWithoutRec);
    const snapshotWithRec = MarketSnapshotBuilder.buildFrom(inputWithRec);

    // Quotes are identical
    expect(snapshotWithoutRec.quote.last).toBe(snapshotWithRec.quote.last);
    expect(snapshotWithoutRec.quote.timestamp).toBe(snapshotWithRec.quote.timestamp);

    // Hashes reflect the enriched recommendation metadata
    expect(snapshotWithoutRec.hash).not.toBe(snapshotWithRec.hash);
    expect(snapshotWithRec.recommendation?.signal).toBe('BUY');
    expect(snapshotWithoutRec.recommendation).toBeNull();
  });

  // Test 20: Snapshot creation is side-effect free
  it('Test 20: Snapshot creation is side-effect free', () => {
    const input = createValidInput();
    const inputSerializedBefore = JSON.stringify(input);

    const snapshot = MarketSnapshotBuilder.buildFrom(input);

    const inputSerializedAfter = JSON.stringify(input);
    expect(inputSerializedBefore).toBe(inputSerializedAfter);
    expect(snapshot).toBeDefined();
  });

  // Test 21: verifySnapshotIntegrity validates untampered snapshot and rejects corruption
  it('Test 21: verifySnapshotIntegrity validates untampered snapshot and rejects corruption', () => {
    const snapshot = MarketSnapshotBuilder.buildFrom(createValidInput());

    expect(verifySnapshotIntegrity(snapshot)).toBe(true);

    // Corrupted object with fake hash
    const fakeSnapshot = { ...snapshot, hash: 'bad0000000000000000000000000000000000000000000000000000000000000' };
    expect(verifySnapshotIntegrity(fakeSnapshot)).toBe(false);

    // Null or invalid object
    expect(verifySnapshotIntegrity(null as unknown as MarketSnapshot)).toBe(false);
  });

  // Test 22: Non-positive or zero price rejected
  it('Test 22: Non-positive or zero price rejected', () => {
    const input = createValidInput();
    input.quote = { ...input.quote, last: 0 };

    expect(() => MarketSnapshotBuilder.buildFrom(input)).toThrow(MarketSnapshotValidationError);
  });

  // Test 23: Negative volume rejected
  it('Test 23: Negative volume rejected', () => {
    const input = createValidInput();
    input.quote = { ...input.quote, volume: -100 };

    expect(() => MarketSnapshotBuilder.buildFrom(input)).toThrow(MarketSnapshotValidationError);
  });

  // Test 24: Invalid exchange rejected
  it('Test 24: Invalid exchange rejected', () => {
    const input = createValidInput();
    // @ts-expect-error - testing invalid exchange
    input.market = { ...input.market, exchange: 'NASDAQ' };

    expect(() => MarketSnapshotBuilder.buildFrom(input)).toThrow(MarketSnapshotValidationError);
  });

  // Test 25: Empty or invalid symbol rejected
  it('Test 25: Empty or invalid symbol rejected', () => {
    const input1 = createValidInput();
    input1.instrument = { symbol: '' };
    expect(() => MarketSnapshotBuilder.buildFrom(input1)).toThrow(MarketSnapshotValidationError);

    const input2 = createValidInput();
    input2.instrument = { symbol: 'TOOLONGSYMBOL' };
    expect(() => MarketSnapshotBuilder.buildFrom(input2)).toThrow(MarketSnapshotValidationError);
  });

  // Test 26: Builder fluent interface creates valid snapshot
  it('Test 26: Builder fluent interface creates valid snapshot', () => {
    const base = createValidInput();
    const snapshot = new MarketSnapshotBuilder()
      .setCapturedAt(base.capturedAt!)
      .setSource(base.source)
      .setMarket(base.market)
      .setInstrument(base.instrument)
      .setQuote(base.quote)
      .setFundamental(base.fundamental)
      .setValuation(base.valuation)
      .setRecommendation(base.recommendation)
      .setIntegrity(base.integrity)
      .setVersions(base.versions)
      .build();

    expect(snapshot.instrument.symbol).toBe('HPG');
    expect(snapshot.quote.last).toBe(28500);
    expect(verifySnapshotIntegrity(snapshot)).toBe(true);
  });

  // Test 27: Adapter from TradingMarketData creates valid snapshot
  it('Test 27: Adapter from TradingMarketData creates valid snapshot', () => {
    const marketData = {
      symbol: 'SSI',
      price: 36500,
      open: 36000,
      high: 36800,
      low: 35900,
      close: 36500,
      volume: 8500000,
      referencePrice: 36000,
      ceilingPrice: 38500,
      floorPrice: 33500,
      timestamp: '2026-03-20T10:00:00.000Z',
      dataSource: 'VPS',
    };

    const builder = new MarketSnapshotBuilder().fromTradingMarketData(marketData, {
      exchange: 'HOSE',
      companyName: 'Chứng khoán SSI',
    });

    const snapshot = builder.build();

    expect(snapshot.instrument.symbol).toBe('SSI');
    expect(snapshot.instrument.name).toBe('Chứng khoán SSI');
    expect(snapshot.quote.last).toBe(36500);
    expect(snapshot.quote.ceiling).toBe(38500);
    expect(snapshot.market.exchange).toBe('HOSE');
    expect(verifySnapshotIntegrity(snapshot)).toBe(true);
  });
});
