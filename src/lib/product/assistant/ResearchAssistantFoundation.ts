export const RESEARCH_ASSISTANT_VERSION = '1.0.0';

export type ResearchAction = 'ANSWER' | 'ASK_CLARIFYING' | 'REFUSE';
export type ResearchQuestionKind = 'MARKET_OVERVIEW' | 'STOCK_ANALYSIS' | 'RISK_MANAGEMENT' | 'UNKNOWN';

export interface ResearchContext {
  asOf: string;
  concepts: Array<{ id: string; label: string; summary: string }>;
}

export function buildResearchContext(options: {
  asOf: string;
  concepts: Array<{ id: string; label: string; summary: string }>;
}): ResearchContext {
  return {
    asOf: options.asOf,
    concepts: options.concepts || [],
  };
}

export function classifyResearchQuestion(message: string): ResearchQuestionKind {
  const lower = (message || '').toLowerCase();
  if (lower.includes('thị trường') || lower.includes('vn-index') || lower.includes('market')) {
    return 'MARKET_OVERVIEW';
  }
  if (lower.includes('rủi ro') || lower.includes('stop loss') || lower.includes('cắt lỗ') || lower.includes('quản trị')) {
    return 'RISK_MANAGEMENT';
  }
  if (/[A-Z]{3}/i.test(lower) || lower.includes('cổ phiếu') || lower.includes('mã')) {
    return 'STOCK_ANALYSIS';
  }
  return 'UNKNOWN';
}

export function decideResearchAction(
  message: string,
  _context?: ResearchContext
): { action: ResearchAction; kind: ResearchQuestionKind; provenance: string } {
  const lower = (message || '').toLowerCase();
  const kind = classifyResearchQuestion(message);

  if (lower.includes('chắc chắn ăn') || lower.includes('bao lãi') || lower.includes('phím lệnh')) {
    return { action: 'REFUSE', kind, provenance: 'policy-guard' };
  }

  if (message.trim().length < 5) {
    return { action: 'ASK_CLARIFYING', kind, provenance: 'clarification-guard' };
  }

  return { action: 'ANSWER', kind, provenance: 'deterministic-engine' };
}

export class ResearchAssistantFoundation {
  static getSystemPrompt(): string {
    return 'You are an advanced quantitative equity research assistant for Vietnam Stock Exchange.';
  }
}
