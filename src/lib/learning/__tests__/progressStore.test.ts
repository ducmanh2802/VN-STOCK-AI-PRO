import { beforeEach, describe, expect, it } from 'vitest';
import { CATALOG_VERSION } from '../catalog';
import { LocalProgressStore, progressStore, scopedStore } from '../ProgressStore';

// In-memory localStorage shim when the runner has no DOM (production code
// fail-safes on undefined localStorage; tests need a real key-value surface).
if (typeof localStorage === 'undefined') {
  const mem = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k: string, v: string) => {
      mem.set(k, String(v));
    },
    removeItem: (k: string) => {
      mem.delete(k);
    },
    clear: () => mem.clear(),
  };
}

const LEGACY_KEY = 'vnstock_learning_progress_v1';

beforeEach(() => {
  localStorage.clear();
});

describe('corruption fail-safe', () => {
  it('corrupt JSON degrades to empty, never throws', () => {
    localStorage.setItem(LEGACY_KEY, '{not-json');
    expect(progressStore.getCompletedLessons()).toEqual([]);
    expect(progressStore.getStaleCompletions()).toEqual([]);
    expect(progressStore.getAttempts('ex-x')).toEqual([]);
  });
  it('wrong shape degrades safely', () => {
    localStorage.setItem(LEGACY_KEY, '"just-a-string"');
    expect(progressStore.getCompletedLessons()).toEqual([]);
  });
  it('null entries inside arrays are skipped', () => {
    localStorage.setItem(LEGACY_KEY, '[null,{"lessonId":"les-market-101","completed":true}]');
    expect(progressStore.getCompletedLessons()).toEqual(['les-market-101']);
  });
});

describe('version-aware completions (P1 foundation)', () => {
  it('fresh completions stamp current catalog version and are not stale', () => {
    progressStore.completeLesson('les-market-101');
    expect(progressStore.getCompletedLessons()).toContain('les-market-101');
    expect(progressStore.getStaleCompletions()).toEqual([]);
    const raw = JSON.parse(localStorage.getItem(LEGACY_KEY) as string) as { catalogVersion?: string }[];
    expect(raw[0].catalogVersion).toBe(CATALOG_VERSION);
  });
  it('legacy entries without version still count but are flagged stale', () => {
    localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify([{ lessonId: 'les-market-101', completed: true }]),
    );
    expect(progressStore.getCompletedLessons()).toContain('les-market-101');
    expect(progressStore.getStaleCompletions()).toContain('les-market-101');
  });
  it('older-version entries are flagged stale', () => {
    localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify([{ lessonId: 'les-x', completed: true, catalogVersion: '0.0.0-legacy' }]),
    );
    expect(progressStore.getStaleCompletions()).toContain('les-x');
  });
});

describe('learner identity scoping (§19 boundary)', () => {
  it('scoped stores isolate learners; default keys unchanged', () => {
    const a = scopedStore({ learnerId: 'user-A' });
    const b = scopedStore({ learnerId: 'user-B' });
    a.completeLesson('les-market-101');
    expect(a.getCompletedLessons()).toContain('les-market-101');
    expect(b.getCompletedLessons()).not.toContain('les-market-101');
    // default singleton still uses legacy keys (backward compatible)
    const legacy = new LocalProgressStore();
    expect(legacy.getCompletedLessons()).not.toContain('les-market-101');
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });
  it('blank identity falls back to local default', () => {
    const s = scopedStore({ learnerId: '   ' });
    s.completeLesson('les-market-101');
    expect(progressStore.getCompletedLessons()).toContain('les-market-101');
  });
});
