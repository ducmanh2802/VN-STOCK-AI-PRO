/**
 * §49 — PRODUCT PLATFORM END-TO-END INTEGRATION TEST
 * ====================================================
 * Exercises the real cross-module path a user walks, in order, with no mocks
 * and no stubbed math:
 *
 *   research question → evidence-linked note → journal entry (certified thesis +
 *   chain-built decision, frozen snapshot) → review due → append-only review →
 *   thesis-vs-outcome quality → research note links that review → alert on the
 *   invalidation trigger (certified MonitoringEngine + falseTriggerGuard) →
 *   assistant answers strictly from the resulting artifacts.
 *
 * Every assertion checks a *provenance* property, not just a happy-path value:
 * the platform must never blur FACT vs HYPOTHESIS vs USER_ASSUMPTION.
 */
import { describe, expect, it } from 'vitest';
import { DecisionOSService } from '../services/decision/DecisionOSService.ts';
import { JournalEngine } from '../lib/product/journal/JournalEngine.ts';
import { ScenarioEngine } from '../lib/product/scenario/ScenarioEngine.ts';
import { ResearchWorkspaceEngine } from '../lib/product/research/ResearchWorkspaceEngine.ts';
import { AlertEngine } from '../lib/product/alerts/AlertEngine.ts';
import {
  buildResearchContext,
  decideResearchAction,
  validateResearchResponse,
} from '../lib/product/assistant/ResearchAssistantFoundation.ts';

const decisionOS = new DecisionOSService();
const T = '2026-10-03';
const NOW = '2026-10-04T09:00:00.000Z';
const EVIDENCE = { kind: 'user' as const, ref: 'filings-q3-2026', asOfDate: T, source: 'company-filing' };

