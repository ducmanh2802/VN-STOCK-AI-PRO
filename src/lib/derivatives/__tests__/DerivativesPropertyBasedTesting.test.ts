import { describe, it, expect } from 'vitest';
import { BasisEngine } from '../BasisEngine.ts';
import { ExpiryCalendarEngine } from '../ExpiryCalendarEngine.ts';
import { OpenInterestEngine } from '../OpenInterestEngine.ts';
import { TermStructureEngine } from '../TermStructureEngine.ts';

// Deterministic Pseudo-Random Generator (LCG) for reproducible property-based testing
class SimpleRng {
  private state: number;
  constructor(seed: number = 42) {
    this.state = seed;
  }
  public nextFloat(): number {
    this.state = (this.state * 1664525 + 1013904223) % 4294967296;
    return this.state / 4294967296;
  }
  public nextInt(min: number, max: number): number {
    return Math.floor(min + this.nextFloat() * (max - min + 1));
  }
}

describe('Phase 21 — Property-Based Testing (PBT) Invariants', () => {
  const rng = new SimpleRng(20260930);

  describe('Invariant 1: Spot-Futures Basis Arithmetic & Monotonicity', () => {
    it('holds F - S invariant and sign monotonicity across 200 random market scenarios', () => {
      for (let i = 0; i < 200; i++) {
        const futures = +(800 + rng.nextFloat() * 1200).toFixed(2);
        const spot = +(800 + rng.nextFloat() * 1200).toFixed(2);
        const days = rng.nextInt(1, 90);

        const res = BasisEngine.calculateBasis(futures, spot, days);
        expect(res.status).toBe('LIVE');
        expect(res.basis).toBeCloseTo(futures - spot, 3);
        expect(res.basis! + spot).toBeCloseTo(futures, 2);

        if (futures > spot) {
          expect(res.basis).toBeGreaterThan(0);
          expect(res.basisPct).toBeGreaterThan(0);
        } else if (futures < spot) {
          expect(res.basis).toBeLessThan(0);
          expect(res.basisPct).toBeLessThan(0);
        } else {
          expect(res.basis).toBe(0);
          expect(res.basisPct).toBe(0);
        }

        // Bounded finite numbers
        expect(Number.isFinite(res.basisPct!)).toBe(true);
        expect(Number.isFinite(res.annualizedBasis!)).toBe(true);
      }
    });
  });

  describe('Invariant 2: Expiry Calendar Invariants', () => {
    it('always resolves third Thursday to day 15..21 and non-weekend across 120 months', () => {
      for (let i = 0; i < 120; i++) {
        const year = rng.nextInt(2020, 2035);
        const month = rng.nextInt(1, 12);

        const raw = ExpiryCalendarEngine.getRawThirdThursday(year, month);
        const [y, m, d] = raw.split('-').map(Number);

        expect(y).toBe(year);
        expect(m).toBe(month);
        expect(d).toBeGreaterThanOrEqual(15);
        expect(d).toBeLessThanOrEqual(21);

        // Raw date must be Thursday (day 4)
        const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
        expect(dayOfWeek).toBe(4);

        // Adjusted date must never be a weekend
        const info = ExpiryCalendarEngine.getExpiryInfo(year, month);
        const adjDate = new Date(`${info.adjustedExpiryDate}T12:00:00Z`);
        const adjDay = adjDate.getUTCDay();
        expect(adjDay).not.toBe(0); // Not Sunday
        expect(adjDay).not.toBe(6); // Not Saturday
      }
    });
  });

  describe('Invariant 3: Open Interest Conservation', () => {
    it('conserves ΔOI across random OI series', () => {
      for (let i = 0; i < 100; i++) {
        const prev = rng.nextInt(5_000, 100_000);
        const curr = rng.nextInt(5_000, 100_000);
        const vol = rng.nextInt(10_000, 300_000);

        const res = OpenInterestEngine.analyze({
          symbol: 'VN30F1M',
          currentOI: curr,
          previousOI: prev,
          volume: vol,
        });

        expect(res.openInterestChange).toBe(curr - prev);
        expect(res.openInterestChange! + prev).toBe(curr);
        expect(res.volumeToOIRatio).toBeCloseTo(vol / curr, 3);
      }
    });
  });

  describe('Invariant 4: Derivatives Regime Partition', () => {
    it('exhaustively partitions any basis percentage into exactly one regime', () => {
      const allRegimes = new Set([
        'STRONG_CONTANGO',
        'MILD_CONTANGO',
        'FLAT_NEUTRAL',
        'MILD_BACKWARDATION',
        'STRONG_BACKWARDATION',
      ]);

      for (let i = 0; i < 200; i++) {
        const basisPct = +(-5 + rng.nextFloat() * 10).toFixed(4);
        const regime = TermStructureEngine.classifyRegime(basisPct * 10, basisPct, 'CONTANGO');

        expect(allRegimes.has(regime.regime)).toBe(true);
        expect(regime.confidence).toBeGreaterThan(0);
      }
    });
  });
});
