/**
 * RESEARCH-04 TESTS — train/val/test, walk-forward, sensitivity, OOS, regimes, seeds
 */
import { describe, it, expect } from 'vitest';
import { ValidationEngine } from '../ValidationEngine.ts';

const dates = Array.from({ length: 100 }, (_, i) => `2024-01-${String(i + 1).padStart(2, '0')}`);

describe('ValidationEngine', () => {
  it('splits chronologically without mixing', () => {
    const s = ValidationEngine.split(dates);
    expect(s.train.length).toBe(60);
    expect(s.validation.length).toBe(20);
    expect(s.test.length).toBe(20);
    expect(s.train[s.train.length - 1] < s.validation[0]).toBe(true);
    expect(s.validation[s.validation.length - 1] < s.test[0]).toBe(true);
  });

  it('rolls walk-forward windows', () => {
    const w = ValidationEngine.walkForward(dates, 60, 10, 10, 10);
    expect(w.length).toBe(3);
    expect(w[0].trainStart).toBe(dates[0]);
    expect(w[1].trainStart).toBe(dates[10]);
    expect(w[0].testEnd < w[1].testStart || w[0].testEnd === w[1].testEnd).toBe(true);
  });

  it('measures sensitivity with stability gate', () => {
    expect(ValidationEngine.sensitivity([10, 11, 10.5]).stable).toBe(true);
    expect(ValidationEngine.sensitivity([10, 50]).stable).toBe(false);
  });

  it('segments by caller-supplied regimes without fabrication', () => {
    const labels = { a: 'bull', b: 'bear', c: 'bull' } as Record<string, string>;
    const seg = ValidationEngine.byRegime(labels, ['a', 'b', 'c'], (k) => k);
    expect(seg.bull).toEqual(['a', 'c']);
    expect(seg.bear).toEqual(['b']);
  });

  it('labels samples and shuffles deterministically by seed', () => {
    expect(ValidationEngine.label('OUT_OF_SAMPLE')).toBe('OUT_OF_SAMPLE');
    const a = ValidationEngine.seededShuffle([1, 2, 3, 4, 5], 42);
    const b = ValidationEngine.seededShuffle([1, 2, 3, 4, 5], 42);
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
