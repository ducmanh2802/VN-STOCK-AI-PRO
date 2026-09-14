/**
 * PHASE 17.8 — DETERMINISTIC SEEDED RANDOM NUMBER GENERATOR
 * ==========================================================
 * Pure mathematical pseudo-random number generator (Mulberry32).
 * 
 * STRICT INVARIANTS:
 *   - NEVER use Math.random() in quantitative validation or backtesting.
 *   - 100% deterministic across all JavaScript runtimes.
 *   - Given the same seed, produces identical sequences of pseudo-random values.
 *   - Supports uniform floats [0, 1), uniform integers [min, max],
 *     Fisher-Yates array shuffling, and bootstrap sampling with replacement.
 */

export class SeededRandom {
  private state: number;
  private readonly initialSeed: number;

  constructor(seed: number = 42) {
    // Ensure seed is a positive 32-bit non-zero integer
    const sanitizedSeed = Math.floor(Math.abs(seed)) || 1;
    this.initialSeed = sanitizedSeed;
    this.state = sanitizedSeed;
  }

  /**
   * Generates a deterministic pseudo-random float in the half-open interval [0, 1).
   * Mulberry32 algorithm: 32-bit state, excellent avalanche characteristics.
   */
  public next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Generates a deterministic pseudo-random integer in the inclusive range [min, max].
   */
  public nextInt(min: number, max: number): number {
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      throw new Error('SeededRandom.nextInt: min and max must be finite numbers');
    }
    const lower = Math.min(Math.floor(min), Math.floor(max));
    const upper = Math.max(Math.floor(min), Math.floor(max));
    if (lower === upper) {
      return lower;
    }
    return lower + Math.floor(this.next() * (upper - lower + 1));
  }

  /**
   * Performs an in-place-safe Fisher-Yates shuffle of the input array.
   * Returns a new array with randomized element ordering.
   */
  public shuffle<T>(array: readonly T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      const temp = result[i];
      result[i] = result[j];
      result[j] = temp;
    }
    return result;
  }

  /**
   * Performs bootstrap sampling with replacement.
   * Selects `sampleSize` items from `array` uniformly at random.
   */
  public sampleWithReplacement<T>(array: readonly T[], sampleSize?: number): T[] {
    const n = array.length;
    if (n === 0) {
      return [];
    }
    const size = sampleSize ?? n;
    const result: T[] = new Array(size);
    for (let i = 0; i < size; i++) {
      const index = this.nextInt(0, n - 1);
      result[i] = array[index];
    }
    return result;
  }

  /**
   * Resets the generator state back to the initial seed or a new seed.
   */
  public reset(seed?: number): void {
    if (seed !== undefined) {
      this.state = Math.floor(Math.abs(seed)) || 1;
    } else {
      this.state = this.initialSeed;
    }
  }

  /**
   * Returns the seed currently governing this generator.
   */
  public getSeed(): number {
    return this.initialSeed;
  }
}
