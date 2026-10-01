/**
 * PHASE 22 — ETF NAV & PREMIUM/DISCOUNT ENGINE
 * =============================================
 * Pure mathematical engine for ETF Net Asset Value (NAV),
 * Intraday Indicative NAV (iNAV), and Premium/Discount valuation.
 *
 * Invariants:
 * - Strict mathematical separation of Official EOD NAV from Intraday iNAV
 * - Fail-closed: Zero/negative NAV or missing prices evaluate to null
 * - Explicit regime categorization: PREMIUM | DISCOUNT | PAR | DATA_UNAVAILABLE
 * - Strict guards against division by zero
 */

import type {
  EtfINavData,
  EtfNavData,
  EtfNavReferenceType,
  EtfPremiumDiscountRegime,
  EtfPremiumDiscountResult,
} from './types.ts';

export interface BasketConstituentInput {
  symbol: string;
  sharesInBasket: number;
  marketPrice: number | null;
}

export interface INavCalculationInput {
  symbol: string;
  constituents: BasketConstituentInput[];
  cashComponentVnd: number;
  creationUnitShares: number;
  asOfTimestamp?: number;
}

export interface PremiumDiscountCalculationInput {
  symbol: string;
  marketPrice: number | null;
  referenceNav: number | null;
  referenceNavType: EtfNavReferenceType;
  asOfDate?: string;
  marketTimestamp?: number | null;
  navTimestamp?: number | null;
  maxTimestampDeltaMs?: number;
}

export class EtfNavEngine {
  /**
   * Computes official NAV change and percentage change.
   */
  public static computeOfficialNavChange(
    navPerShare: number | null,
    previousNavPerShare: number | null
  ): { change: number | null; changePercent: number | null } {
    if (
      navPerShare === null ||
      navPerShare <= 0 ||
      previousNavPerShare === null ||
      previousNavPerShare <= 0
    ) {
      return { change: null, changePercent: null };
    }

    const change = Math.round((navPerShare - previousNavPerShare) * 100) / 100;
    const changePercent =
      Math.round(((navPerShare - previousNavPerShare) / previousNavPerShare) * 10000) / 100;

    return { change, changePercent };
  }

  /**
   * Computes Intraday Indicative Net Asset Value (iNAV).
   * Formula:
   *   iNAV = (Sum(Shares_i * Price_i) + Cash) / CreationUnitShares
   *
   * Fail-Closed Invariant:
   * If ANY constituent price is null, <= 0, or missing, iNAV fails closed to null.
   */
  public static calculateINav(input: INavCalculationInput): EtfINavData {
    const { symbol, constituents, cashComponentVnd, creationUnitShares, asOfTimestamp } = input;
    const warnings: string[] = [];

    if (!constituents || constituents.length === 0) {
      warnings.push('Constituents basket is empty');
      return {
        symbol,
        inavPerShare: null,
        basketMarketValue: null,
        cashComponent: cashComponentVnd,
        creationUnitShares,
        asOfTimestamp: asOfTimestamp ?? null,
        status: 'DATA_UNAVAILABLE',
        warnings,
      };
    }

    if (!creationUnitShares || creationUnitShares <= 0) {
      warnings.push(`Invalid creation unit shares size: ${creationUnitShares}`);
      return {
        symbol,
        inavPerShare: null,
        basketMarketValue: null,
        cashComponent: cashComponentVnd,
        creationUnitShares,
        asOfTimestamp: asOfTimestamp ?? null,
        status: 'DATA_UNAVAILABLE',
        warnings,
      };
    }

    let basketMarketValue = 0;

    for (const c of constituents) {
      if (c.marketPrice === null || c.marketPrice <= 0 || !Number.isFinite(c.marketPrice)) {
        warnings.push(`Missing or invalid market price for constituent ${c.symbol}`);
        return {
          symbol,
          inavPerShare: null,
          basketMarketValue: null,
          cashComponent: cashComponentVnd,
          creationUnitShares,
          asOfTimestamp: asOfTimestamp ?? null,
          status: 'DATA_UNAVAILABLE',
          warnings,
        };
      }
      if (c.sharesInBasket < 0 || !Number.isFinite(c.sharesInBasket)) {
        warnings.push(`Invalid shares quantity for constituent ${c.symbol}: ${c.sharesInBasket}`);
        return {
          symbol,
          inavPerShare: null,
          basketMarketValue: null,
          cashComponent: cashComponentVnd,
          creationUnitShares,
          asOfTimestamp: asOfTimestamp ?? null,
          status: 'DATA_UNAVAILABLE',
          warnings,
        };
      }

      basketMarketValue += c.sharesInBasket * c.marketPrice;
    }

    const totalPortfolioValue = basketMarketValue + cashComponentVnd;
    if (totalPortfolioValue <= 0) {
      warnings.push('Total portfolio creation basket value is non-positive');
      return {
        symbol,
        inavPerShare: null,
        basketMarketValue: Math.round(basketMarketValue),
        cashComponent: cashComponentVnd,
        creationUnitShares,
        asOfTimestamp: asOfTimestamp ?? null,
        status: 'DATA_UNAVAILABLE',
        warnings,
      };
    }

    const rawInav = totalPortfolioValue / creationUnitShares;
    const inavPerShare = Math.round(rawInav * 100) / 100;

    return {
      symbol,
      inavPerShare,
      basketMarketValue: Math.round(basketMarketValue),
      cashComponent: cashComponentVnd,
      creationUnitShares,
      asOfTimestamp: asOfTimestamp ?? Date.now(),
      status: 'COMPUTED',
      warnings,
    };
  }

