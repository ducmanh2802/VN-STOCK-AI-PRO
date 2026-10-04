/**
 * DECISION-05 — MONITORING & DECISION REVIEW
 * ============================================
 * A decision is not complete when made. Monitoring tracks decision/thesis/
 * risk/portfolio/market/fundamentals/macro/industry/valuation/strategy refs
 * against trigger conditions; reviews preserve history (never rewrite).
 */
import type { DecisionReview, DecisionType, EvidenceRef, MonitorTrigger } from './types.ts';

export interface MonitoredState {
  readonly decisionId: string;
  readonly thesisInvalidated: boolean;
  readonly riskLimitBreached: boolean;
  readonly targetReached: boolean;
  readonly stopTriggered: boolean;
  readonly valuationChanged: boolean;
  readonly fundamentalChanged: boolean;
  readonly macroChanged: boolean;
  readonly industryChanged: boolean;
  readonly dataInvalid: boolean;
  readonly positionChanged: boolean;
}

export class MonitoringEngine {
  static detect(state: MonitoredState): readonly MonitorTrigger[] {
    const out: MonitorTrigger[] = [];
    if (state.thesisInvalidated) out.push('THESIS_INVALIDATED');
    if (state.riskLimitBreached) out.push('RISK_LIMIT_BREACHED');
    if (state.targetReached) out.push('TARGET_REACHED');
    if (state.stopTriggered) out.push('STOP_TRIGGERED');
    if (state.valuationChanged) out.push('VALUATION_CHANGED');
    if (state.fundamentalChanged) out.push('FUNDAMENTAL_CHANGED');
    if (state.macroChanged) out.push('MACRO_CHANGED');
    if (state.industryChanged) out.push('INDUSTRY_CHANGED');
    if (state.dataInvalid) out.push('DATA_INVALID');
    if (state.positionChanged) out.push('POSITION_CHANGED');
    return out;
  }

  static falseTriggerGuard(triggers: readonly MonitorTrigger[], dataInvalid: boolean): readonly MonitorTrigger[] {
    if (dataInvalid) return triggers.filter((t) => t === 'DATA_INVALID');
    return triggers;
  }
}

export interface CreateReviewInput {
  readonly reviewId: string;
  readonly decisionId: string;
  readonly originalDecision: DecisionType;
  readonly originalEvidence: readonly EvidenceRef[];
  readonly actualOutcome: string | null;
  readonly whatChanged: readonly string[];
  readonly whatWasCorrect: readonly string[];
  readonly whatWasWrong: readonly string[];
  readonly lessons: readonly string[];
  readonly newDecision: DecisionType | null;
  readonly reviewedAt: string;
}

export class ReviewEngine {
  static create(input: CreateReviewInput): DecisionReview {
    if (!input.reviewId || !input.decisionId) throw new Error('REVIEW_IDENTITY_REQUIRED');
    return { ...input };
  }
}
