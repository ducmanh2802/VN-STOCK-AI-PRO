/**
 * PHASE 18.3.2 — MARKET SNAPSHOT BUILDER
 * ========================================
 * Pure transformation layer that validates, normalizes, and constructs
 * immutable MarketSnapshot objects.
 *
 * Strict Rules:
 *   - Fail-closed: Rejects any invalid, inconsistent, or corrupt market data.
 *   - Never fetches live market data, never calls providers, never executes orders.
 *   - Pure, deterministic, and side-effect free.
 */

import type { MarketExchange } from '../../../types/stock.ts';
import type { TradingMarketData } from '../types/trading.ts';
import type {
  MarketSnapshot,
  MarketSnapshotInput,
  MarketSnapshotValidationResult,
  SnapshotSource,
  SnapshotMarket,
  SnapshotInstrument,
  SnapshotQuote,
  SnapshotFundamental,
  SnapshotValuation,
  SnapshotRecommendation,
  SnapshotIntegrity,
  SnapshotVersions,
} from './types.ts';
import { createMarketSnapshot, deepClone } from './MarketSnapshot.ts';

export class MarketSnapshotValidationError extends Error {
  public readonly errors: readonly string[];

  constructor(message: string, errors: string[]) {
    super(message);
    this.name = 'MarketSnapshotValidationError';
    this.errors = Object.freeze([...errors]);
  }
}

const VALID_EXCHANGES: readonly MarketExchange[] = ['HOSE', 'HNX', 'UPCOM'];
const DEFAULT_SCHEMA_VERSION = '1.0.0';

export class MarketSnapshotBuilder {
  private capturedAt?: string;
  private source?: SnapshotSource;
  private market?: SnapshotMarket;
  private instrument?: SnapshotInstrument;
  private quote?: SnapshotQuote;
  private fundamental?: SnapshotFundamental | null;
  private valuation?: SnapshotValuation | null;
  private recommendation?: SnapshotRecommendation | null;
  private integrity?: SnapshotIntegrity;
  private versions?: Partial<SnapshotVersions>;

  /**
   * Instantiates builder, optionally pre-populated from input.
   */
  constructor(initialInput?: MarketSnapshotInput) {
    if (initialInput) {
      this.fromInput(initialInput);
    }
  }

  public setCapturedAt(capturedAt: string): this {
    this.capturedAt = capturedAt;
    return this;
  }

  public setSource(source: SnapshotSource): this {
    this.source = deepClone(source);
    return this;
  }

  public setMarket(market: SnapshotMarket): this {
    this.market = deepClone(market);
    return this;
  }

  public setInstrument(instrument: SnapshotInstrument): this {
    this.instrument = deepClone(instrument);
    return this;
  }

  public setQuote(quote: SnapshotQuote): this {
    this.quote = deepClone(quote);
    return this;
  }

  public setFundamental(fundamental?: SnapshotFundamental | null): this {
    this.fundamental = fundamental ? deepClone(fundamental) : fundamental;
    return this;
  }

  public setValuation(valuation?: SnapshotValuation | null): this {
    this.valuation = valuation ? deepClone(valuation) : valuation;
    return this;
  }

  public setRecommendation(recommendation?: SnapshotRecommendation | null): this {
    this.recommendation = recommendation ? deepClone(recommendation) : recommendation;
    return this;
  }

  public setIntegrity(integrity: SnapshotIntegrity): this {
    this.integrity = deepClone(integrity);
    return this;
  }

  public setVersions(versions?: Partial<SnapshotVersions>): this {
    this.versions = versions ? deepClone(versions) : versions;
    return this;
  }

