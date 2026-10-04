/**
 * DECISION-03 — RISK DECISION ENGINE
 * ===================================
 * Wraps (never duplicates) RiskGuard logic. Consumes the authoritative
 * RiskGuard result + portfolio/multi-asset context + configured policy.
 * Override hierarchy: SAFETY/HARD CONSTRAINT > POSITION SIZE > DECISION > SCORE.
 * AI can never override RiskGuard.
 */
import type { RiskDecision, RiskState } from './types.ts';

export interface RiskDecisionInput {
  readonly riskGuardStatus: 'VALID' | 'BLOCKED' | 'INVALID';
  readonly authorization: 'INVALID' | 'BLOCKED' | 'AUTHORIZED_FOR_PAPER_TRADING';
  readonly hardBreaches: readonly string[];
  readonly softWarnings: readonly string[];
  readonly riskPolicyVersion: string;
  readonly evaluatedAt: string;
  readonly portfolioFlags?: {
    readonly concentrationBreach?: boolean;
    readonly sectorBreach?: boolean;
    readonly leverageBreach?: boolean;
    readonly marginBreach?: boolean;
    readonly drawdownBreach?: boolean;
  };
  readonly missingRisk?: boolean;
}

export class RiskDecisionEngine {
  static evaluate(input: RiskDecisionInput): RiskDecision {
    if (input.missingRisk === true || input.riskGuardStatus === 'INVALID') {
      return {
        state: 'UNKNOWN',
        hardBreaches: [...input.hardBreaches],
        softWarnings: [...input.softWarnings, 'risk evaluation invalid or missing'],
        riskPolicyVersion: input.riskPolicyVersion,
        evaluatedAt: input.evaluatedAt,
      };
    }
    const flags = input.portfolioFlags ?? {};
    const derivedHard: string[] = [];
    if (flags.concentrationBreach === true) derivedHard.push('max position concentration breached');
    if (flags.sectorBreach === true) derivedHard.push('max sector exposure breached');
    if (flags.leverageBreach === true) derivedHard.push('leverage cap breached');
    if (flags.marginBreach === true) derivedHard.push('margin coverage breached');
    if (flags.drawdownBreach === true) derivedHard.push('max drawdown tolerance breached');

    const hard = [...input.hardBreaches, ...derivedHard];
    if (input.riskGuardStatus === 'BLOCKED' || input.authorization === 'BLOCKED' || hard.length > 0) {
      const state: RiskState = 'BLOCKED';
      return {
        state,
        hardBreaches: hard.length > 0 ? hard : ['RiskGuard blocked'],
        softWarnings: [...input.softWarnings],
        riskPolicyVersion: input.riskPolicyVersion,
        evaluatedAt: input.evaluatedAt,
      };
    }
    if (input.softWarnings.length > 0) {
      return {
        state: 'CAUTION',
        hardBreaches: [],
        softWarnings: [...input.softWarnings],
        riskPolicyVersion: input.riskPolicyVersion,
        evaluatedAt: input.evaluatedAt,
      };
    }
    if (input.authorization !== 'AUTHORIZED_FOR_PAPER_TRADING') {
      return {
        state: 'HIGH_RISK',
        hardBreaches: [],
        softWarnings: ['not authorized for paper trading'],
        riskPolicyVersion: input.riskPolicyVersion,
        evaluatedAt: input.evaluatedAt,
      };
    }
    return {
      state: 'ACCEPTABLE',
      hardBreaches: [],
      softWarnings: [],
      riskPolicyVersion: input.riskPolicyVersion,
      evaluatedAt: input.evaluatedAt,
    };
  }
}
