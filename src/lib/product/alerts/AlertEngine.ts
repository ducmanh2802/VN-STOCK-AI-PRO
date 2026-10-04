/**
 * PRODUCT-05 — ALERT & MONITORING FOUNDATION (pure + deterministic)
 * ==============================================================
 * Turns certified monitoring signals into user-facing alerts.
 *
 * Reuse, not duplication: trigger DETECTION stays in the Decision OS
 * (`MonitoringEngine.detect` / `falseTriggerGuard`). This module only:
 *  - binds user-authored alert RULES (price levels, percentage moves) to an instrument
 *  - evaluates those rules against a SUPPLIED observation (no polling, no network,
 *    no fabricated quotes — the caller provides the price, always stamped with its asOf)
 *  - maps Decision OS monitor triggers → alerts with explicit severity
 *  - enforces the false-trigger guard: `DATA_INVALID` suppresses downstream alerts
 *    unless the rule is explicitly data-independent
 *
 * Every alert is an ASSERTION ABOUT AN OBSERVATION, never a prediction.
 */
import { MonitoringEngine, type MonitoredState } from '../../decision/MonitoringEngine.ts';

/** Derived from the certified engine's return type — the Decision OS lane is never modified. */
type MonitorTrigger = ReturnType<typeof MonitoringEngine.detect>[number];

export const ALERT_VERSION = 'v1.0.0-product-alerts';

export type AlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export type AlertRuleKind =
  | 'PRICE_ABOVE'
  | 'PRICE_BELOW'
  | 'PRICE_CHANGE_PCT'
  | 'DECISION_TRIGGER';

export interface AlertRule {
  readonly id: string;
  readonly instrumentId: string;
  readonly kind: AlertRuleKind;
  /** Threshold for price rules (absolute price or percent fraction). Null for DECISION_TRIGGER. */
  readonly threshold: number | null;
  readonly severity: AlertSeverity;
  /** Whether the rule still fires when the underlying data is flagged invalid. */
  readonly dataIndependent: boolean;
  readonly enabled: boolean;
  readonly createdAt: string;
}

export interface Observation {
  readonly instrumentId: string;
  readonly price: number | null;
  readonly previousPrice: number | null;
  readonly asOf: string;
  readonly dataValid: boolean;
}

export interface Alert {
  readonly id: string;
  readonly ruleId: string;
  readonly instrumentId: string;
  readonly severity: AlertSeverity;
  readonly message: string;
  readonly observationAsOf: string;
  readonly suppressed: boolean;
  readonly suppressionReason: string | null;
}

const TRIGGER_SEVERITY: Readonly<Record<MonitorTrigger, AlertSeverity>> = {
  THESIS_INVALIDATED: 'CRITICAL',
  RISK_LIMIT_BREACHED: 'CRITICAL',
  STOP_TRIGGERED: 'CRITICAL',
  TARGET_REACHED: 'INFO',
  VALUATION_CHANGED: 'WARNING',
  FUNDAMENTAL_CHANGED: 'WARNING',
  MACRO_CHANGED: 'WARNING',
  INDUSTRY_CHANGED: 'WARNING',
  DATA_INVALID: 'WARNING',
  POSITION_CHANGED: 'INFO',
};

export class AlertEngine {
  static createRule(input: Omit<AlertRule, 'enabled'> & { enabled?: boolean }): AlertRule {
    if (!input.id.trim()) throw new Error('ALERT_RULE_ID_REQUIRED');
    const instrumentId = input.instrumentId.trim().toUpperCase();
    if (!instrumentId) throw new Error('ALERT_INSTRUMENT_REQUIRED');
    if (input.kind !== 'DECISION_TRIGGER') {
      if (input.threshold === null || !Number.isFinite(input.threshold)) throw new Error('ALERT_THRESHOLD_REQUIRED');
      if (input.kind === 'PRICE_ABOVE' || input.kind === 'PRICE_BELOW') {
        if (input.threshold <= 0) throw new Error('ALERT_THRESHOLD_MUST_BE_POSITIVE');
      }
      if (input.kind === 'PRICE_CHANGE_PCT' && input.threshold === 0) throw new Error('ALERT_THRESHOLD_MUST_BE_POSITIVE');
    }
    return { ...input, instrumentId, enabled: input.enabled ?? true };
  }

