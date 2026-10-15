import { describe, expect, it } from 'vitest';
import { provenanceFromIsDemo } from '../SourceBadge';

describe('provenanceFromIsDemo', () => {
  it('empty array -> unavailable', () => {
    expect(provenanceFromIsDemo([])).toBe('unavailable');
  });

  it('[false, false] -> real', () => {
    expect(provenanceFromIsDemo([false, false])).toBe('real');
  });

  it('[false, true] -> demo', () => {
    expect(provenanceFromIsDemo([false, true])).toBe('demo');
  });

  it('[true, undefined] -> demo', () => {
    expect(provenanceFromIsDemo([true, undefined])).toBe('demo');
  });

  it('[false, undefined] -> unavailable', () => {
    expect(provenanceFromIsDemo([false, undefined])).toBe('unavailable');
  });

  it('[null] -> unavailable', () => {
    expect(provenanceFromIsDemo([null])).toBe('unavailable');
  });
});
