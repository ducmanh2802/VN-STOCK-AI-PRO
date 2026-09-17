import { ConfidenceLevel } from '../../types/enterpriseIntelligence';
import { InvestmentHorizon, RecommendationRanking, RecommendationSignal } from '../../types/recommendation';

export type RankingSortKey =
  | 'rank'
  | 'symbol'
  | 'companyName'
  | 'signal'
  | 'score'
  | 'expectedReturn'
  | 'riskReward'
  | 'confidence'
  | 'status';

export type SortDirection = 'asc' | 'desc';

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Formats a ranking position into a display string.
 * Non-positive or non-finite ranks return placeholder '—'.
 */
export function formatRank(rank: unknown): string {
  if (isPositiveFiniteNumber(rank)) {
    return Math.round(rank).toString();
  }
  return '—';
}

/**
 * Formats a strategy composite score (0-100).
 * Unavailable / non-finite scores return '—' (NEVER '0' as a substitute).
 */
export function formatScore(score: unknown): string {
  if (isFiniteNumber(score)) {
    return Math.round(score).toString();
  }
  return '—';
}

/**
 * Formats expected return into a signed percentage (e.g. +12.5%, -4.2%, 0.0%).
 * Unavailable / non-finite returns return '—'.
 */
export function formatExpectedReturn(value: unknown): string {
  if (isFiniteNumber(value)) {
    const prefix = value > 0 ? '+' : '';
    return `${prefix}${value.toFixed(1)}%`;
  }
  return '—';
}

/**
 * Formats risk/reward ratio as '1 : X.X'.
 * Unavailable, zero, or non-finite ratios return '—'.
 */
export function formatRiskReward(value: unknown): string {
  if (isPositiveFiniteNumber(value)) {
    return `1 : ${value.toFixed(1)}`;
  }
  return '—';
}

const CONFIDENCE_WEIGHTS: Record<ConfidenceLevel, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

const SIGNAL_WEIGHTS: Record<RecommendationSignal, number> = {
  BUY: 3,
  HOLD: 2,
  SELL: 1,
};

/**
 * Creates a deterministic, fail-closed sorter for recommendation rankings.
 * Quantitative metrics place non-finite/unavailable values at the bottom (nulls last)
 * regardless of sort direction, avoiding false zeroes or misleading rank order.
 */
export function makeRankingSorter(sortBy: RankingSortKey, sortDirection: SortDirection) {
  return (a: RecommendationRanking, b: RecommendationRanking): number => {
    let result = 0;

    switch (sortBy) {
      case 'rank': {
        const aValid = isPositiveFiniteNumber(a.rank);
        const bValid = isPositiveFiniteNumber(b.rank);
        if (aValid && bValid) {
          result = sortDirection === 'asc' ? a.rank - b.rank : b.rank - a.rank;
        } else if (aValid !== bValid) {
          result = aValid ? -1 : 1; // nulls last
        }
        break;
      }
      case 'score': {
        const aValid = isFiniteNumber(a.score);
        const bValid = isFiniteNumber(b.score);
        if (aValid && bValid) {
          result = sortDirection === 'asc' ? (a.score as number) - (b.score as number) : (b.score as number) - (a.score as number);
        } else if (aValid !== bValid) {
          result = aValid ? -1 : 1; // nulls last
        }
        break;
      }
      case 'expectedReturn': {
        const aValid = isFiniteNumber(a.expectedReturn);
        const bValid = isFiniteNumber(b.expectedReturn);
        if (aValid && bValid) {
          result = sortDirection === 'asc'
            ? (a.expectedReturn as number) - (b.expectedReturn as number)
            : (b.expectedReturn as number) - (a.expectedReturn as number);
        } else if (aValid !== bValid) {
          result = aValid ? -1 : 1;
        }
        break;
      }
      case 'riskReward': {
        const aValid = isPositiveFiniteNumber(a.riskReward);
        const bValid = isPositiveFiniteNumber(b.riskReward);
        if (aValid && bValid) {
          result = sortDirection === 'asc'
            ? (a.riskReward as number) - (b.riskReward as number)
            : (b.riskReward as number) - (a.riskReward as number);
        } else if (aValid !== bValid) {
          result = aValid ? -1 : 1;
        }
        break;
      }
      case 'signal': {
        const aWeight = a.signal ? (SIGNAL_WEIGHTS[a.signal] ?? 0) : 0;
        const bWeight = b.signal ? (SIGNAL_WEIGHTS[b.signal] ?? 0) : 0;
        if (aWeight !== bWeight) {
          result = sortDirection === 'asc' ? aWeight - bWeight : bWeight - aWeight;
        }
        break;
      }
      case 'confidence': {
        const aWeight = a.confidence ? (CONFIDENCE_WEIGHTS[a.confidence] ?? 0) : 0;
        const bWeight = b.confidence ? (CONFIDENCE_WEIGHTS[b.confidence] ?? 0) : 0;
        if (aWeight !== bWeight) {
          result = sortDirection === 'asc' ? aWeight - bWeight : bWeight - aWeight;
        }
        break;
      }
      case 'symbol': {
        const aSym = a.symbol || '';
        const bSym = b.symbol || '';
        result = sortDirection === 'asc' ? aSym.localeCompare(bSym) : bSym.localeCompare(aSym);
        break;
      }
      case 'companyName': {
        const aName = a.companyName || '';
        const bName = b.companyName || '';
        result = sortDirection === 'asc' ? aName.localeCompare(bName) : bName.localeCompare(aName);
        break;
      }
      case 'status': {
        const aStat = a.dataStatus || (isFiniteNumber(a.score) ? 'OK' : 'DATA_UNAVAILABLE');
        const bStat = b.dataStatus || (isFiniteNumber(b.score) ? 'OK' : 'DATA_UNAVAILABLE');
        result = sortDirection === 'asc' ? aStat.localeCompare(bStat) : bStat.localeCompare(aStat);
        break;
      }
    }

    if (result !== 0) return result;

    // Stable secondary tie-breaker: score desc -> expectedReturn desc -> symbol asc
    const aScore = isFiniteNumber(a.score) ? a.score : -Infinity;
    const bScore = isFiniteNumber(b.score) ? b.score : -Infinity;
    if (aScore !== bScore) return bScore - aScore;

    const aReturn = isFiniteNumber(a.expectedReturn) ? a.expectedReturn : -Infinity;
    const bReturn = isFiniteNumber(b.expectedReturn) ? b.expectedReturn : -Infinity;
    if (aReturn !== bReturn) return bReturn - aReturn;

    return (a.symbol || '').localeCompare(b.symbol || '');
  };
}

/**
 * Formats evaluation timestamp to localized display string.
 * Returns '—' for missing, empty, or invalid timestamps.
 */
export function formatEvaluationTimestamp(timestamp: unknown): string {
  if (typeof timestamp === 'string' && timestamp.trim()) {
    try {
      const d = new Date(timestamp);
      if (!isNaN(d.getTime())) {
        return `${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} ${d.toLocaleDateString('vi-VN')}`;
      }
    } catch {
      // ignore
    }
  }
  return '—';
}

/**
 * Formats data status into standard localized label.
 */
export function formatDataStatus(status: unknown): { label: string; isAvailable: boolean } {
  if (status === 'OK') {
    return { label: 'KHẢ DỤNG', isAvailable: true };
  }
  return { label: 'CHƯA ĐỦ DỮ LIỆU', isAvailable: false };
}
