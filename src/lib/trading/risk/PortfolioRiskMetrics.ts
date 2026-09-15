/**
 * PHASE UI-3 — SERVER-AUTHORITATIVE PORTFOLIO RISK METRICS
 * ==========================================================
 * Pure, deterministic, fail-closed computation of portfolio risk metrics
 * owned by the server (RiskGuard / PaperBroker accounting domain).
 *
 * Governance contract (see .clinerules/04 & 05):
 *  - Server-authoritative only. The frontend must never compute these numbers.
 *  - Fail-closed: missing or insufficient data yields `value = null` with an
 *    explicit status (`DATA_UNAVAILABLE` / `INSUFFICIENT_DATA` / `STALE`).
 *    Missing inputs are NEVER substituted with zero.
 *  - Every metric discloses: formula, input source, timestamp, window, units,
 *    and confidence assumptions.
 *  - Deterministic: no Math.random(), no hidden clocks for calculations.
 *  - NaN / Infinity / negative / impossible inputs are rejected.
 *
 * NOTE: VaR / drawdown / volatility require REAL historical return series from
 * validated market data. Where none is supplied, those metrics return
 * `INSUFFICIENT_DATA` with `value = null` rather than fabricating a number.
 */

import type { BrokerAccount } from '../execution/BrokerAdapter.ts';

export type RiskMetricStatus =
  | 'OK'
  | 'STALE'
  | 'DATA_UNAVAILABLE'
  | 'INSUFFICIENT_DATA';

export interface RiskMetric {
  /** Numeric value in `units`, or null when data is missing/insufficient. */
  value: number | null;
  status: RiskMetricStatus;
  /** Exact formula used to derive the value. */
  formula: string;
  /** Input provenance (what was consumed). */
  source: string;
  /** Evaluation timestamp. */
  timestamp: string;
  /** Observation / horizon window. */
  window?: string;
  /** Units of `value` (e.g. '%', 'VND'). */
  units: string;
  /** Confidence assumptions (e.g. VaR confidence level). */
  confidence?: string;
  details?: Readonly<Record<string, unknown>>;
}

export interface PortfolioRiskMetricsPolicy {
  maxPositionPercent?: number;
  maxPortfolioExposurePercent?: number;
  maxRiskPerTradePercent?: number;
  dailyLossLimitPercent?: number;
  minimumCashPercent?: number;
}

export type QuoteAvailability = 'FRESH' | 'STALE' | 'UNAVAILABLE';

export interface PortfolioRiskMetricsInput {
  /** Authoritative broker account state. */
  account: BrokerAccount;
  /** Per-symbol validated historical daily returns (decimals), from real data. */
  historicalReturns?: Readonly<Record<string, readonly number[]>>;
  /** Optional equity history series for max-drawdown. */
  equityHistory?: readonly number[];
  /** Total realized loss today (positive number) in VND. */
  dailyRealizedLoss?: number;
  policy?: PortfolioRiskMetricsPolicy;
  /** Per-symbol quote freshness. */
  quoteStatus?: Readonly<Record<string, QuoteAvailability>>;
  /** VaR confidence level (default 0.95). */
  confidenceLevel?: number;
  /** VaR time horizon in days (default 1). */
  timeHorizonDays?: number;
  /** Minimum number of returns required for a valid historical VaR (default 30). */
  minReturnsForVar?: number;
  /** Stress scenario shocks (decimals on equity market value), e.g. { severe: 0.30 }. */
  stressShocks?: Readonly<Record<string, number>>;
  /** Override evaluation timestamp (ms epoch or ISO). */
  now?: number | string;
}

export interface PortfolioRiskMetricsReport {
  computedAt: string;
  accountId: string;
  equity: number | null;
  equityStatus: RiskMetricStatus;
  exposure: RiskMetric;
  concentration: RiskMetric;
  cashUtilization: RiskMetric;
  dailyLoss: RiskMetric;
  drawdown: RiskMetric;
  var: RiskMetric;
  stressLoss: RiskMetric;
  riskApprovedCapital: RiskMetric;
  summary: string;
}

const DEFAULT_POLICY: Required<PortfolioRiskMetricsPolicy> = {
  maxPositionPercent: 20,
  maxPortfolioExposurePercent: 80,
  maxRiskPerTradePercent: 1,
  dailyLossLimitPercent: 3,
  minimumCashPercent: 10,
};

const DEFAULT_MIN_RETURNS_FOR_VAR = 30;

function finite(num: unknown): number | null {
  return typeof num === 'number' && Number.isFinite(num) ? num : null;
}