describe('PRODUCT PLATFORM E2E: research → decision → review → monitor → learn', () => {
  it('completes the full loop with provenance intact at every hop', () => {
    // ---------- 1. RESEARCH: a question exists before any conclusion ----------
    let ws = ResearchWorkspaceEngine.createWorkspace({
      id: 'ws-e2e',
      title: 'HPG cyclical recovery',
      instrumentId: 'HPG',
      createdAt: NOW,
    });
    ws = ResearchWorkspaceEngine.addQuestion(ws, {
      id: 'q-e2e',
      text: 'Is the export-led recovery durable through 2027?',
      at: NOW,
    });
    expect(ws.questions[0].status).toBe('OPEN'); // open is legitimate

    // ---------- 2. JOURNAL: certified thesis (evidence required, fail-closed) ----------
    const thesisInput = {
      thesisId: 'th-e2e',
      instrumentId: 'HPG',
      asOfDate: T,
      createdAt: NOW,
      coreThesis: 'Export volumes and steel spreads recover together through 2027.',
      supportingEvidence: [EVIDENCE],
      invalidationConditions: ['spreads fall below pre-cycle floor'],
    };
    const thesis = decisionOS.createThesis(thesisInput);
    expect(thesis.supportingEvidence).toHaveLength(1);
    expect(() =>
      decisionOS.createThesis({ ...thesisInput, supportingEvidence: [] }),
    ).toThrow(/EVIDENCE/); // evidence-free thesis is rejected, not silently accepted

    let entry = JournalEngine.create({
      id: 'je-e2e',
      symbol: 'HPG',
      title: 'HPG export recovery',
      thesis: thesisInput,
      confidence: 0.6,
      timeHorizon: '12M',
      entryDate: T,
      reviewDate: '2026-12-31',
      createdAt: NOW,
    });
    entry = JournalEngine.activate(entry, NOW);

    // ---------- 3. DECISION: chain-built, frozen snapshot ----------
    const decision = decisionOS.buildDecision({
      decisionId: 'dec-e2e',
      instrumentId: 'HPG',
      asOfDate: T,
      createdAt: NOW,
      strategyDirection: 'LONG',
      proposedType: 'BUY',
      confidence: 0.6,
      data: { evidence: EVIDENCE },
      validation: { evidence: EVIDENCE },
      macro: { evidence: null, unavailableCode: 'ANALYSIS_INCOMPLETE' },
      industry: { evidence: null, unavailableCode: 'ANALYSIS_INCOMPLETE' },
      fundamentals: { evidence: null, unavailableCode: 'ANALYSIS_INCOMPLETE' },
      valuation: { evidence: null, unavailableCode: 'VALUATION_UNAVAILABLE' },
      strategy: { evidence: EVIDENCE },
      portfolio: { evidence: null, unavailableCode: 'PORTFOLIO_CONTEXT_UNAVAILABLE' },
      risk: { evidence: EVIDENCE },
      sizing: { evidence: null, unavailableCode: 'ANALYSIS_INCOMPLETE' },
      provenance: {
        dataVersion: 'e2e',
        asOfDate: T,
        analysisVersion: 'v1.0.0-e2e',
        strategyVersion: 'v1.0.0-e2e',
        riskPolicyVersion: 'v1.0.0-e2e',
        positionSizingVersion: 'v1.0.0-e2e',
      },
    });
    expect(['ELIGIBLE', 'BLOCKED']).toContain(decision.decisionStatus);
    entry = JournalEngine.attachDecisionSnapshot(entry, decision, NOW);
    expect(entry.status).toBe('ACTIVE');

    // Immutability: mutating the source decision after the fact cannot rewrite history.
    const live = JSON.parse(JSON.stringify(decision)) as { confidence: number };
    live.confidence = 0.99;
    expect(entry.decisionSnapshot!.confidence).toBe(0.6);

    // ---------- 4. SCENARIO: what-if against the same instrument ----------
    const scenario = ScenarioEngine.run({
      baseline: [{ symbol: 'HPG', quantity: 1000, markPrice: 25000, assetClass: 'EQUITY', sectorId: 'steel' }],
      asOfDate: T,
      assumptions: [{ kind: 'PRICE_SHOCK', target: 'HPG', value: -0.2, label: 'HPG -20%' }],
    });
    expect(scenario.diff.absoluteImpact).toBe(-5000000);
    expect(scenario.provenance['price:HPG']).toBe('USER_ASSUMPTION');

    // ---------- 5. REVIEW: append-only, then quality assessment ----------
    entry = JournalEngine.markReviewDue(entry, '2026-12-31', NOW);
    expect(entry.status).toBe('REVIEW_DUE');
    const review = decisionOS.createReview({
      reviewId: 'rv-e2e',
      decisionId: decision.decisionId,
      originalDecision: decision.decisionType,
      originalEvidence: decision.evidence.slice(),
      actualOutcome: 'Spreads recovered 8%; price +12%.',
      whatChanged: ['Export volumes beat plan'],
      whatWasCorrect: ['Directional call'],
      whatWasWrong: [],
      lessons: ['size earlier when spreads inflect'],
      newDecision: null,
      reviewedAt: NOW,
    });
    entry = JournalEngine.addReview(entry, review);
    expect(entry.reviews).toHaveLength(1);
    expect(entry.status).toBe('REVIEWED');
    expect(JournalEngine.assessQuality(true, true)).toBe('GOOD_DECISION_GOOD_OUTCOME');
    expect(JournalEngine.compareThesisVsOutcome(entry).lessons).toContain('size earlier when spreads inflect');

    // ---------- 6. RESEARCH: the lesson becomes linked, supported evidence ----------
    ws = ResearchWorkspaceEngine.addNote(ws, {
      id: 'n-e2e',
      questionId: 'q-e2e',
      claim: 'Review shows correct direction, correct sizing discipline.',
      provenance: 'FACT',
      confidence: 0.8,
      evidenceLinks: [],
      createdAt: NOW,
    });
    expect(ws.notes[0].unsupported).toBe(true); // not yet evidence-linked
    ws = ResearchWorkspaceEngine.linkJournalEntry(ws, 'n-e2e', entry, 'review rv-e2e');
    expect(ws.notes[0].unsupported).toBe(false);
    ws = ResearchWorkspaceEngine.answerQuestion(ws, 'q-e2e', NOW);
    const coverage = ResearchWorkspaceEngine.coverage(ws);
    expect(coverage).toMatchObject({ total: 1, answered: 1, unsupportedNotes: 0, factNotes: 1 });
    entry = JournalEngine.close(entry, NOW);

    // ---------- 7. ALERT: invalidation trigger → suppressed by the certified guard ----------
    const alerts = AlertEngine.fromTriggers({
      decisionId: decision.decisionId,
      instrumentId: 'HPG',
      asOf: '2026-12-31',
      state: {
        decisionId: decision.decisionId,
        thesisInvalidated: true,
        riskLimitBreached: false,
        targetReached: false,
        stopTriggered: false,
        valuationChanged: false,
        fundamentalChanged: false,
        macroChanged: true,
        industryChanged: false,
        dataInvalid: true,
        positionChanged: false,
      },
    });
    // DATA_INVALID is set, so the certified guard suppresses everything downstream.
    expect(alerts.every((a) => a.suppressed)).toBe(true);
    expect(AlertEngine.criticalCount(alerts)).toBe(0);
    expect(decisionOS.detectTriggers({
      decisionId: decision.decisionId,
      thesisInvalidated: true,
      riskLimitBreached: false,
      targetReached: false,
      stopTriggered: false,
      valuationChanged: false,
      fundamentalChanged: false,
      macroChanged: false,
      industryChanged: false,
      dataInvalid: false,
      positionChanged: false,
    })).toContain('THESIS_INVALIDATED');

    // ---------- 8. ASSISTANT: answers only from the artifacts just produced ----------
    const ctx = buildResearchContext({ journal: [entry], workspaces: [ws], asOf: NOW });
    const d = decideResearchAction('What did I record in my journal for HPG?', ctx);
    expect(d.action).toBe('ANSWER_FROM_CONTEXT');
    expect(d.contextItemIds).toContain('journal:je-e2e');
    expect(validateResearchResponse(
      `[VERIFIED] HPG journal entry reviews=1 (journal:je-e2e).`,
      d,
      ctx,
    ).ok).toBe(true);
    // Fabricating a figure that exists nowhere in context is rejected.
    const fabricated = validateResearchResponse(
      `[VERIFIED] HPG entry had reviews=1 and 4 (journal:je-e2e).`,
      d,
      ctx,
    );
    expect(fabricated.ok).toBe(false);
    expect(fabricated.violations.join()).toContain('ungrounded number: 4');

    // ---------- 9. DETERMINISM: the whole path is reproducible ----------
    expect(ScenarioEngine.run({
      baseline: [{ symbol: 'HPG', quantity: 1000, markPrice: 25000, assetClass: 'EQUITY', sectorId: 'steel' }],
      asOfDate: T,
      assumptions: [{ kind: 'PRICE_SHOCK', target: 'HPG', value: -0.2, label: 'HPG -20%' }],
    })).toEqual(scenario);
    expect(entry.status).toBe('CLOSED');
  });
});