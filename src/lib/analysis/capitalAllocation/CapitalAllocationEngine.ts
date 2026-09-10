import type { AnnualFinancialFact } from '../enterprise/financialFacts.ts';
import { change, fcf, incrementalProfitPerRetainedCapital, pct, roe, roic } from './calculations.ts';
import { createExplanations } from './explanations.ts';
import type { CapitalAllocationInput, CapitalAllocationResult, CompanyType, Evidence, Metric } from './types.ts';

const evidence = (f: AnnualFinancialFact, statement: Evidence['statement'], lineItem: string, dataDate: string | null): Evidence => ({ source: f.source, period: f.period, statement, lineItem, dataDate });
const metric = (value: number | null, unit: Metric['unit'], ev: Evidence[]): Metric => ({ value, unit, evidence: value === null ? [] : ev });
const classify = (input: CapitalAllocationInput): CompanyType => input.companyType ?? 'UNKNOWN';

export class CapitalAllocationEngine {
  static analyze(input: CapitalAllocationInput): CapitalAllocationResult {
    const facts = [...input.facts.annals].sort((a, b) => a.year - b.year);
    const current = facts.at(-1) ?? null; const previous = facts.at(-2) ?? null;
    const type = classify(input); const dividends = input.dividendsPaid ?? new Map();
    const reasons: string[] = [];
    if (!current) reasons.push('Không có kỳ báo cáo tài chính năm.');
    if (current && type !== 'BANK' && (current.cfo === null || current.capex === null)) reasons.push('Thiếu CFO hoặc CAPEX từ Báo cáo lưu chuyển tiền tệ.');
    if (current && !dividends.has(current.year)) reasons.push('Thiếu cổ tức tiền mặt thực trả đã xác minh.');
    const ev = (statement: Evidence['statement'], item: string) => current ? [evidence(current, statement, item, input.asOfDate)] : [];
    const payout = current ? pct(dividends.get(current.year) ?? null, current.netProfit) : null;
    const retained = payout === null ? null : 100 - payout;
    const m: Record<string, Metric> = {
      revenueGrowth: metric(current && previous ? change(current.revenue, previous.revenue) : null, '%', ev('Income Statement', 'Revenue')),
      profitGrowth: metric(current && previous ? change(current.netProfit, previous.netProfit) : null, '%', ev('Income Statement', 'Net profit')),
      epsGrowth: metric(current && previous ? change(current.eps, previous.eps) : null, '%', ev('Income Statement', 'EPS')),
      roe: metric(current ? roe(current, previous) : null, '%', ev('Derived', 'Net profit / average equity')),
      roic: metric(type === 'BANK' || !current ? null : roic(current, previous), '%', ev('Derived', 'Operating profit / invested capital')),
      cfo: metric(current?.cfo ?? null, 'VND', ev('Cash Flow Statement', 'Operating cash flow')),
      fcf: metric(current && type !== 'BANK' ? fcf(current) : null, 'VND', ev('Derived', 'CFO - CAPEX')),
      cashConversion: metric(current ? pct(current.cfo, current.netProfit) : null, '%', ev('Derived', 'CFO / net profit')),
      dividendPayout: metric(payout, '%', ev('Cash Flow Statement', 'Dividends paid')),
      capexRevenue: metric(current ? pct(current.capex, current.revenue) : null, '%', ev('Derived', 'CAPEX / revenue')),
      capexCfo: metric(current ? pct(current.capex, current.cfo) : null, '%', ev('Derived', 'CAPEX / CFO')),
      incrementalProfitRetainedCapital: metric(incrementalProfitPerRetainedCapital(facts.slice(-5), dividends), 'x', ev('Derived', 'Change in profit / cumulative retained profit')),
    };
    const usable = [m.roe.value, type === 'BANK' ? null : m.roic.value, m.cashConversion.value, m.dividendPayout.value, m.incrementalProfitRetainedCapital.value].filter((v): v is number => v !== null);
    const score = reasons.length || !usable.length ? null : Math.round(usable.reduce((s, v) => s + Math.max(0, Math.min(100, v)), 0) / usable.length);
    const result: CapitalAllocationResult = { symbol: input.symbol, period: current?.period ?? null, companyType: type, dataStatus: reasons.length ? 'DATA_UNAVAILABLE' : 'OK', unavailableReasons: reasons, score, confidence: score === null ? 'UNAVAILABLE' : usable.length >= 4 ? 'HIGH' : 'MEDIUM', dataCompleteness: Math.round((Object.values(m).filter(x => x.value !== null).length / Object.keys(m).length) * 100), metrics: m, normalizedPer1000Billion: { dividend: payout === null ? null : payout * 10, retained: retained === null ? null : retained * 10 }, explanations: [], evidence: Object.values(m).flatMap(x => x.evidence), investorWatchlist: type === 'BANK' ? ['ROE, tăng trưởng tín dụng, vốn chủ sở hữu và chất lượng tài sản.'] : ['CFO so với lợi nhuận kế toán.', 'CAPEX và hiệu quả sinh lời trên vốn.', 'Cổ tức thực trả và diễn biến nợ.'] };
    result.explanations = createExplanations(result); return result;
  }
}
