export interface InflightStats {
  size: number;
  coalesced: number;
}

export function inflightStats(): InflightStats {
  return {
    size: 0,
    coalesced: 0,
  };
}

export async function coalesce<T>(_key: string, fn: () => Promise<T>): Promise<T> {
  return fn();
}
