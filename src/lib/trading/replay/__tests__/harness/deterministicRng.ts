/**
 * Deterministic Pseudo-Random Number Generator for Property-Based Testing
 * =======================================================================
 * Uses the Mulberry32 32-bit PRNG algorithm.
 * 
 * Invariants:
 * - 100% deterministic: Same seed produces exact same sequence across any platform.
 * - Zero dependency on Math.random() or Date.now().
 * - Supports state saving/restoring and sub-generator forking.
 */

export class SeededRng {
  private state: number;
  private readonly initialSeed: number;

  constructor(seed: number = 42) {
    this.initialSeed = seed >>> 0;
    this.state = this.initialSeed;
  }

  /**
   * Returns the original seed used to initialize this generator.
   */
  public getSeed(): number {
    return this.initialSeed;
  }

  /**
   * Resets the generator back to its initial seed.
   */
  public reset(): void {
    this.state = this.initialSeed;
  }

  /**
   * Generates a 32-bit unsigned integer in [0, 2^32 - 1].
   */
  public nextUint32(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  }

  /**
   * Generates a floating point number in [0, 1).
   */
  public nextFloat(): number {
    return this.nextUint32() / 4294967296;
  }

  /**
   * Generates an integer in [min, max] inclusive.
   */
  public nextInt(min: number, max: number): number {
    if (min > max) {
      const temp = min;
      min = max;
      max = temp;
    }
    const range = max - min + 1;
    return min + Math.floor(this.nextFloat() * range);
  }

  /**
   * Generates a boolean with probability `p` of being true (default p = 0.5).
   */
  public nextBool(p: number = 0.5): boolean {
    return this.nextFloat() < p;
  }

  /**
   * Picks a random element from a non-empty array.
   */
  public pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('Cannot pick from an empty array');
    }
    const idx = this.nextInt(0, items.length - 1);
    return items[idx];
  }

  /**
   * Picks N random distinct elements from an array (without replacement).
   */
  public sample<T>(items: readonly T[], count: number): T[] {
    const k = Math.min(count, items.length);
    const pool = [...items];
    const result: T[] = [];
    for (let i = 0; i < k; i++) {
      const idx = this.nextInt(0, pool.length - 1);
      result.push(pool[idx]);
      pool.splice(idx, 1);
    }
    return result;
  }

  /**
   * Shuffles an array deterministically using Fisher-Yates.
   */
  public shuffle<T>(items: readonly T[]): T[] {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      const temp = arr[i];
      arr[i] = arr[j];
      arr[j] = temp;
    }
    return arr;
  }

  /**
   * Generates a random alphanumeric string of given length.
   */
  public nextString(length: number, charset: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'): string {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += charset[this.nextInt(0, charset.length - 1)];
    }
    return result;
  }

  /**
   * Derives a child RNG seeded deterministically from the current generator.
   */
  public fork(): SeededRng {
    return new SeededRng(this.nextUint32());
  }
}