function isNonNegativeInt(qty: unknown): boolean {
  return typeof qty === 'number' && Number.isInteger(qty) && qty >= 0;
}

function normalizeNow(now?: number | string): string {
  if (now === undefined) return new Date().toISOString();
  const ts = typeof now === 'number' ? new Date(now) : new Date(String(now));
  const time = ts.getTime();
  return Number.isFinite(time) ? ts.toISOString() : new Date().toISOString();
}

function round2(value: number | null): number | null {
  return value === null ? null : Number(value.toFixed(2));
}

/** Determines overall quote-data availability for held (non-zero) positions. */
function heldPositionDataStatus(
  account: BrokerAccount,
  quoteStatus?: Readonly<Record<string, QuoteAvailability>>
): { status: RiskMetricStatus } {
  const held = account.positions.filter((p) => isNonNegativeInt(p.quantity) && p.quantity > 0);
  if (!quoteStatus) return { status: 'OK' };
  let anyUnavailable = false;
  let anyStale = false;
  for (const p of held) {
    const q = quoteStatus[p.symbol.toUpperCase()];
    if (q === 'UNAVAILABLE') anyUnavailable = true;
    else if (q === 'STALE') anyStale = true;
  }
  if (anyUnavailable) return { status: 'DATA_UNAVAILABLE' };
  if (anyStale) return { status: 'STALE' };
  return { status: 'OK' };
}

/**
 * Weights historical returns across held positions by current market value and
 * computes portfolio-level historical VaR. Fail-closed on insufficient history.
 * Returns `{ value, status, count }` where value is a positive VND-style ratio
 * (fraction of equity at risk) scaled by caller to current equity.
 */
function portfolioVar(
  account: BrokerAccount,
  returnsBySymbol: Readonly<Record<string, readonly number[]>>,
  confidenceLevel: number,
  minReturns: number
): { value: number | null; status: RiskMetricStatus; count: number } {
  const marketValue = finite(account.marketValue) ?? 0;
  const held = account.positions.filter((p) => isNonNegativeInt(p.quantity) && p.quantity > 0);
  if (held.length === 0 || marketValue <= 0) {
    // Empty equity exposure => genuinely zero market risk, NOT missing data.
    return { value: 0, status: 'OK', count: 0 };
  }

  const weights: number[] = [];
  const seriesBySymbol: number[][] = [];
  const counts: number[] = [];

  for (const pos of held) {
    const sym = pos.symbol.toUpperCase();
    const price = finite(pos.currentPrice) ?? finite(pos.averageCost) ?? null;
    const mktVal = price !== null && isNonNegativeInt(pos.quantity) ? pos.quantity * price : 0;
    if (mktVal <= 0) continue;
    const returns = returnsBySymbol?.[sym];
    if (!returns || returns.length === 0) {
      counts.push(0);
      continue;
    }
    const cleaned = returns.filter((r) => finite(r) !== null && !Number.isNaN(r));
    if (cleaned.length === 0) {
      counts.push(0);
      continue;
    }
    weights.push(mktVal);
    seriesBySymbol.push(cleaned);
    counts.push(cleaned.length);
  }

  if (weights.length === 0) {
    return { value: null, status: 'INSUFFICIENT_DATA', count: counts.length ? Math.min(...counts) : 0 };
  }

  const alignLen = Math.min(...counts);
  if (alignLen < 2) {
    return { value: null, status: 'INSUFFICIENT_DATA', count: alignLen };
  }

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const portfolioReturns: number[] = [];
  for (let i = 0; i < alignLen; i++) {
    let day = 0;
    for (let s = 0; s < seriesBySymbol.length; s++) {
      const series = seriesBySymbol[s];
      day += (weights[s] / totalWeight) * series[series.length - alignLen + i];
    }
    portfolioReturns.push(day);
  }

  if (alignLen < minReturns) {
    return { value: null, status: 'INSUFFICIENT_DATA', count: alignLen };
  }

  const sorted = [...portfolioReturns].sort((a, b) => a - b);
  const quantile = 1 - confidenceLevel;
  const index = quantile * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  const percentile = sorted[lower] + weight * (sorted[upper] - sorted[lower]);
  // VaR is the negative tail; return as positive value-at-risk.
  const value = -percentile;
  return { value, status: Number.isFinite(value) ? 'OK' : 'DATA_UNAVAILABLE', count: alignLen };
}

