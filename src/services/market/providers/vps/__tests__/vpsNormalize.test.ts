import { describe, expect, it } from 'vitest';
import {
  normalizeVpsLotVolume,
  normalizeVpsPercent,
  normalizeVpsPrice,
  normalizeVpsReferencePrice,
  normalizeVpsValueThousands,
  parseVpsNumeric,
} from '../../normalize.ts';

/**
 * PHASE 8.5C STEP 5/15 — VPS price normalization unit tests.
 *
 * Expected values are the ones CONFIRMED against the source: the live VPS
 * quote for HPG (2026-09-04 session) matched the live KBS daily bar exactly
 * after this normalization:
 *   lastPrice 21.7 -> 21700 (KBS close 21700)
 *   openPrice "21.75" -> 21750 (KBS open 21750)
 *   highPrice "21.8" -> 21800 / lowPrice "21.6" -> 21600
 *   lot 1392090 -> 13,920,900 shares (KBS volume 13,920,900)
 */
describe('normalizeVpsPrice (kVND -> VND/share)', () => {
  it('normalizes the four source-verified values', () => {
    expect(normalizeVpsPrice(21.7)).toBe(21700);
    expect(normalizeVpsPrice(21.75)).toBe(21750);
    expect(normalizeVpsPrice(21.6)).toBe(21600);
    expect(normalizeVpsPrice(23.1)).toBe(23100);
  });

  it('normalizes string values the vendor sends as strings', () => {
    expect(normalizeVpsPrice('21.8')).toBe(21800);
    expect(normalizeVpsPrice(' 21.7 ')).toBe(21700);
  });

  it('returns null for missing / invalid input (never fabricates)', () => {
    expect(normalizeVpsPrice(null)).toBeNull();
    expect(normalizeVpsPrice(undefined)).toBeNull();
    expect(normalizeVpsPrice('')).toBeNull();
    expect(normalizeVpsPrice('N/A')).toBeNull();
    expect(normalizeVpsPrice(Number.NaN)).toBeNull();
  });
});

describe('normalizeVpsReferencePrice (closePrice is ALREADY VND)', () => {
  it('does NOT multiply by 1000', () => {
    expect(normalizeVpsReferencePrice('21600.0')).toBe(21600);
    expect(normalizeVpsReferencePrice(21600)).toBe(21600);
  });

  it('returns null for invalid input', () => {
    expect(normalizeVpsReferencePrice('x')).toBeNull();
    expect(normalizeVpsReferencePrice(null)).toBeNull();
  });
});

describe('normalizeVpsLotVolume (lots -> shares, 1 lot = 10 shares)', () => {
  it('converts the source-verified volume', () => {
    expect(normalizeVpsLotVolume(1392090)).toBe(13920900);
    expect(normalizeVpsLotVolume('129368')).toBe(1293680);
    expect(normalizeVpsLotVolume('459197')).toBe(4591970);
  });

  it('accepts 0 (no matched volume yet) but rejects negatives', () => {
    expect(normalizeVpsLotVolume(0)).toBe(0);
    expect(normalizeVpsLotVolume(-5)).toBeNull();
  });
});

describe('normalizeVpsValueThousands (kVND -> VND)', () => {
  it('converts scientific-notation strings from the vendor', () => {
    // Live HPG: fBValue = 2.8088076E7 kVND = 28,088,076,000 VND
    expect(normalizeVpsValueThousands('2.8088076E7')).toBe(28088076000);
    expect(normalizeVpsValueThousands('9.96509442E7')).toBe(99650944200);
  });
});

describe('normalizeVpsPercent / parseVpsNumeric', () => {
  it('parses percent strings without conversion', () => {
    expect(normalizeVpsPercent('0.46')).toBeCloseTo(0.46);
    expect(normalizeVpsPercent(null)).toBeNull();
  });

  it('parses numeric strings and scientific notation', () => {
    expect(parseVpsNumeric('21.8')).toBeCloseTo(21.8);
    expect(parseVpsNumeric('2.8088076E7')).toBe(28088076);
    expect(parseVpsNumeric(20)).toBe(20);
    expect(parseVpsNumeric({})).toBeNull();
  });
});