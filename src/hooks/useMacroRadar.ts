/**
 * PHASE 25+ — USE MACRO RADAR QUERY HOOK
 * ========================================
 * React Query hook retrieving the canonical MacroRadarSnapshot.
 */

import { useQuery } from '@tanstack/react-query';
import { MacroIntelligenceService } from '../services/macro/MacroIntelligenceService.ts';
import type { MacroRadarSnapshot } from '../lib/analysis/macro/types.ts';

export const MACRO_KEYS = {
  all: ['macro'] as const,
  radar: (asOfDate?: string) => ['macro', 'radar', asOfDate ?? 'latest'] as const,
};

export interface UseMacroRadarOptions {
  readonly asOfDate?: string;
  readonly forceRefresh?: boolean;
  readonly refetchInterval?: number;
}

export function useMacroRadar(options?: UseMacroRadarOptions) {
  return useQuery<MacroRadarSnapshot>({
    queryKey: MACRO_KEYS.radar(options?.asOfDate),
    queryFn: async () => {
      return MacroIntelligenceService.getSnapshot({
        asOfDate: options?.asOfDate,
        forceRefresh: options?.forceRefresh,
      });
    },
    staleTime: 60 * 1000, // 60s
    refetchInterval: options?.refetchInterval ?? 60 * 1000,
  });
}
