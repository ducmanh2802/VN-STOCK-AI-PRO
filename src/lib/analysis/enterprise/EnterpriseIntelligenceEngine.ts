/**
 * ENTERPRISE INTELLIGENCE ENGINE (orchestrator)
 * Runs all 10 engines + enterprise score + scenarios + thesis + alert /
 * evidence / timeline production, and composes the canonical
 * EnterpriseIntelligenceResult. Deterministic; every null is "data unavailable".
 */
import type { EnterpriseIntelligenceResult } from '../../../types/enterpriseIntelligence.ts';
import { EnterpriseInput, DEFAULT_CONFIG, latestFacts, FinancialFactSet } from './financialFacts.ts';
import { BusinessQualityEngine, BusinessQualityQualitative } from './BusinessQualityEngine.ts';
import { GrowthEngine, freeCashFlowOf } from './GrowthEngine.ts';
import { ProfitabilityEngine } from './ProfitabilityEngine.ts';
import { FinancialHealthEngine } from './FinancialHealthEngine.ts';
import { EarningsQualityEngine } from './EarningsQualityEngine.ts';
import { DuPontEngine } from './DuPontEngine.ts';
import { PiotroskiEngine } from './PiotroskiEngine.ts';
import { ValuationIntelligenceEngine } from './ValuationIntelligenceEngine.ts';
import { CompetitiveIntelligenceEngine, CompanyMetrics } from './CompetitiveIntelligenceEngine.ts';
import { RiskCatalystEngine, RiskInput } from './RiskCatalystEngine.ts';
import { MarketIntelligenceEngine, MarketIntelligenceInput } from './MarketIntelligenceEngine.ts';
import { EnterpriseScoreEngine } from './EnterpriseScoreEngine.ts';
import { ScenarioEngine } from './ScenarioEngine.ts';
import { InvestmentThesisEngine } from './InvestmentThesisEngine.ts';
import { DeterministicInterpretationEngine } from './DeterministicInterpretationEngine.ts';
import { DataCompletenessEngine } from './DataCompletenessEngine.ts';
import { AlertEngine } from './AlertEngine.ts';
import { n } from './helpers.ts';

export interface EnterpriseMarketContext {
  technicalScore?: number | null;
  technicalSignal?: string | null;
  momentumScore?: number | null;
  moneyFlowScore?: number | null;
  moneyFlowTrend?: string | null;
  foreignFlowLabel?: string | null;
  volumeScore?: number | null;
}

export interface EnterpriseExtra {
  businessQuality?: BusinessQualityQualitative;
  historicalPE?: number[];
  historicalPB?: number[];
  marketContext?: EnterpriseMarketContext;
  effectiveTaxRate?: number | null;
}