  /**
   * Loads full input into builder with deep cloning.
   */
  public fromInput(input: MarketSnapshotInput): this {
    if (!input || typeof input !== 'object') {
      return this;
    }
    this.capturedAt = input.capturedAt;
    this.source = input.source ? deepClone(input.source) : undefined;
    this.market = input.market ? deepClone(input.market) : undefined;
    this.instrument = input.instrument ? deepClone(input.instrument) : undefined;
    this.quote = input.quote ? deepClone(input.quote) : undefined;
    this.fundamental = input.fundamental ? deepClone(input.fundamental) : input.fundamental;
    this.valuation = input.valuation ? deepClone(input.valuation) : input.valuation;
    this.recommendation = input.recommendation ? deepClone(input.recommendation) : input.recommendation;
    this.integrity = input.integrity ? deepClone(input.integrity) : undefined;
    this.versions = input.versions ? deepClone(input.versions) : undefined;
    return this;
  }

  /**
   * Adapts canonical TradingMarketData into the builder.
   */
  public fromTradingMarketData(
    data: TradingMarketData,
    context: {
      exchange: MarketExchange;
      provider?: string;
      feed?: string;
      session?: string;
      isOpen?: boolean;
      capturedAt?: string;
      strategyVersion?: string;
      riskPolicyVersion?: string;
      dataFreshnessMs?: number;
      validationStatus?: 'VALID' | 'WARNING' | 'INVALID';
      companyName?: string;
    }
  ): this {
    const timestampStr = typeof data.timestamp === 'number'
      ? new Date(data.timestamp).toISOString()
      : (typeof data.timestamp === 'string' ? data.timestamp : new Date().toISOString());

    const capturedAtStr = context.capturedAt || timestampStr;
    const quoteTime = new Date(timestampStr).getTime();
    const capturedTime = new Date(capturedAtStr).getTime();
    const computedFreshness = context.dataFreshnessMs ?? Math.max(0, capturedTime - quoteTime);

    this.capturedAt = capturedAtStr;
    this.source = {
      provider: context.provider || data.dataSource || 'VPS',
      feed: context.feed || 'REALTIME_STREAM',
    };
    this.market = {
      exchange: context.exchange,
      tradingDate: capturedAtStr.slice(0, 10),
      session: context.session || 'CONTINUOUS',
      isOpen: context.isOpen ?? true,
    };
    this.instrument = {
      symbol: data.symbol.toUpperCase().trim(),
      name: context.companyName || null,
    };
    this.quote = {
      last: data.price,
      open: data.open ?? null,
      high: data.high ?? null,
      low: data.low ?? null,
      close: data.close ?? null,
      reference: data.referencePrice ?? null,
      ceiling: data.ceilingPrice ?? null,
      floor: data.floorPrice ?? null,
      volume: data.volume ?? null,
      timestamp: timestampStr,
    };
    this.integrity = {
      dataFreshnessMs: computedFreshness,
      validationStatus: context.validationStatus || 'VALID',
    };
    this.versions = {
      snapshotSchemaVersion: DEFAULT_SCHEMA_VERSION,
      strategyVersion: context.strategyVersion || null,
      riskPolicyVersion: context.riskPolicyVersion || null,
    };

    return this;
  }

  /**
   * Validates all snapshot data fail-closed.
   */
  public validate(): MarketSnapshotValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. CapturedAt timestamp
    if (!this.capturedAt || typeof this.capturedAt !== 'string') {
      errors.push('capturedAt is required and must be an ISO 8601 string');
    } else {
      const capturedTime = Date.parse(this.capturedAt);
      if (Number.isNaN(capturedTime)) {
        errors.push(`capturedAt '${this.capturedAt}' is not a valid ISO timestamp`);
      }
    }

    // 2. Source Provenance
    if (!this.source || typeof this.source !== 'object') {
      errors.push('source metadata is required');
    } else {
      if (!this.source.provider || typeof this.source.provider !== 'string' || this.source.provider.trim() === '') {
        errors.push('source.provider must be a non-empty string');
      }
      if (!this.source.feed || typeof this.source.feed !== 'string' || this.source.feed.trim() === '') {
        errors.push('source.feed must be a non-empty string');
      }
    }