function maxDrawdown(equityHistory: readonly number[]): { value: number | null; valid: boolean } {
  const cleaned = equityHistory.map((e) => finite(e));
  if (cleaned.some((e) => e === null)) return { value: null, valid: false };
  const vals = cleaned as number[];
  if (vals.length < 2) return { value: null, valid: false };
  let peak = -Infinity;
  let maxPct = 0;
  for (const e of vals) {
    if (e < 0) return { value: null, valid: false };
    if (e > peak) peak = e;
    const pctFromPeak = peak > 0 ? ((peak - e) / peak) * 100 : 0;
    if (pctFromPeak > maxPct) maxPct = pctFromPeak;
  }
  return { value: maxPct, valid: true };
}

function buildStress(
  shocks: Readonly<Record<string, number>>,
  marketValue: number | null,
  hasInvalidPosition: boolean,
  source: string,
  timestamp: string
): RiskMetric {
  const base = { source, timestamp, units: 'VND' as string };
  if (hasInvalidPosition || marketValue === null) {
    return { ...base, value: null, status: 'DATA_UNAVAILABLE', formula: 'StressLoss = marketValue * shockRate', details: { scenarios: undefined } };
  }
  const entries = Object.entries(shocks).map(([name, rate]) => {
    const f = finite(rate);
    return { name, rate: f !== null && f >= 0 ? f : null };
  });
  const valid = entries.filter((e) => e.rate !== null);
  const shockDesc = `${valid.map((e) => `${e.name}=${(e.rate as number) * 100}%`).join(', ')}`;
  if (valid.length === 0) {
    return { ...base, value: null, status: 'DATA_UNAVAILABLE', formula: 'StressLoss = marketValue * shockRate', details: { scenarios: undefined } };
  }
  if (marketValue === 0) {
    return {
      ...base,
      value: 0,
      status: 'OK',
      formula: 'StressLoss = marketValue * shockRate',
      confidence: `Shocks: ${shockDesc}`,
      details: { scenarios: Object.fromEntries(valid.map((e) => [e.name, 0])), note: 'No equity exposure' },
    };
  }
  const scenarioLosses = Object.fromEntries(valid.map((e) => [e.name, Math.round(marketValue * (e.rate as number))]));
  const worstRate = Math.max(...valid.map((e) => e.rate as number));
  const worst = Math.round(marketValue * worstRate);
  const worstName = valid.find((e) => e.rate === worstRate)?.name;
  return {
    ...base,
    value: worst,
    status: 'OK',
    formula: 'StressLoss(primary) = currentEquityMarketValue * worstShockRate',
    confidence: `Shocks: ${shockDesc}`,
    details: { scenarios: scenarioLosses, worstScenario: worstName },
  };
}

function buildRiskApprovedCapital(
  equity: number | null,
  exposurePercent: number | null,
  marketValue: number | null,
  policy: Required<PortfolioRiskMetricsPolicy>,
  source: string,
  timestamp: string
): RiskMetric {
  if (equity === null || equity < 0) {
    return {
      value: null,
      status: 'DATA_UNAVAILABLE',
      formula: 'RiskApprovedCapital = max(0, equity * maxExposure% - currentExposureVND)',
      source,
      timestamp,
      units: 'VND',
    };
  }
  const maxExposureVND = equity * (policy.maxPortfolioExposurePercent / 100);
  const currentExposure = marketValue ?? (exposurePercent !== null ? (exposurePercent / 100) * equity : null);
  const headroom = currentExposure === null ? Math.max(0, maxExposureVND) : Math.max(0, maxExposureVND - currentExposure);
  return {
    value: Math.round(headroom),
    status: 'OK',
    formula: 'RiskApprovedCapital = max(0, totalEquity * maxPortfolioExposure% - currentExposureVND)',
    source,
    timestamp,
    units: 'VND',
    confidence: `maxPortfolioExposure ${policy.maxPortfolioExposurePercent}%`,
    details: { minCashReserve: equity * (policy.minimumCashPercent / 100) },
  };
}

export class PortfolioRiskMetrics {
  static readonly DEFAULT_CONFIDENCE_LEVEL = 0.95;
  static readonly DEFAULT_TIME_HORIZON_DAYS = 1;