  static evaluateRules(rules: readonly AlertRule[], obs: Observation): readonly Alert[] {
    const out: Alert[] = [];
    for (const rule of rules) {
      if (!rule.enabled) continue;
      if (rule.instrumentId !== obs.instrumentId.trim().toUpperCase()) continue;

      // Unavailable price is NOT a breach: no alert, no imputation.
      const priceUsable = obs.price !== null && Number.isFinite(obs.price) && obs.price > 0;
      if (rule.kind !== 'DECISION_TRIGGER' && !priceUsable) {
        out.push({
          id: `al-${rule.id}-unavailable`,
          ruleId: rule.id,
          instrumentId: rule.instrumentId,
          severity: 'INFO',
          message: `Observation unavailable for ${rule.instrumentId} at ${obs.asOf}; ${rule.kind} not evaluated.`,
          observationAsOf: obs.asOf,
          suppressed: false,
          suppressionReason: null,
        });
        continue;
      }

      let fired = false;
      let message = '';
      if (rule.kind === 'PRICE_ABOVE' && priceUsable) {
        fired = obs.price! > rule.threshold!;
        message = `${rule.instrumentId} ${obs.price} above ${rule.threshold} (as of ${obs.asOf}).`;
      } else if (rule.kind === 'PRICE_BELOW' && priceUsable) {
        fired = obs.price! < rule.threshold!;
        message = `${rule.instrumentId} ${obs.price} below ${rule.threshold} (as of ${obs.asOf}).`;
      } else if (rule.kind === 'PRICE_CHANGE_PCT' && priceUsable && obs.previousPrice !== null && obs.previousPrice > 0) {
        const move = obs.price! / obs.previousPrice - 1;
        fired = Math.abs(move) >= Math.abs(rule.threshold!);
        message = `${rule.instrumentId} moved ${(move * 100).toFixed(2)}% (threshold ±${(rule.threshold! * 100).toFixed(2)}%, as of ${obs.asOf}).`;
      } else if (rule.kind === 'PRICE_CHANGE_PCT') {
        out.push({
          id: `al-${rule.id}-noprev`,
          ruleId: rule.id,
          instrumentId: rule.instrumentId,
          severity: 'INFO',
          message: `Previous price unavailable for ${rule.instrumentId}; change rule not evaluated.`,
          observationAsOf: obs.asOf,
          suppressed: false,
          suppressionReason: null,
        });
        continue;
      }

      if (!fired) continue;
      const suppressed = !obs.dataValid && !rule.dataIndependent;
      out.push({
        id: `al-${rule.id}-${obs.asOf}`,
        ruleId: rule.id,
        instrumentId: rule.instrumentId,
        severity: rule.severity,
        message: suppressed ? `${message} [suppressed: data flagged invalid]` : message,
        observationAsOf: obs.asOf,
        suppressed,
        suppressionReason: suppressed ? 'DATA_INVALID' : null,
      });
    }
    return out;
  }

  /**
   * Maps Decision OS monitor triggers to alerts. Detection and the false-trigger
   * guard remain owned by the certified engine.
   */
  static fromTriggers(input: {
    readonly decisionId: string;
    readonly instrumentId: string;
    readonly state: MonitoredState;
    readonly asOf: string;
    readonly dataIndependent?: boolean;
  }): readonly Alert[] {
    const detected = MonitoringEngine.detect(input.state);
    const guarded = MonitoringEngine.falseTriggerGuard(detected, input.state.dataInvalid);
    const suppressed = new Set(detected.filter((t) => !guarded.includes(t)));
    return guarded
      .filter((t) => t !== 'DATA_INVALID')
      .map((t) => ({
        id: `al-${input.decisionId}-${t}`,
        ruleId: `trigger:${t}`,
        instrumentId: input.instrumentId.trim().toUpperCase(),
        severity: TRIGGER_SEVERITY[t],
        message: `${input.instrumentId}: ${t} (decision ${input.decisionId}, as of ${input.asOf}).`,
        observationAsOf: input.asOf,
        suppressed: false,
        suppressionReason: null,
      }))
      .concat(
        [...suppressed].map((t) => ({
          id: `al-${input.decisionId}-${t}`,
          ruleId: `trigger:${t}`,
          instrumentId: input.instrumentId.trim().toUpperCase(),
          severity: 'INFO' as AlertSeverity,
          message: `${input.instrumentId}: ${t} suppressed because data is flagged invalid.`,
          observationAsOf: input.asOf,
          suppressed: true,
          suppressionReason: 'DATA_INVALID',
        })),
      );
  }

  static criticalCount(alerts: readonly Alert[]): number {
    return alerts.filter((a) => a.severity === 'CRITICAL' && !a.suppressed).length;
  }
}