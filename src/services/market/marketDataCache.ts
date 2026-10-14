interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const cacheMap = new Map<string, CacheEntry<unknown>>();
let hitCount = 0;
let missCount = 0;

export function cacheGet<T>(key: string): T | null {
  const entry = cacheMap.get(key);
  if (!entry) {
    missCount++;
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    cacheMap.delete(key);
    missCount++;
    return null;
  }
  hitCount++;
  return entry.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number = 60000): void {
  cacheMap.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

export function cacheClear(): void {
  cacheMap.clear();
  hitCount = 0;
  missCount = 0;
}

export function cacheStats(): { hits: number; misses: number; size: number; keys: string[] } {
  return {
    hits: hitCount,
    misses: missCount,
    size: cacheMap.size,
    keys: Array.from(cacheMap.keys()),
  };
}

export async function cached<T>(key: string, fn: () => Promise<T>, ttlMs: number = 60000): Promise<T> {
  const existing = cacheGet<T>(key);
  if (existing !== null) {
    return existing;
  }
  const fresh = await fn();
  cacheSet(key, fresh, ttlMs);
  return fresh;
}
