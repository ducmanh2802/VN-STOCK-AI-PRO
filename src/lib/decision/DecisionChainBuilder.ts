/**
 * DECISION-01 — INVESTMENT DECISION CHAIN
 * ========================================
 * Canonical pipeline:
 * REAL DATA → VALIDATION → MACRO → INDUSTRY → FUNDAMENTALS → VALUATION →
 * STRATEGY → PORTFOLIO → RISK → POSITION SIZE → DECISION → (PAPER) → MONITOR → REVIEW.
 *
 * Pure + deterministic. createdAt injected by caller (no clock read here).
 * HOLD/FLAT preservation: a strategy HOLD/FLAT signal can never be upgraded
 * to BUY/ADD/SELL by the chain — at most WATCH/HOLD/AVOID.
 */

import type {
  DecisionFailCode,
  DecisionObject,
  DecisionProvenance,
  DecisionStatus,
  DecisionType,
  EvidenceRef,
} from './types.ts';
import { DECISION_OS_VERSION } from './types.ts';

export interface ChainStageInput {
  readonly evidence: EvidenceRef | null;
  readonly unavailableCode?: DecisionFailCode;
  readonly blocker?: string;
}

export interface DecisionChainInput {
  readonly decisionId: string;
  readonly instrumentId: string;
  readonly asOfDate: string;
  readonly createdAt: string;
  readonly strategyDirection: 'LONG' | 'SHORT' | 'FLAT' | 'HOLD' | 'CLOSE' | 'REBALANCE';
  readonly proposedType: DecisionType;
  readonly confidence?: number | null;
  readonly data: ChainStageInput;
  readonly validation: ChainStageInput;
  readonly macro: ChainStageInput;
  readonly industry: ChainStageInput;
  readonly fundamentals: ChainStageInput;
  readonly valuation: ChainStageInput;
  readonly strategy: ChainStageInput;
  readonly portfolio: ChainStageInput;
  readonly risk: ChainStageInput;
  readonly sizing: ChainStageInput;
  readonly provenance: DecisionProvenance;
}

const HOLD_SIGNALS = new Set(['FLAT', 'HOLD']);
const UPGRADE_TYPES = new Set<DecisionType>(['BUY', 'ADD', 'SELL', 'REDUCE', 'EXIT']);

function isCriticalMissing(stage: ChainStageInput): boolean {
  return stage.evidence === null;
}

export class DecisionChainBuilder {
  static build(input: DecisionChainInput): DecisionObject {
    const notes: string[] = [];
    const constraints: string[] = [];
    const evidence: EvidenceRef[] = [];

    const stages: ReadonlyArray<{ readonly name: string; readonly s: ChainStageInput; readonly critical: boolean }> = [
      { name: 'data', s: input.data, critical: true },
      { name: 'validation', s: input.validation, critical: true },
      { name: 'macro', s: input.macro, critical: false },
      { name: 'industry', s: input.industry, critical: false },
      { name: 'fundamentals', s: input.fundamentals, critical: false },
      { name: 'valuation', s: input.valuation, critical: false },
      { name: 'strategy', s: input.strategy, critical: true },
      { name: 'portfolio', s: input.portfolio, critical: false },
      { name: 'risk', s: input.risk, critical: true },
      { name: 'sizing', s: input.sizing, critical: false },
    ];

    let failCode: DecisionFailCode | null = null;
    let status: DecisionStatus = 'ELIGIBLE';
    const blockers: string[] = [];

    for (const st of stages) {
      if (st.s.evidence) evidence.push(st.s.evidence);
      if (st.s.blocker) {
        blockers.push(`${st.name}: ${st.s.blocker}`);
        constraints.push(st.s.blocker);
      }
      if (st.s.evidence === null && st.critical) {
        if (failCode === null) {
          failCode =
            st.s.unavailableCode ??
            (st.name === 'risk'
              ? 'RISK_UNAVAILABLE'
              : st.name === 'valuation'
                ? 'VALUATION_UNAVAILABLE'
                : st.name === 'portfolio'
                  ? 'PORTFOLIO_CONTEXT_UNAVAILABLE'
                  : 'DATA_UNAVAILABLE');
        }
        notes.push(`${st.name} critical evidence missing`);
      } else if (st.s.evidence === null) {
        notes.push(`${st.name} context unavailable (non-critical)`);
      }
    }

    if (blockers.length > 0) status = 'BLOCKED';
    else if (failCode !== null) status = 'BLOCKED';

    let decisionType = input.proposedType;
    if (HOLD_SIGNALS.has(input.strategyDirection) && UPGRADE_TYPES.has(input.proposedType)) {
      decisionType = input.strategyDirection === 'FLAT' ? 'AVOID' : 'HOLD';
      notes.push(`HOLD/FLAT preserved: strategy ${input.strategyDirection} cannot become ${input.proposedType}`);
    }

    if (status !== 'BLOCKED' && failCode === null && isCriticalMissing(input.risk)) {
      failCode = 'RISK_UNAVAILABLE';
      status = 'BLOCKED';
    }

    const dataQuality = failCode !== null ? 'INVALID' : blockers.length > 0 ? 'WARNING' : 'VALID';

    return {
      decisionId: input.decisionId,
      instrumentId: input.instrumentId,
      asOfDate: input.asOfDate,
      decisionType,
      decisionStatus: status,
      evidence,
      thesisId: null,
      valuation: input.valuation.evidence,
      strategy: input.strategy.evidence,
      portfolioContext: input.portfolio.evidence,
      riskContext: input.risk.evidence,
      positionSizing: input.sizing.evidence,
      constraints,
      confidence: input.confidence ?? null,
      dataQuality,
      provenance: input.provenance,
      createdAt: input.createdAt,
      version: DECISION_OS_VERSION,
      failCode,
      notes,
    };
  }
}