export class EnterpriseIntelligenceEngine {
  static analyze(input: EnterpriseInput, extra?: EnterpriseExtra): EnterpriseIntelligenceResult {
    const config = input.config ?? DEFAULT_CONFIG;
    const facts = input.facts;
    const annals = [...facts.annals].sort((a, b) => a.year - b.year);
    const { current, previous } = latestFacts(facts);
    const price = n(input.market.price);

    // ENGINES 1..6
    const businessQuality = BusinessQualityEngine.evaluate(facts, extra?.businessQuality);
    const growth = GrowthEngine.evaluate(facts);
    const profitability = ProfitabilityEngine.evaluate(facts, extra?.effectiveTaxRate ? { effectiveTaxRate: extra.effectiveTaxRate } : undefined);
    const financialHealth = FinancialHealthEngine.evaluate(facts);
    const earningsQuality = EarningsQualityEngine.evaluate(facts, config);
    const dupont = DuPontEngine.evaluate(facts, extra?.effectiveTaxRate ? { effectiveTaxRate: extra.effectiveTaxRate } : undefined);
    const piotroski = PiotroskiEngine.evaluate(facts);

    // ENGINE 7: valuation
    const valuation = ValuationIntelligenceEngine.evaluate({
      facts,
      price,
      peers: input.peers.map((p) => ({ pe: p.pe, pb: p.pb, evEbitda: p.evEbitda })),
      config,
      historicalPE: extra?.historicalPE,
      historicalPB: extra?.historicalPB,
      historicalFCF: annals.map((f) => freeCashFlowOf(f)),
    });

    // ENGINE 8: competitive
    const companyMetrics = enterpriseCompanyMetrics(input, growth, profitability, financialHealth, earningsQuality, valuation);
    const competitive = CompetitiveIntelligenceEngine.evaluate(companyMetrics, input.peers);

    // ENGINE 9: risk
    const risk = RiskCatalystEngine.evaluate({
      revenueGrowth: growth.revenueYoY,
      revenueCAGR3Y: growth.revenueCAGR3Y,
      netMargin: profitability.netMargin,
      roe: profitability.roe,
      roeTrend: profitability.trends.roeTrend,
      marginChange: profitability.trends.marginChange,
      cashConversion: earningsQuality.cashConversion,
      fcf: earningsQuality.fcf,
      fcfMargin: earningsQuality.fcfMargin,
      debtToEquity: financialHealth.debtToEquity,
      netDebtToEBITDA: financialHealth.netDebtToEBITDA,
      quickRatio: financialHealth.quickRatio,
      interestCoverage: financialHealth.interestCoverage,
      pePercentile: valuation.historicalPEPercentile,
      marginOfSafety: valuation.marginOfSafety,
      peerPremium: valuation.peerPEPremiumDiscount,
      businessRisk: extra?.businessQuality?.businessModelQuality !== undefined ? 100 - (extra.businessQuality.businessModelQuality ?? 50) : null,
      industryRisk: extra?.businessQuality?.industryAttractiveness !== undefined ? 100 - (extra.businessQuality.industryAttractiveness ?? 50) : null,
      dataDate: input.asOfDate,
    });

    // ENGINE 10: market
    const marketIntelligence = MarketIntelligenceEngine.evaluate({
      price,
      tradingDate: input.market.tradingDate,
      source: input.market.source,
      technicalScore: extra?.marketContext?.technicalScore ?? null,
      technicalSignal: extra?.marketContext?.technicalSignal ?? null,
      momentumScore: extra?.marketContext?.momentumScore ?? null,
      moneyFlowScore: extra?.marketContext?.moneyFlowScore ?? null,
      moneyFlowTrend: extra?.marketContext?.moneyFlowTrend ?? null,
      foreignFlowLabel: extra?.marketContext?.foreignFlowLabel ?? null,
      volumeScore: extra?.marketContext?.volumeScore ?? null,
    });

    // SCENARIOS + SCORE + THESIS + AI
    const eps = ValuationIntelligenceEngine.normalizedEPS(current, previous);
    const scenarios = ScenarioEngine.evaluate({
      eps,
      currentPrice: price,
      revenueCAGR: growth.revenueCAGR3Y ?? growth.revenueYoY,
      netMargin: profitability.netMargin,
      config,
    });

    const dataQuality = DataCompletenessEngine.evaluate(buildCompleteness(input, valuation));
    const enterpriseScore = EnterpriseScoreEngine.evaluate({
      businessQuality: businessQuality.score,
      growth: growth.score,
      profitability: profitability.score,
      financialHealth: financialHealth.score,
      earningsQuality: earningsQuality.score,
      valuation: valuation.score,
      competitive: competitive.score,
      marketTechnical: marketIntelligence.score,
      riskLevel: financialHealth.riskLevel,
    });
    enterpriseScore.confidence = dataQuality.confidence;
    enterpriseScore.dataCompleteness = dataQuality.completeness;

    const thesis = InvestmentThesisEngine.evaluate({
      symbol: input.company.symbol,
      sector: input.company.sector,
      businessQuality,
      growth,
      profitability,
      financialHealth,
      earningsQuality,
      piotroski,
      valuation,
      competitive,
      risk,
      scenarios,
      enterpriseScore: enterpriseScore.total,
      isProvisional: enterpriseScore.isProvisional,
      dataCompleteness: dataQuality.completeness,
    });

    const aiInterpretation = DeterministicInterpretationEngine.evaluate({
      symbol: input.company.symbol,
      enterpriseScore: enterpriseScore.total,
      classification: enterpriseScore.classification,
      isProvisional: enterpriseScore.isProvisional,
      completeness: dataQuality.completeness,
      confidence: dataQuality.confidence,
      thesis,
      roe: profitability.roe,
      revenueGrowth: growth.revenueYoY,
      cashConversion: earningsQuality.cashConversion,
      invalidations: thesis.invalidationConditions,
      dataCompleteness: dataQuality.completeness,
    });

    const alerts = AlertEngine.evaluate({ growth, profitability, financialHealth, earningsQuality, valuation, piotroski, scenarios, config });
    const evidence = buildEvidence(growth, profitability, financialHealth, earningsQuality, valuation, current?.source ?? 'NONE', current?.period);
    const timeline = buildTimeline(facts);

    return {
      symbol: input.company.symbol,
      generatedAt: new Date().toISOString(),
      asOfDate: input.asOfDate,
      currency: 'VND',
      dataQuality,
      businessQuality,
      growth,
      profitability,
      financialHealth,
      earningsQuality,
      dupont,
      piotroski,
      valuation,
      competitive,
      marketIntelligence,
      risk,
      enterpriseScore,
      scenarios,
      investmentThesis: thesis,
      aiInterpretation,
      evidence,
      alerts,
      timeline,
    };
  }
}

