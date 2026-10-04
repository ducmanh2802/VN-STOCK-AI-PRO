import { describe, it, expect } from 'vitest';
import { RegimeTransitionEngine } from '../RegimeTransitionEngine.ts';

describe('Phase 27 — RegimeTransitionEngine', () => {
  it('detects no shift and increments persistence when currentRegime equals previousRegime', () => {
    const transition = RegimeTransitionEngine.detectTransition(
      'EXPANSION',
      'EXPANSION',
      '2026-09-30',
      3
    );
    expect(transition.isShift).toBe(false);
    expect(transition.persistencePeriods).toBe(4);
    expect(transition.currentRegime).toBe('EXPANSION');
    expect(transition.previousRegime).toBe('EXPANSION');
  });

  it('detects a shift and resets persistence to 1 when currentRegime differs from previousRegime', () => {
    const transition = RegimeTransitionEngine.detectTransition(
      'INFLATIONARY_EXPANSION',
      'EXPANSION',
      '2026-09-30',
      4
    );
    expect(transition.isShift).toBe(true);
    expect(transition.persistencePeriods).toBe(1);
    expect(transition.shiftDescriptionVi).toContain('Chuyển dịch chu kỳ kinh tế từ [EXPANSION] sang [INFLATIONARY_EXPANSION]');
  });

  it('handles first snapshot where previousRegime is UNKNOWN', () => {
    const transition = RegimeTransitionEngine.detectTransition(
      'EXPANSION',
      'UNKNOWN',
      '2026-09-30',
      1
    );
    expect(transition.isShift).toBe(false);
    expect(transition.persistencePeriods).toBe(2);
  });
});
