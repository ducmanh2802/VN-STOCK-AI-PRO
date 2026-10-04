/**
 * PHASE 29 — MULTI-ASSET POSITION ENGINE (pure, deterministic)
 * Asset-specific valuation. Never estimates margin/P&L, never substitutes NAV.
 */

import {
  FUTURES_MULTIPLIER_VND_PER_POINT,
  type MultiAssetPosition,
  type MultiAssetStatus,
  type ValuedPosition,
} from './types.ts';

function finite(n: unknown): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function normSym(s: string): string {
  return (s || '').trim().toUpperCase();
}

export class MultiAssetPositionEngine {
  static valueOne(pos: MultiAssetPosition, asOfDate: string): ValuedPosition {
    const symbol = normSym(pos.symbol);
    const warnings: string[] = [];
    if (!symbol) {
      return {
        symbol: '', assetClass: pos.assetClass, marketValue: null, absoluteExposure: null,
        status: 'INVALID', direction: 'N/A', marginRequired: null, unrealizedPnl: null, warnings: ['Blank symbol.'],
      };
    }
    if (!Number.isFinite(pos.quantity)) {
      return {
        symbol, assetClass: pos.assetClass, marketValue: null, absoluteExposure: null,
        status: 'INVALID', direction: 'N/A', marginRequired: null, unrealizedPnl: null, warnings: ['Non-finite quantity.'],
      };
    }

    if (pos.assetClass === 'CASH') {
      if (pos.quantity < 0) {
        return { symbol, assetClass: pos.assetClass, marketValue: null, absoluteExposure: null, status: 'INVALID', direction: 'N/A', marginRequired: null, unrealizedPnl: null, warnings: ['Negative cash balance.'] };
      }
      return { symbol, assetClass: pos.assetClass, marketValue: pos.quantity, absoluteExposure: pos.quantity, status: 'OK', direction: 'N/A', marginRequired: 0, unrealizedPnl: 0, warnings };
    }

    if (pos.assetClass === 'EQUITY' || pos.assetClass === 'ETF') {
      if (!Number.isInteger(pos.quantity) || pos.quantity < 0) {
        return { symbol, assetClass: pos.assetClass, marketValue: null, absoluteExposure: null, status: 'INVALID', direction: 'N/A', marginRequired: null, unrealizedPnl: null, warnings: [`${pos.assetClass} quantity must be a non-negative integer.`] };
      }
      const px = pos.markPrice === undefined ? null : finite(pos.markPrice);
      if (px === null || px < 0) {
        return { symbol, assetClass: pos.assetClass, marketValue: null, absoluteExposure: null, status: 'DATA_UNAVAILABLE', direction: 'N/A', marginRequired: null, unrealizedPnl: null, warnings: ['Mark price unavailable — value fail-closed.'] };
      }
      const mv = pos.quantity * px;
      return { symbol, assetClass: pos.assetClass, marketValue: mv, absoluteExposure: mv, status: 'OK', direction: 'N/A', marginRequired: null, unrealizedPnl: null, warnings };
    }

    // DERIVATIVE: signed contracts.
    if (!Number.isInteger(pos.quantity)) {
      return { symbol, assetClass: pos.assetClass, marketValue: null, absoluteExposure: null, status: 'INVALID', direction: 'N/A', marginRequired: null, unrealizedPnl: null, warnings: ['Derivative quantity must be integer contracts.'] };
    }
    if (pos.quantity === 0) {
      return { symbol, assetClass: pos.assetClass, marketValue: 0, absoluteExposure: 0, status: 'OK', direction: 'FLAT', marginRequired: 0, unrealizedPnl: 0, warnings };
    }
    // Futures expiry is required metadata (Phase 29 contract). Missing/blank
    // expiry must fail closed — never inferred, estimated, or defaulted.
    const expRaw = pos.expiryDate;
    const exp = typeof expRaw === 'string' ? expRaw.trim() : expRaw;
    if (exp === undefined || exp === null || exp === '') {
      return { symbol, assetClass: pos.assetClass, marketValue: null, absoluteExposure: null, status: 'INVALID', direction: 'N/A', marginRequired: null, unrealizedPnl: null, warnings: ['Futures expiryDate required — missing expiry fail-closed (never estimated).'] };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exp)) {
      return { symbol, assetClass: pos.assetClass, marketValue: null, absoluteExposure: null, status: 'INVALID', direction: 'N/A', marginRequired: null, unrealizedPnl: null, warnings: [`Invalid futures expiryDate '${exp}' — expected YYYY-MM-DD.`] };
    }
    if (exp <= asOfDate) {
      return { symbol, assetClass: pos.assetClass, marketValue: null, absoluteExposure: null, status: 'INVALID', direction: 'N/A', marginRequired: null, unrealizedPnl: null, warnings: [`Contract expired on ${exp} (asOf ${asOfDate}).`] };
    }
    const fpx = pos.markPrice === undefined ? null : finite(pos.markPrice);
    if (fpx === null || fpx <= 0) {
      return { symbol, assetClass: pos.assetClass, marketValue: null, absoluteExposure: null, status: 'DATA_UNAVAILABLE', direction: pos.quantity > 0 ? 'LONG' : 'SHORT', marginRequired: null, unrealizedPnl: null, warnings: ['Futures price unavailable — notional fail-closed.'] };
    }
    const margin = pos.marginPerContract === undefined || pos.marginPerContract === null ? null : finite(pos.marginPerContract);
    if (margin === null || margin < 0) {
      return { symbol, assetClass: pos.assetClass, marketValue: null, absoluteExposure: null, status: 'DATA_UNAVAILABLE', direction: pos.quantity > 0 ? 'LONG' : 'SHORT', marginRequired: null, unrealizedPnl: null, warnings: ['Margin per contract not supplied — derivatives require explicit margin.'] };
    }
    const pnl = pos.unrealizedPnl === undefined || pos.unrealizedPnl === null ? null : finite(pos.unrealizedPnl);
    if (pnl === null) {
      return { symbol, assetClass: pos.assetClass, marketValue: null, absoluteExposure: null, status: 'DATA_UNAVAILABLE', direction: pos.quantity > 0 ? 'LONG' : 'SHORT', marginRequired: null, unrealizedPnl: null, warnings: ['Unrealized P&L not supplied — never synthesized.'] };
    }
    const notional = pos.quantity * fpx * FUTURES_MULTIPLIER_VND_PER_POINT;
    const direction = pos.quantity > 0 ? 'LONG' : 'SHORT';
    return {
      symbol,
      assetClass: pos.assetClass,
      marketValue: notional,
      absoluteExposure: Math.abs(notional),
      status: 'OK' as MultiAssetStatus,
      direction,
      marginRequired: Math.abs(pos.quantity) * margin,
      unrealizedPnl: pnl,
      warnings,
    };
  }

  static valueAll(
    positions: readonly MultiAssetPosition[],
    asOfDate: string
  ): { valued: ValuedPosition[]; invalid: boolean } {
    const valued = positions.map((p) => MultiAssetPositionEngine.valueOne(p, asOfDate));
    return { valued, invalid: valued.some((v) => v.status === 'INVALID') };
  }
}