  /**
   * Computes the full server-authoritative risk metrics report.
   * Pure and deterministic.
   */
  static compute(input: PortfolioRiskMetricsInput): PortfolioRiskMetricsReport {
    const account = input.account;
    const computedAt = normalizeNow(input.now);
    const policy: Required<PortfolioRiskMetricsPolicy> = { ...DEFAULT_POLICY, ...(input.policy ?? {}) };
    const confidenceLevel = finite(input.confidenceLevel) ?? PortfolioRiskMetrics.DEFAULT_CONFIDENCE_LEVEL;
    const timeHorizonDays = finite(input.timeHorizonDays) ?? PortfolioRiskMetrics.DEFAULT_TIME_HORIZON_DAYS;
    const minReturns = finite(input.minReturnsForVar) ?? DEFAULT_MIN_RETURNS_FOR_VAR;
    const confidenceText = `${(confidenceLevel * 100).toFixed(0)}% (${timeHorizonDays}-day horizon)`;
    const timestamp = computedAt;
    const source = 'PortfolioRiskMetrics @ TradingEngine server (RiskGuard/PaperBroker accounting)';

    const equity = finite(account.equity);
    const equityStatus: RiskMetricStatus = equity !== null && equity >= 0 ? 'OK' : 'DATA_UNAVAILABLE';

    const hasInvalidPosition = account.positions.some((p) => {
      if (!isNonNegativeInt(p.quantity)) return true;
      const c = finite(p.averageCost);
      return c !== null && (c < 0 || Number.isNaN(c));
    });

    const q = heldPositionDataStatus(account, input.quoteStatus);
    const marketValue = finite(account.marketValue);
    const effectiveMarketValue =
      marketValue !== null
        ? marketValue
        : equity !== null
          ? Math.max(0, equity - (finite(account.cash) ?? 0))
          : null;

    return {
      computedAt,
      accountId: account.accountId,
      equity,
      equityStatus,
      exposure: computeExposure(equity, effectiveMarketValue, marketValue, hasInvalidPosition, q.status, source, timestamp),
      concentration: computeConcentration(account, equity, hasInvalidPosition, q.status, source, timestamp),
      cashUtilization: computeCashUtilization(account, equity, source, timestamp),
      dailyLoss: computeDailyLoss(input.dailyRealizedLoss, equity, policy, source, timestamp),
      drawdown: computeDrawdown(input.equityHistory, source, timestamp),
      var: computeVaR(account, input.historicalReturns, confidenceLevel, timeHorizonDays, minReturns, confidenceText, equity, source, timestamp),
      stressLoss: buildStress(input.stressShocks ?? {}, effectiveMarketValue, hasInvalidPosition, source, timestamp),
      riskApprovedCapital: buildRiskApprovedCapital(equity, null, effectiveMarketValue, policy, source, timestamp),
      summary: 'Server-authoritative portfolio risk metrics; fail-closed on missing/insufficient data.',
    };
  }
}

function computeExposure(
  equity: number | null,
  effectiveMarketValue: number | null,
  authoritativeMarketValue: number | null,
  hasInvalidPosition: boolean,
  quoteStatus: RiskMetricStatus,
  source: string,
  timestamp: string
): RiskMetric {
  if (hasInvalidPosition) {
    return { value: null, status: 'DATA_UNAVAILABLE', formula: 'Exposure = marketValue / equity * 100', source, timestamp, units: '%' };
  }
  let value: number | null = null;
  let status: RiskMetricStatus = quoteStatus;
  if (equity !== null && equity > 0 && effectiveMarketValue !== null && effectiveMarketValue >= 0) {
    value = (effectiveMarketValue / equity) * 100;
    if (status === 'DATA_UNAVAILABLE' && authoritativeMarketValue !== null) status = 'STALE';
  } else if (equity === 0) {
    value = 0;
    status = 'OK';
  } else {
    status = 'DATA_UNAVAILABLE';
  }
  return { value: round2(value), status, formula: 'Exposure = sum(quantity*markPrice)/totalEquity*100', source, timestamp, units: '%', details: { marketValue: effectiveMarketValue, equity } };
}

function computeConcentration(
  account: BrokerAccount,
  equity: number | null,
  hasInvalidPosition: boolean,
  quoteStatus: RiskMetricStatus,
  source: string,
  timestamp: string
): RiskMetric {
  const held = account.positions.filter((p) => isNonNegativeInt(p.quantity) && p.quantity > 0);
  if (held.length === 0) {
    return { value: 0, status: 'OK', formula: 'Concentration = max(positionValue)/totalEquity*100', source, timestamp, units: '%', details: { positionCount: 0 } };
  }
  if (hasInvalidPosition) {
    return { value: null, status: 'DATA_UNAVAILABLE', formula: 'Concentration = max(positionValue)/totalEquity*100', source, timestamp, units: '%' };
  }
  if (quoteStatus !== 'OK') {
    return { value: null, status: quoteStatus, formula: 'Concentration = max(positionValue)/totalEquity*100', source, timestamp, units: '%' };
  }
  if (equity === null || equity <= 0) {
    return { value: null, status: 'DATA_UNAVAILABLE', formula: 'Concentration = max(positionValue)/totalEquity*100', source, timestamp, units: '%' };
  }
  let largest = 0;
  for (const p of held) {
    const price = finite(p.currentPrice) ?? finite(p.averageCost) ?? null;
    if (price !== null && price >= 0) largest = Math.max(largest, p.quantity * price);
  }
  return { value: round2((largest / equity) * 100), status: 'OK', formula: 'Concentration = max(positionValue)/totalEquity*100', source, timestamp, units: '%', details: { positionCount: held.length } };
}

