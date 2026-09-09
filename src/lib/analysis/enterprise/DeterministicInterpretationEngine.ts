/**
 * SECTION 17/57 — DETERMINISTIC ANALYST (LLM fallback)
 * When no LLM is available the system still produces a coherent, evidence-based
 * interpretation. Never displays "AI Analysis failed" while hiding valid results.
 */
import type { AIInterpretationResult, InvestmentThesisResult } from '../../../types/enterpriseIntelligence.ts';

export interface InterpretInput {
  symbol: string;
  enterpriseScore: number | null;
  classification: string | null;
  isProvisional: boolean;
  completeness: number;
  confidence: string | null;
  thesis: InvestmentThesisResult;
  roe: number | null;
  revenueGrowth: number | null;
  cashConversion: number | null;
  invalidations: string[];
  dataCompleteness: number;
}

export class DeterministicInterpretationEngine {
  static evaluate(i: InterpretInput): AIInterpretationResult {
    const summary = this.summary(i);
    return {
      summary,
      strengths: i.thesis.strengths,
      risks: i.thesis.risks,
      catalysts: i.thesis.catalysts,
      bullCase: i.thesis.bullCase,
      baseCase: i.thesis.baseCase,
      bearCase: i.thesis.bearCase,
      invalidationConditions: i.thesis.invalidationConditions,
      watchItems: i.thesis.watchItems,
      conclusion: i.thesis.conclusion as AIInterpretationResult['conclusion'],
      confidence: i.confidence as AIInterpretationResult['confidence'],
      generatedBy: 'deterministic-analyst',
      model: 'VN-STOCK-AI Enterprise Analyst (deterministic)',
      llmAvailable: false,
    };
  }

  static summary(i: InterpretInput): string {
    const parts: string[] = [`${i.symbol}: deterministic enterprise analysis.`];
    if (i.enterpriseScore !== null) {
      parts.push(`Enterprise Score ${i.enterpriseScore}/100 (${i.classification ?? 'n/a'})${i.isProvisional ? ' — PROVISIONAL' : ''}.`);
    } else {
      parts.push('Insufficient real data for a composite enterprise score.');
    }
    if (i.revenueGrowth !== null) parts.push(`Revenue growth ${f(i.revenueGrowth)}%.`);
    if (i.roe !== null) parts.push(`ROE ${f(i.roe)}%.`);
    if (i.cashConversion !== null) parts.push(`Cash conversion ${f(i.cashConversion)}x.`);
    parts.push(`Data completeness ${i.dataCompleteness}%.`);
    return parts.join(' ');
  }
}

function f(v: number): string {
  return String(Math.round(v * 10) / 10);
}