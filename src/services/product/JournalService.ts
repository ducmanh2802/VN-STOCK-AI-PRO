/**
 * PRODUCT-01 — JOURNAL SERVICE (application orchestration only)
 * ==============================================================
 * Thin composition of JournalEngine (product rules) + certified Decision OS
 * engines + JournalStore (persistence). No financial math lives here.
 */
import { JournalEngine, type CreateJournalEntryInput, type JournalEntry } from '../../lib/product/journal/JournalEngine.ts';
import { journalStore } from '../../lib/product/journal/JournalStore.ts';
import { DecisionChainBuilder } from '../../lib/decision/DecisionChainBuilder.ts';
import type { DecisionObject, DecisionType, EvidenceRef } from '../../lib/decision/types.ts';
import { DECISION_OS_VERSION } from '../../lib/decision/types.ts';
import type { CreateReviewInput } from '../../lib/decision/MonitoringEngine.ts';

export const JournalService = {
  list(): JournalEntry[] {
    return journalStore.list();
  },
  get(id: string): JournalEntry | null {
    return journalStore.get(id);
  },
  create(input: CreateJournalEntryInput): JournalEntry {
    const entry = JournalEngine.create(input);
    journalStore.save(entry);
    return entry;
  },
  activate(id: string, at: string): JournalEntry | null {
    const e = journalStore.get(id);
    if (!e) return null;
    const next = JournalEngine.activate(e, at);
    journalStore.save(next);
    return next;
  },
  attachSnapshot(id: string, decision: DecisionObject, at: string): JournalEntry | null {
    const e = journalStore.get(id);
    if (!e) return null;
    const next = JournalEngine.attachDecisionSnapshot(e, decision, at);
    journalStore.save(next);
    return next;
  },
  /**
   * Build a certified DecisionObject from caller-supplied evidence via the
   * DecisionChainBuilder (fail-closed chain logic applies) and snapshot it.
   * Non-critical stages default to unavailable — the chain, not the product
   * layer, decides ELIGIBLE vs BLOCKED.
   */
  buildAndAttachSnapshot(
    id: string,
    input: {
      readonly proposedType: DecisionType;
      readonly direction: 'LONG' | 'SHORT' | 'FLAT' | 'HOLD' | 'CLOSE' | 'REBALANCE';
      readonly evidence: EvidenceRef;
      readonly asOfDate: string;
      readonly at: string;
    },
  ): JournalEntry | null {
    const e = journalStore.get(id);
    if (!e) return null;
    const stage = { evidence: input.evidence };
    const missing = (code: 'VALUATION_UNAVAILABLE' | 'PORTFOLIO_CONTEXT_UNAVAILABLE' | 'ANALYSIS_INCOMPLETE') => ({
      evidence: null,
      unavailableCode: code,
    });
    const decision = DecisionChainBuilder.build({
      decisionId: `dec-${e.id}`,
      instrumentId: e.symbol,
      asOfDate: input.asOfDate,
      createdAt: input.at,
      strategyDirection: input.direction,
      proposedType: input.proposedType,
      confidence: e.confidence,
      data: stage,
      validation: stage,
      macro: missing('ANALYSIS_INCOMPLETE'),
      industry: missing('ANALYSIS_INCOMPLETE'),
      fundamentals: missing('ANALYSIS_INCOMPLETE'),
      valuation: missing('VALUATION_UNAVAILABLE'),
      strategy: stage,
      portfolio: missing('PORTFOLIO_CONTEXT_UNAVAILABLE'),
      risk: stage,
      sizing: missing('ANALYSIS_INCOMPLETE'),
      provenance: {
        dataVersion: 'user-evidence',
        asOfDate: input.asOfDate,
        analysisVersion: DECISION_OS_VERSION,
        strategyVersion: DECISION_OS_VERSION,
        riskPolicyVersion: DECISION_OS_VERSION,
        positionSizingVersion: DECISION_OS_VERSION,
      },
    });
    return JournalService.attachSnapshot(id, decision, input.at);
  },
  markReviewDue(id: string, reviewDate: string, at: string): JournalEntry | null {
    const e = journalStore.get(id);
    if (!e) return null;
    const next = JournalEngine.markReviewDue(e, reviewDate, at);
    journalStore.save(next);
    return next;
  },
  addReview(id: string, input: CreateReviewInput): JournalEntry | null {
    const e = journalStore.get(id);
    if (!e) return null;
    const next = JournalEngine.addReview(e, input);
    journalStore.save(next);
    return next;
  },
  close(id: string, at: string): JournalEntry | null {
    const e = journalStore.get(id);
    if (!e) return null;
    const next = JournalEngine.close(e, at);
    journalStore.save(next);
    return next;
  },
  remove(id: string): void {
    journalStore.remove(id);
  },
};