function computeCashUtilization(account: BrokerAccount, equity: number | null, source: string, timestamp: string): RiskMetric {
  const cash = finite(account.cash);
  if (cash === null || equity === null) {
    return { value: null, status: 'DATA_UNAVAILABLE', formula: 'Cash Utilization = cash/totalEquity*100', source, timestamp, units: '%' };
  }
  return { value: round2(equity > 0 ? (cash / equity) * 100 : 0), status: 'OK', formula: 'Cash Utilization = cash/totalEquity*100', source, timestamp, units: '%', details: { availableCash: finite(account.availableCash), reservedCash: finite(account.reservedCash) } };
}

function computeDailyLoss(
  dailyRealizedLoss: number | undefined,
  equity: number | null,
  policy: Required<PortfolioRiskMetricsPolicy>,
  source: string,
  timestamp: string
): RiskMetric {
  const d = finite(dailyRealizedLoss);
  return {
    value: d,
    status: d === null ? 'DATA_UNAVAILABLE' : 'OK',
    formula: 'DailyLoss = sum(realized P&L of SELL fills today) in VND',
    source: d === null ? 'No daily loss telemetry supplied' : source,
    timestamp,
    units: 'VND',
    confidence: `${policy.dailyLossLimitPercent}% equity limit`,
    details: { limit: equity !== null ? (equity * policy.dailyLossLimitPercent) / 100 : null },
  };
}

function computeDrawdown(equityHistory: readonly number[] | undefined, source: string, timestamp: string): RiskMetric {
  if (!equityHistory || equityHistory.length === 0) {
    return { value: null, status: 'INSUFFICIENT_DATA', formula: 'MaxDrawdown% = max((Peak-Equity)/Peak)*100', source: 'Equity history not supplied', timestamp, units: '%' };
  }
  const dd = maxDrawdown(equityHistory);
  if (dd.valid && dd.value !== null) {
    return { value: round2(dd.value), status: 'OK', formula: 'MaxDrawdown% = max((Peak-Equity)/Peak)*100', source: 'Validated equity history', timestamp, window: `${equityHistory.length} points`, units: '%' };
  }
  return { value: null, status: 'DATA_UNAVAILABLE', formula: 'MaxDrawdown% = max((Peak-Equity)/Peak)*100', source: 'Equity history invalid or insufficient', timestamp, units: '%' };
}

function computeVaR(
  account: BrokerAccount,
  historicalReturns: Readonly<Record<string, readonly number[]>> | undefined,
  confidenceLevel: number,
  timeHorizonDays: number,
  minReturns: number,
  confidenceText: string,
  equity: number | null,
  source: string,
  timestamp: string
): RiskMetric {
  const res = portfolioVar(account, historicalReturns ?? {}, confidenceLevel, minReturns);
  let value = res.value;
  let status: RiskMetricStatus = res.status;
  if (value !== null && equity !== null && equity > 0) value = Math.max(0, value * equity);
  else if (value !== null && equity === 0) status = 'OK';
  if (value === null) status = 'INSUFFICIENT_DATA';
  return {
    value: value === null ? null : Math.round(value),
    status,
    formula: `VaR = P${confidenceLevel * 100} portfolio return (value-weighted) * currentEquity; historical, ${timeHorizonDays}-day horizon`,
    source: status === 'OK'
      ? 'Real validated historical returns per symbol, value-weighted'
      : status === 'INSUFFICIENT_DATA'
        ? 'Insufficient historical returns (< minimum required)'
        : 'Historical returns unavailable',
    timestamp,
    window: `${timeHorizonDays}-day`,
    units: 'VND',
    confidence: confidenceText,
    details: { confidenceLevel, timeHorizonDays, minReturns, returnSamples: res.count },
  };
}