  /**
   * Computes Premium or Discount to NAV/iNAV.
   * Formulas:
   *   PremiumDiscountPoints = MarketPrice - ReferenceNav
   *   PremiumDiscountPercent = ((MarketPrice - ReferenceNav) / ReferenceNav) * 100
   *
   * Thresholds:
   *   PREMIUM: Percent > +0.20%
   *   DISCOUNT: Percent < -0.20%
   *   PAR: -0.20% <= Percent <= +0.20%
   */
  public static calculatePremiumDiscount(
    input: PremiumDiscountCalculationInput
  ): EtfPremiumDiscountResult {
    const {
      symbol,
      marketPrice,
      referenceNav,
      referenceNavType,
      asOfDate = new Date().toISOString().slice(0, 10),
      marketTimestamp,
      navTimestamp,
      maxTimestampDeltaMs = 300_000, // 5 minutes default
    } = input;

    const warnings: string[] = [];

    if (
      marketPrice === null ||
      marketPrice <= 0 ||
      !Number.isFinite(marketPrice) ||
      referenceNav === null ||
      referenceNav <= 0 ||
      !Number.isFinite(referenceNav)
    ) {
      if (!marketPrice || marketPrice <= 0) warnings.push('Market price is missing or invalid');
      if (!referenceNav || referenceNav <= 0) warnings.push('Reference NAV is missing or invalid');

      return {
        symbol,
        marketPrice,
        referenceNav,
        premiumDiscountPoints: null,
        premiumDiscountPercent: null,
        referenceNavType,
        regime: 'DATA_UNAVAILABLE',
        asOfDate,
        status: 'DATA_UNAVAILABLE',
        warnings,
      };
    }

    const points = Math.round((marketPrice - referenceNav) * 100) / 100;
    const percent = Math.round(((marketPrice - referenceNav) / referenceNav) * 10000) / 100;

    let regime: EtfPremiumDiscountRegime = 'PAR';
    if (percent > 0.2) {
      regime = 'PREMIUM';
    } else if (percent < -0.2) {
      regime = 'DISCOUNT';
    }

    let status: 'LIVE' | 'STALE' = 'LIVE';
    if (marketTimestamp && navTimestamp && referenceNavType === 'INTRADAY_INAV') {
      const delta = Math.abs(marketTimestamp - navTimestamp);
      if (delta > maxTimestampDeltaMs) {
        status = 'STALE';
        warnings.push(`Market price and iNAV timestamps diverge by ${Math.round(delta / 1000)}s`);
      }
    }

    return {
      symbol,
      marketPrice,
      referenceNav,
      premiumDiscountPoints: points,
      premiumDiscountPercent: percent,
      referenceNavType,
      regime,
      asOfDate,
      status,
      warnings,
    };
  }
}