    // 3. Market Context
    if (!this.market || typeof this.market !== 'object') {
      errors.push('market metadata is required');
    } else {
      if (!VALID_EXCHANGES.includes(this.market.exchange)) {
        errors.push(`Invalid market exchange: '${this.market.exchange}'. Allowed: ${VALID_EXCHANGES.join(', ')}`);
      }
      if (!this.market.tradingDate || !/^\d{4}-\d{2}-\d{2}$/.test(this.market.tradingDate)) {
        errors.push(`market.tradingDate must be YYYY-MM-DD format, received: '${this.market.tradingDate}'`);
      }
      if (typeof this.market.session !== 'string' || this.market.session.trim() === '') {
        errors.push('market.session must be a non-empty string');
      }
      if (typeof this.market.isOpen !== 'boolean') {
        errors.push('market.isOpen must be a boolean');
      }
    }

    // 4. Instrument
    if (!this.instrument || typeof this.instrument !== 'object') {
      errors.push('instrument metadata is required');
    } else {
      const sym = this.instrument.symbol;
      if (!sym || typeof sym !== 'string' || sym.trim() === '') {
        errors.push('instrument.symbol is required and must be non-empty');
      } else if (sym.length < 3 || sym.length > 5 || !/^[A-Z0-9]+$/i.test(sym)) {
        errors.push(`instrument.symbol '${sym}' is not a valid stock ticker symbol`);
      }
    }

    // 5. Quote Validation
    if (!this.quote || typeof this.quote !== 'object') {
      errors.push('quote data is required');
    } else {
      const q = this.quote;

      // Timestamp
      if (!q.timestamp || typeof q.timestamp !== 'string') {
        errors.push('quote.timestamp is required and must be an ISO 8601 string');
      } else {
        const qTime = Date.parse(q.timestamp);
        if (Number.isNaN(qTime)) {
          errors.push(`quote.timestamp '${q.timestamp}' is not a valid timestamp`);
        }
      }

      // Last Price
      if (typeof q.last !== 'number' || !Number.isFinite(q.last) || q.last <= 0) {
        errors.push(`quote.last price must be a positive finite number, received: ${q.last}`);
      }

      // Bid / Ask
      if (q.bid != null) {
        if (typeof q.bid !== 'number' || !Number.isFinite(q.bid) || q.bid < 0) {
          errors.push(`quote.bid must be a non-negative finite number, received: ${q.bid}`);
        }
      }
      if (q.ask != null) {
        if (typeof q.ask !== 'number' || !Number.isFinite(q.ask) || q.ask < 0) {
          errors.push(`quote.ask must be a non-negative finite number, received: ${q.ask}`);
        }
      }
      if (q.bid != null && q.ask != null && Number.isFinite(q.bid) && Number.isFinite(q.ask)) {
        if (q.ask < q.bid) {
          errors.push(`Crossed market violation: quote.ask (${q.ask}) cannot be strictly lower than quote.bid (${q.bid})`);
        }
      }

      // High / Low
      if (q.high != null && (!Number.isFinite(q.high) || q.high <= 0)) {
        errors.push(`quote.high must be a positive finite number, received: ${q.high}`);
      }
      if (q.low != null && (!Number.isFinite(q.low) || q.low <= 0)) {
        errors.push(`quote.low must be a positive finite number, received: ${q.low}`);
      }
      if (q.high != null && q.low != null && Number.isFinite(q.high) && Number.isFinite(q.low)) {
        if (q.high < q.low) {
          errors.push(`Invalid OHLC bounds: quote.high (${q.high}) cannot be lower than quote.low (${q.low})`);
        }
      }

      // Open / High / Low / Close consistency
      if (q.open != null && Number.isFinite(q.open)) {
        if (q.high != null && Number.isFinite(q.high) && q.open > q.high) {
          errors.push(`quote.open (${q.open}) cannot exceed quote.high (${q.high})`);
        }
        if (q.low != null && Number.isFinite(q.low) && q.open < q.low) {
          errors.push(`quote.open (${q.open}) cannot be lower than quote.low (${q.low})`);
        }
      }
      if (q.close != null && Number.isFinite(q.close)) {
        if (q.high != null && Number.isFinite(q.high) && q.close > q.high) {
          errors.push(`quote.close (${q.close}) cannot exceed quote.high (${q.high})`);
        }
        if (q.low != null && Number.isFinite(q.low) && q.close < q.low) {
          errors.push(`quote.close (${q.close}) cannot be lower than quote.low (${q.low})`);
        }
      }

      // Ceiling / Floor Limits
      if (q.ceiling != null && (!Number.isFinite(q.ceiling) || q.ceiling <= 0)) {
        errors.push(`quote.ceiling must be a positive finite number, received: ${q.ceiling}`);
      }
      if (q.floor != null && (!Number.isFinite(q.floor) || q.floor <= 0)) {
        errors.push(`quote.floor must be a positive finite number, received: ${q.floor}`);
      }
      if (q.ceiling != null && q.floor != null && Number.isFinite(q.ceiling) && Number.isFinite(q.floor)) {
        if (q.ceiling < q.floor) {
          errors.push(`quote.ceiling (${q.ceiling}) cannot be lower than quote.floor (${q.floor})`);
        }
      }
      if (q.ceiling != null && Number.isFinite(q.ceiling) && Number.isFinite(q.last) && q.last > q.ceiling) {
        errors.push(`quote.last (${q.last}) violates exchange ceiling limit (${q.ceiling})`);
      }
      if (q.floor != null && Number.isFinite(q.floor) && Number.isFinite(q.last) && q.last < q.floor) {
        errors.push(`quote.last (${q.last}) violates exchange floor limit (${q.floor})`);
      }

      // Volume
      if (q.volume != null) {
        if (!Number.isFinite(q.volume) || q.volume < 0) {
          errors.push(`quote.volume must be a non-negative finite number, received: ${q.volume}`);
        }
      }
    }

