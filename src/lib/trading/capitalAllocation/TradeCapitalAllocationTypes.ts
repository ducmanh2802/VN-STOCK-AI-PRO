import type { BrokerAccount } from '../execution/BrokerAdapter.ts';
import type { InvestmentRecommendation } from '../../../types/recommendation.ts';
import type { RiskCheckResult, RiskConfig } from '../types/risk.ts';

/**
 * Canonical account, recommendation and risk outputs enter this pure boundary.
 * `riskApprovedCapital` is mandatory because RiskManager currently exposes a
 * risk amount, not a capital-allocation ceiling; this adapter never derives it.
 */
export interface TradeCapitalAllocationInput {
  account: Pick<BrokerAccount, 'equity' | 'availableCash' | 'marketValue'>;
  recommendation: Pick<InvestmentRecommendation, 'signal'>;
  riskDecision: RiskCheckResult;
  riskConfig: Pick<RiskConfig, 'maxPortfolioExposureRate'>;
  riskApprovedCapital: number;
}

export type TradeCapitalAllocationResult =
  | { status: 'ALLOCATED'; allocationCapital: number; allocationPct: number; remainingExposureCapacity: number; reason: string }
  | { status: 'REJECTED' | 'INSUFFICIENT_DATA' | 'NOT_APPLICABLE'; allocationCapital: 0; reason: string };
