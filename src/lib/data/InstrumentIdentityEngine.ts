/**
 * DATA-01 — INSTRUMENT IDENTITY ENGINE
 * =====================================
 * Stable instrument identity. Ticker symbol is NEVER the permanent identity.
 * Pure + deterministic: explicit inputs, no clock, no I/O, no global state.
 *
 * Handles: symbol changes, ticker reuse, delisting, listing, merger, rename,
 * exchange migration. Delisted instruments remain queryable (never auto-removed).
 */

import type {
  DataAssetClass,
  ExchangeCode,
  InstrumentIdentity,
  InstrumentStatus,
} from './types.ts';

export interface RegisterInstrumentInput {
  readonly instrumentId: string;
  readonly symbol: string;
  readonly exchange: ExchangeCode;
  readonly assetClass: DataAssetClass;
  readonly sector?: string | null;
  readonly industry?: string | null;
  readonly status?: InstrumentStatus;
  readonly validFrom: string;
  readonly validTo?: string | null;
  readonly isin?: string | null;
  readonly previousSymbols?: readonly string[];
}

export interface SymbolChangeInput {
  readonly instrumentId: string;
  readonly fromSymbol: string;
  readonly toSymbol: string;
  readonly effectiveDate: string;
}

const SYMBOL_RE = /^[A-Z0-9_.]{1,20}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normSymbol(s: string): string {
  return s.trim().toUpperCase();
}

export class InstrumentIdentityEngine {
  static register(input: RegisterInstrumentInput): InstrumentIdentity {
    if (!input.instrumentId || !input.instrumentId.trim()) {
      throw new Error('INVALID_INSTRUMENT_ID');
    }
    const symbol = normSymbol(input.symbol);
    if (!SYMBOL_RE.test(symbol)) throw new Error('INVALID_SYMBOL');
    if (!DATE_RE.test(input.validFrom)) throw new Error('INVALID_VALID_FROM');
    if (input.validTo !== undefined && input.validTo !== null && !DATE_RE.test(input.validTo)) {
      throw new Error('INVALID_VALID_TO');
    }
    if (input.validTo && input.validTo < input.validFrom) {
      throw new Error('INVALID_VALIDITY_RANGE');
    }
    return {
      instrumentId: input.instrumentId.trim(),
      symbol,
      exchange: input.exchange,
      assetClass: input.assetClass,
      currency: 'VND',
      country: 'VN',
      sector: input.sector ?? null,
      industry: input.industry ?? null,
      status: input.status ?? 'ACTIVE',
      validFrom: input.validFrom,
      validTo: input.validTo ?? null,
      isin: input.isin ?? null,
      previousSymbols: input.previousSymbols ? [...input.previousSymbols.map(normSymbol)] : [],
    };
  }

  static applySymbolChange(
    current: InstrumentIdentity,
    change: SymbolChangeInput
  ): InstrumentIdentity {
    if (change.instrumentId !== current.instrumentId) throw new Error('INSTRUMENT_MISMATCH');
    if (normSymbol(change.fromSymbol) !== current.symbol) throw new Error('FROM_SYMBOL_MISMATCH');
    const to = normSymbol(change.toSymbol);
    if (!SYMBOL_RE.test(to)) throw new Error('INVALID_SYMBOL');
    if (!DATE_RE.test(change.effectiveDate)) throw new Error('INVALID_EFFECTIVE_DATE');
    if (change.effectiveDate < current.validFrom) throw new Error('EFFECTIVE_BEFORE_VALID_FROM');
    return {
      ...current,
      symbol: to,
      validFrom: change.effectiveDate,
      previousSymbols: [...(current.previousSymbols ?? []), current.symbol],
    };
  }

  static isActiveAt(inst: InstrumentIdentity, asOf: string): boolean {
    if (asOf < inst.validFrom) return false;
    if (inst.validTo && asOf > inst.validTo) return false;
    return inst.status === 'ACTIVE';
  }

  static isQueryableAt(inst: InstrumentIdentity, asOf: string): boolean {
    if (asOf < inst.validFrom) return false;
    if (inst.validTo && asOf > inst.validTo) return false;
    return true;
  }

  static getInstrumentAsOf(
    versions: readonly InstrumentIdentity[],
    instrumentId: string,
    asOf: string
  ): InstrumentIdentity | null {
    const matches = versions
      .filter((v) => v.instrumentId === instrumentId && v.validFrom <= asOf && (!v.validTo || asOf <= v.validTo))
      .sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1));
    return matches[0] ?? null;
  }

  static getUniverseAsOf(
    versions: readonly InstrumentIdentity[],
    asOf: string,
    opts?: { readonly includeDelisted?: boolean }
  ): readonly InstrumentIdentity[] {
    const includeDelisted = opts?.includeDelisted ?? false;
    const latestByInstrument = new Map<string, InstrumentIdentity>();
    for (const v of versions) {
      if (v.validFrom > asOf) continue;
      if (v.validTo && asOf > v.validTo) continue;
      const prev = latestByInstrument.get(v.instrumentId);
      if (!prev || v.validFrom > prev.validFrom) latestByInstrument.set(v.instrumentId, v);
    }
    const all = [...latestByInstrument.values()].sort((a, b) =>
      a.symbol < b.symbol ? -1 : 1
    );
    if (includeDelisted) return all;
    return all.filter((v) => v.status === 'ACTIVE');
  }
}
