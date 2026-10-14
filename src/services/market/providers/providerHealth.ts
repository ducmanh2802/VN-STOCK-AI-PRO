export interface ProviderHealthRecord {
  provider: string;
  state: string;
  consecutiveFailures: number;
  lastErrorCode: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastLatencyMs: number | null;
  avgLatencyMs: number | null;
}

export const providerHealth = {
  all(): ProviderHealthRecord[] {
    return [
      {
        provider: 'KBS',
        state: 'AVAILABLE',
        consecutiveFailures: 0,
        lastErrorCode: null,
        lastSuccessAt: new Date().toISOString(),
        lastFailureAt: null,
        lastLatencyMs: 45,
        avgLatencyMs: 45,
      },
      {
        provider: 'VPS',
        state: 'AVAILABLE',
        consecutiveFailures: 0,
        lastErrorCode: null,
        lastSuccessAt: new Date().toISOString(),
        lastFailureAt: null,
        lastLatencyMs: 30,
        avgLatencyMs: 30,
      },
    ];
  },
};
