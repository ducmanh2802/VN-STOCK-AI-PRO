export interface FallbackStats {
  totalAttempts: number;
  fallbackCount: number;
}

export function fallbackStats(): FallbackStats {
  return {
    totalAttempts: 0,
    fallbackCount: 0,
  };
}