    // 6. Integrity
    if (!this.integrity || typeof this.integrity !== 'object') {
      errors.push('integrity metadata is required');
    } else {
      if (typeof this.integrity.dataFreshnessMs !== 'number' || !Number.isFinite(this.integrity.dataFreshnessMs) || this.integrity.dataFreshnessMs < 0) {
        errors.push(`integrity.dataFreshnessMs must be a non-negative finite number, received: ${this.integrity.dataFreshnessMs}`);
      }
      if (!['VALID', 'WARNING', 'INVALID'].includes(this.integrity.validationStatus)) {
        errors.push(`integrity.validationStatus must be 'VALID' | 'WARNING' | 'INVALID', received: '${this.integrity.validationStatus}'`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Builds the immutable MarketSnapshot fail-closed.
   */
  public build(): MarketSnapshot {
    // Default capturedAt if not explicitly set
    if (!this.capturedAt) {
      this.capturedAt = this.quote?.timestamp || new Date().toISOString();
    }

    const validation = this.validate();
    if (!validation.isValid) {
      throw new MarketSnapshotValidationError(
        `MarketSnapshot validation failed with ${validation.errors.length} error(s):\n  - ${validation.errors.join('\n  - ')}`,
        validation.errors
      );
    }

    const versions: SnapshotVersions = {
      snapshotSchemaVersion: this.versions?.snapshotSchemaVersion || DEFAULT_SCHEMA_VERSION,
      strategyVersion: this.versions?.strategyVersion || null,
      riskPolicyVersion: this.versions?.riskPolicyVersion || null,
    };

    return createMarketSnapshot({
      capturedAt: this.capturedAt!,
      source: this.source!,
      market: this.market!,
      instrument: {
        symbol: this.instrument!.symbol.toUpperCase().trim(),
        name: this.instrument!.name || null,
      },
      quote: this.quote!,
      fundamental: this.fundamental || null,
      valuation: this.valuation || null,
      recommendation: this.recommendation || null,
      integrity: this.integrity!,
      versions,
    });
  }

  /**
   * Static convenience factory to validate an input payload.
   */
  public static validateInput(input: MarketSnapshotInput): MarketSnapshotValidationResult {
    return new MarketSnapshotBuilder(input).validate();
  }

  /**
   * Static convenience factory to build directly from an input payload.
   */
  public static buildFrom(input: MarketSnapshotInput): MarketSnapshot {
    return new MarketSnapshotBuilder(input).build();
  }
}
