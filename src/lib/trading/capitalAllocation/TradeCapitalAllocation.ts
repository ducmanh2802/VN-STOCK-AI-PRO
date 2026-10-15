import type { TradeCapitalAllocationInput, TradeCapitalAllocationResult } from './TradeCapitalAllocationTypes.ts';

const finite = (value: number): boolean => Number.isFinite(value);
const rejected = (status: 'REJECTED' | 'INSUFFICIENT_DATA' | 'NOT_APPLICABLE', reason: string): TradeCapitalAllocationResult =>
  ({ status, allocationCapital: 0, reason });

/** Pure allocation-capacity adapter. It never calculates risk, price, or quantity. */
export class TradeCapitalAllocation {
  static allocate(input: TradeCapitalAllocationInput): TradeCapitalAllocationResult {
    const { account, recommendation, riskDecision, riskConfig, riskApprovedCapital } = input;
    if (!account || !recommendation || !riskDecision || !riskConfig) return rejected('INSUFFICIENT_DATA', 'Canonical account, recommendation, risk decision, and risk configuration are required.');
    if (recommendation.signal === 'SELL') return rejected('NOT_APPLICABLE', 'SELL uses the existing-position flow and receives no new capital allocation.');
    if (recommendation.signal !== 'BUY') return rejected('REJECTED', 'Only an already-issued BUY recommendation can receive capital allocation.');
    if (!riskDecision.approved) return rejected('REJECTED', riskDecision.reason || 'Risk decision did not approve the trade.');

    const values = [account.equity, account.availableCash, account.marketValue, riskApprovedCapital, riskConfig.maxPortfolioExposureRate];
    if (!values.every(finite)) return rejected('INSUFFICIENT_DATA', 'Allocation inputs must be finite numbers.');
    if (account.equity <= 0) return rejected('INSUFFICIENT_DATA', 'Portfolio equity must be positive.');
    if (account.availableCash < 0 || account.marketValue < 0 || riskApprovedCapital < 0) return rejected('INSUFFICIENT_DATA', 'Cash, exposure, and risk-approved capital cannot be negative.');
    if (riskConfig.maxPortfolioExposureRate <= 0 || riskConfig.maxPortfolioExposureRate > 1) return rejected('INSUFFICIENT_DATA', 'Maximum portfolio exposure rate must be within (0, 1].');

    const remainingExposureCapacity = (account.equity * riskConfig.maxPortfolioExposureRate) - account.marketValue;
    if (!finite(remainingExposureCapacity) || remainingExposureCapacity <= 0) return rejected('REJECTED', 'No portfolio exposure capacity remains.');
    const allocationCapital = Math.min(account.availableCash, remainingExposureCapacity, riskApprovedCapital);
    if (!finite(allocationCapital) || allocationCapital <= 0) return rejected('REJECTED', 'No positive capital capacity remains after cash, exposure, and risk constraints.');
    const allocationPct = (allocationCapital / account.equity) * 100;
    if (!finite(allocationPct) || allocationPct < 0 || account.marketValue + allocationCapital > account.equity * riskConfig.maxPortfolioExposureRate) {
      return rejected('REJECTED', 'Calculated allocation violates portfolio exposure constraints.');
    }
    return { status: 'ALLOCATED', allocationCapital, allocationPct, remainingExposureCapacity, reason: 'Allocation is capped by available cash, remaining exposure capacity, and the risk-approved capital ceiling.' };
  }
}