function enterpriseCompanyMetrics(
  input: EnterpriseInput,
  growth: ReturnType<typeof GrowthEngine.evaluate>,
  profitability: ReturnType<typeof ProfitabilityEngine.evaluate>,
  financialHealth: ReturnType<typeof FinancialHealthEngine.evaluate>,
  earningsQuality: ReturnType<typeof EarningsQualityEngine.evaluate>,
  valuation: ReturnType<typeof ValuationIntelligenceEngine.evaluate>
): CompanyMetrics {
  return {
    revenueGrowth: growth.revenueYoY,
    roe: profitability.roe,
    roic: profitability.roic,
    netMargin: profitability.netMargin,
    grossMargin: profitability.grossMargin,
    operatingMargin: profitability.operatingMargin,
    debtToEquity: financialHealth.debtToEquity,
    fcfMargin: earningsQuality.fcfMargin,
    pe: valuation.pe,
    pb: valuation.pb,
    evEbitda: valuation.evEbitda,
    marketCap: input.market.marketCap,
  };
}

function buildCompleteness(
  input: EnterpriseInput,
  valuation: ReturnType<typeof ValuationIntelligenceEngine.evaluate>
): Parameters<typeof DataCompletenessEngine.evaluate>[0] {
  const c = latestFacts(input.facts).current;
  const metrics: Record<string, boolean> = {
    revenue: c?.revenue !== null,
    netProfit: c?.netProfit !== null,
    grossProfit: c?.grossProfit !== null,
    operatingProfit: c?.operatingProfit !== null,
    totalAssets: c?.totalAssets !== null,
    totalEquity: c?.totalEquity !== null,
    cfo: c?.cfo !== null,
    currentPrice: input.market.price !== null,
    eps: valuation.pe !== null || c?.eps !== null,
    bvps: valuation.pb !== null || c?.bvps !== null,
  };
  return {
    financialPeriods: input.facts.annals.length,
    marketDataAvailable: input.market.price !== null,
    metrics,
  };
}

// Part 3: buildEvidence + buildTimeline appended below
import type {
  GrowthResult,
  ProfitabilityResult,
  FinancialHealthResult,
  EarningsQualityResult,
  ValuationIntelligenceResult,
  AnalysisEvidence,
} from '../../../types/enterpriseIntelligence.ts';
import { round2 } from './helpers.ts';

function buildEvidence(
  growth: GrowthResult,
  profitability: ProfitabilityResult,
  financialHealth: FinancialHealthResult,
  earningsQuality: EarningsQualityResult,
  valuation: ValuationIntelligenceResult,
  source: string,
  period: string | null
): AnalysisEvidence[] {
  const e: AnalysisEvidence[] = [];
  const push = (metric: string, value: number | null, calc: string | null) => {
    if (value === null) return;
    e.push({ metric, value, period, source, calculation: calc, confidence: 'HIGH' });
  };
  push('Revenue growth YoY', growth.revenueYoY, '(current / previous - 1) * 100');
  push('Net margin', profitability.netMargin, 'Net Income / Revenue * 100');
  push('ROE', profitability.roe, 'Net Income / Average Shareholders Equity * 100');
  push('ROIC', profitability.roic, 'NOPAT / Average Invested Capital * 100');
  push('Current ratio', financialHealth.currentRatio, 'Current Assets / Current Liabilities');
  push('Net Debt / EBITDA', financialHealth.netDebtToEBITDA, 'Net Debt / EBITDA');
  push('Cash conversion', earningsQuality.cashConversion, 'CFO / Net Income');
  push('P/E', valuation.pe, 'Price / EPS');
  push('P/B', valuation.pb, 'Price / BVPS');
  return e;
}

function buildTimeline(facts: FinancialFactSet): EnterpriseIntelligenceResult_timeline {
  const sorted = [...facts.annals].sort((a, b) => a.year - b.year);
  return sorted.map((f) => ({
    year: f.year,
    revenue: f.revenue,
    netProfit: f.netProfit,
    eps: f.eps,
    cfo: f.cfo,
    fcf: f.cfo !== null && f.capex !== null ? round2(f.cfo - f.capex) : (f.cfo !== null ? f.cfo : null),
    roe: f.netProfit !== null && f.totalEquity !== null && f.totalEquity! > 0 ? round2((f.netProfit / f.totalEquity) * 100) : null,
    roic: null,
    debt: f.longTermDebt ?? f.totalLiabilities,
    grossMargin: f.grossProfit !== null && f.revenue !== null && f.revenue! > 0 ? round2((f.grossProfit / f.revenue) * 100) : null,
    netMargin: f.netProfit !== null && f.revenue !== null && f.revenue! > 0 ? round2((f.netProfit / f.revenue) * 100) : null,
  }));
}

type EnterpriseIntelligenceResult_timeline = EnterpriseIntelligenceResult['timeline'];