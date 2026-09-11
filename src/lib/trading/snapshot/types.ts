/**
 * PHASE 18.3.2 — DETERMINISTIC MARKET SNAPSHOT TYPES
 * ===================================================
 * Canonical contracts for immutable, serializable, and content-addressed market snapshots.
 *
 * Core Principle:
 *   Given the same MarketSnapshot + same strategy/version/configuration,
 *   the downstream analytical/trading result must be 100% reproducible.
 *
 * Security Note:
 *   The snapshot hash is an integrity fingerprint for tamper-detection and
 *   content-addressing. It is NOT a cryptographic digital signature and does
 *   not by itself prove data authenticity against an adversarial provider.
 */

import type { MarketExchange } from '../../../types/stock.ts';

export interface SnapshotSource {
  /** Market data provider identity (e.g., 'VPS', 'KBS', 'VNDIRECT') */
  readonly provider: string;
  /** Ingestion feed type (e.g., 'REALTIME_STREAM', 'REST_SNAPSHOT', 'EOD') */
  readonly feed: string;
}

export interface SnapshotMarket {
  /** Vietnamese stock exchange */
  readonly exchange: MarketExchange;
  /** ISO Date string of trading day: YYYY-MM-DD */
  readonly tradingDate: string;
  /** Market trading session: e.g., 'ATO', 'CONTINUOUS', 'ATC', 'RUNOFF', 'CLOSED' */
  readonly session: string;
  /** Whether the market was open at snapshot time */
  readonly isOpen: boolean;
}

export interface SnapshotInstrument {
  /** Standard stock ticker symbol (e.g., 'HPG', 'FPT', 'VNM') */
  readonly symbol: string;
  /** Optional official company name */
  readonly name?: string | null;
}

export interface SnapshotQuote {
  /** Last matched / execution price in VND */
  readonly last: number;
  /** Best active bid price (optional) */
  readonly bid?: number | null;
  /** Best active ask price (optional) */
  readonly ask?: number | null;
  /** Session opening price in VND */
  readonly open?: number | null;
  /** Session highest price in VND */
  readonly high?: number | null;
  /** Session lowest price in VND */
  readonly low?: number | null;
  /** Session closing price in VND */
  readonly close?: number | null;
  /** Exchange reference price in VND */
  readonly reference?: number | null;
  /** Daily upper ceiling price limit in VND */
  readonly ceiling?: number | null;
  /** Daily lower floor price limit in VND */
  readonly floor?: number | null;
  /** Cumulative session volume in shares */
  readonly volume?: number | null;
  /** Source market quote timestamp in ISO 8601 format */
  readonly timestamp: string;
}

export interface SnapshotFundamental {
  readonly pe?: number | null;
  readonly pb?: number | null;
  readonly eps?: number | null;
  readonly roe?: number | null;
  readonly roa?: number | null;
  readonly revenue?: number | null;
  readonly netIncome?: number | null;
  readonly freeCashFlow?: number | null;
  readonly debtToEquity?: number | null;
  /** Timestamp / period date when fundamental data was reported */
  readonly asOf: string;
}

export interface SnapshotValuation {
  readonly fairValue?: number | null;
  readonly dcfValue?: number | null;
  readonly marginOfSafety?: number | null;
  /** Timestamp when valuation models were evaluated */
  readonly asOf: string;
}

export interface SnapshotRecommendation {
  readonly recommendationId?: string | null;
  readonly strategyVersion?: string | null;
  readonly signal?: string | null;
  readonly horizon?: string | null;
  readonly confidence?: number | null;
}

export interface SnapshotIntegrity {
  /** Elapsed time between quote timestamp and snapshot capture in ms */
  readonly dataFreshnessMs: number;
  /** Overall validation status: VALID, WARNING, or INVALID */
  readonly validationStatus: 'VALID' | 'WARNING' | 'INVALID';
  /** Optional validation warnings encountered during creation */
  readonly warnings?: readonly string[];
}

export interface SnapshotVersions {
  /** Snapshot schema specification version (default: '1.0.0') */
  readonly snapshotSchemaVersion: string;
  /** Optional strategy engine version for replay reproducibility */
  readonly strategyVersion?: string | null;
  /** Optional risk guard policy version for replay reproducibility */
  readonly riskPolicyVersion?: string | null;
}

export interface MarketSnapshot {
  /** Deterministic content-addressed identifier (e.g., 'SNAP_<hash>') */
  readonly snapshotId: string;
  /** Timestamp when snapshot was captured in ISO 8601 format */
  readonly capturedAt: string;
  /** Originating data source */
  readonly source: SnapshotSource;
  /** Exchange and session facts */
  readonly market: SnapshotMarket;
  /** Equity instrument facts */
  readonly instrument: SnapshotInstrument;
  /** Market price and quote facts */
  readonly quote: SnapshotQuote;
  /** Fundamental financial facts (optional) */
  readonly fundamental?: SnapshotFundamental | null;
  /** Valuation facts (optional) */
  readonly valuation?: SnapshotValuation | null;
  /** Upstream recommendation / signal metadata (optional) */
  readonly recommendation?: SnapshotRecommendation | null;
  /** Data freshness and validation status */
  readonly integrity: SnapshotIntegrity;
  /** Versioning metadata */
  readonly versions: SnapshotVersions;
  /** SHA-256 fingerprint of the canonical payload */
  readonly hash: string;
}

/**
 * Raw input payload consumed by MarketSnapshotBuilder
 */
export interface MarketSnapshotInput {
  capturedAt?: string;
  source: SnapshotSource;
  market: SnapshotMarket;
  instrument: SnapshotInstrument;
  quote: SnapshotQuote;
  fundamental?: SnapshotFundamental | null;
  valuation?: SnapshotValuation | null;
  recommendation?: SnapshotRecommendation | null;
  integrity: SnapshotIntegrity;
  versions?: Partial<SnapshotVersions>;
}

export interface MarketSnapshotValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}
