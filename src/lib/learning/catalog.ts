// LEARNING HUB — static versioned catalog (MVP).
// Educational content only. All numeric examples are SIMULATED Illustrative figures,
// never real market data. No trading execution imports.

import type {
  Assessment,
  Concept,
  Exercise,
  KnowledgeDomain,
  LearningPath,
  Lesson,
  PracticeLab,
  Project,
  Topic,
} from './types';

export const CATALOG_VERSION = '1.0.0-mvp';

export const DOMAINS: KnowledgeDomain[] = [
  { id: 'dom-orientation', title: 'System Orientation', description: 'What VN-STOCK-AI-PRO is and how to use it safely.', level: 0 },
  { id: 'dom-market', title: 'Market Foundations', description: 'Stocks, price, volume, indexes, sectors, exchanges.', level: 1 },
  { id: 'dom-fundamental', title: 'Fundamental Analysis', description: 'Statements, earnings, growth, margins, TTM.', level: 2 },
  { id: 'dom-risk', title: 'Risk Management', description: 'Position sizing, diversification, fail-closed data risk.', level: 5 },
];

export const TOPICS: Topic[] = [
  { id: 'top-system', domainId: 'dom-orientation', title: 'Using the platform', description: 'Screener, detail, watchlist, paper trading, data health.' },
  { id: 'top-market-basics', domainId: 'dom-market', title: 'Market basics', description: 'Stocks, price, volume, liquidity.' },
  { id: 'top-index-sector', domainId: 'dom-market', title: 'Indexes & sectors', description: 'VN-Index, VN30, HOSE/HNX/UPCOM, sectors.' },
  { id: 'top-statements', domainId: 'dom-fundamental', title: 'Financial statements', description: 'Revenue, profit, EPS, margins, TTM.' },
  { id: 'top-risk', domainId: 'dom-risk', title: 'Risk & sizing', description: 'Position size, diversification, data risk.' },
];

export const CONCEPTS: Concept[] = [
  { id: 'c-stock', topicId: 'top-market-basics', title: 'Stock & market cap', summary: 'A share is fractional ownership; market cap = price x shares outstanding.', systemFeature: 'Screener' },
  { id: 'c-price-volume', topicId: 'top-market-basics', title: 'Price, volume, liquidity', summary: 'Price is the last match; volume shows participation; illiquidity widens risk.', systemFeature: 'Market overview' },
  { id: 'c-index-sector', topicId: 'top-index-sector', title: 'Indexes & sectors', summary: 'VN-Index/VN30 track breadth; sectors rotate with macro.', systemFeature: 'Market Map' },
  { id: 'c-statements', topicId: 'top-statements', title: 'Revenue, profit, EPS, margin', summary: 'Revenue - costs = profit; EPS = parent profit / shares; margin = part / revenue.', systemFeature: 'StockDetail fundamentals' },
  { id: 'c-ttm', topicId: 'top-statements', title: 'TTM', summary: 'Trailing twelve months sums the last 4 quarters; never mix Q1 with H1.', systemFeature: 'Earnings Intelligence' },
  { id: 'c-valuation', topicId: 'top-statements', title: 'P/E in one minute', summary: 'P/E = price / EPS; a MODEL OUTPUT, not a fact. Split FACT/ASSUMPTION/ESTIMATE.', systemFeature: 'Valuation' },
  { id: 'c-risk-size', topicId: 'top-risk', title: 'Position sizing', summary: 'Risk a fixed fraction of capital; respect 100-share lots and price bands.', systemFeature: 'RiskCenter + PositionSizer' },
  { id: 'c-diversification', topicId: 'top-risk', title: 'Diversification', summary: 'Correlated names fall together; check sector exposure and position size.', systemFeature: 'Portfolio + RiskCenter' },
  { id: 'c-data-risk', topicId: 'top-risk', title: 'Data risk & fail-closed', summary: 'Stale/invalid data must block decisions (UNAVAILABLE), never silently pass.', systemFeature: 'Data Health' },
  { id: 'c-workflow', topicId: 'top-system', title: 'Analysis workflow', summary: 'Screen -> inspect detail -> watchlist -> paper trade -> review risk.', systemFeature: 'Screener + Paper Trading' },
];

const SIM = 'SIMULATED' as const;
const EDU = 'EDUCATIONAL' as const;

export const LESSONS: Lesson[] = [
  {
    id: 'les-market-101',
    conceptIds: ['c-stock'],
    topicId: 'top-market-basics',
    title: 'What is a stock?',
    difficulty: 'Beginner',
    estimatedMinutes: 8,
    objectives: ['Define share, market cap', 'Find a stock in the Screener', 'Avoid confusing price with value'],
    sections: [
      { heading: 'Definition', body: 'A stock is fractional ownership of a listed company. Price is set by the last matched order on HOSE/HNX/UPCOM.' },
      { heading: 'Why it matters', body: 'Every later lesson (earnings, valuation, risk) builds on this: you own cash flows, not tickers.' },
      { heading: 'VN-STOCK-AI-PRO usage', body: 'Open Screener, search a symbol (e.g. HPG), open Quick View, then add it to your Watchlist.' },
      { heading: 'Common mistakes', body: 'High price does not mean expensive; low price does not mean cheap. Always scale by shares and earnings.' },
    ],
    examples: [{ title: 'Illustrative market cap', body: 'SIMULATED: price 25,000 VND x 6B shares = 150,000B VND market cap. Illustrative only.', dataBadge: SIM }],
    keyPoints: ['Share = ownership', 'Market cap = price x shares', 'Use Screener + Watchlist'],
    systemFeatureRefs: ['Screener', 'Watchlist'],
    dataBadge: EDU,
    status: 'PUBLISHED',
    version: CATALOG_VERSION,
  },
  {
    id: 'les-price-volume-102',
    conceptIds: ['c-price-volume', 'c-data-risk'],
    topicId: 'top-market-basics',
    title: 'Price, volume and liquidity',
    difficulty: 'Beginner',
    estimatedMinutes: 10,
    objectives: ['Read price/volume', 'Spot illiquidity risk', 'Check data freshness before trusting a number'],
    sections: [
      { heading: 'Definition', body: 'Volume counts matched shares. Thin volume means your order itself can move the price.' },
      { heading: 'Why it matters', body: 'RiskGuard and backtests assume you can trade at quoted prices; illiquidity breaks that assumption.' },
      { heading: 'VN-STOCK-AI-PRO usage', body: 'Market overview shows movers by volume; Data Health shows quote freshness (CURRENT/STALE/UNAVAILABLE).' },
      { heading: 'Common mistakes', body: 'Trusting a price without checking as-of time. A STALE quote must be treated as UNAVAILABLE for decisions.' },
    ],
    examples: [{ title: 'Stale quote drill', body: 'HISTORICAL-style drill: if Data Health says STALE, stop and refresh. Never average a stale price into a decision.', dataBadge: SIM }],
    keyPoints: ['Volume = participation', 'Illiquidity = hidden cost', 'STALE means stop'],
    systemFeatureRefs: ['Market overview', 'Data Health'],
    dataBadge: EDU,
    status: 'PUBLISHED',
    version: CATALOG_VERSION,
  },
  {
    id: 'les-index-sector-103',
    conceptIds: ['c-index-sector'],
    topicId: 'top-index-sector',
    title: 'VN-Index, VN30, sectors and exchanges',
    difficulty: 'Beginner',
    estimatedMinutes: 10,
    objectives: ['Distinguish HOSE/HNX/UPCOM bands', 'Read VN-Index vs VN30', 'Locate sector rotation on Market Map'],
    sections: [
      { heading: 'Definition', body: 'HOSE allows ±7%, HNX ±10%, UPCOM ±15% daily bands. VN30 tracks the 30 largest HOSE names.' },
      { heading: 'Why it matters', body: 'Bands cap single-day moves; sector exposure drives most portfolio variance.' },
      { heading: 'VN-STOCK-AI-PRO usage', body: 'Open Market Map: compare sector 1D return, breadth, and leaders vs VN-Index.' },
      { heading: 'Common mistakes', body: 'Comparing a bank to a steel stock without sector context.' },
    ],
    examples: [{ title: 'Breadth read', body: 'SIMULATED: 240 advancers vs 120 decliners with flat index = narrow leadership. Educational pattern only.', dataBadge: SIM }],
    keyPoints: ['Bands: 7/10/15', 'VN30 = large-cap lens', 'Sector first, stock second'],
    systemFeatureRefs: ['Market Map'],
    dataBadge: EDU,
    status: 'PUBLISHED',
    version: CATALOG_VERSION,
  },
  {
    id: 'les-statements-104',
    conceptIds: ['c-statements', 'c-ttm', 'c-valuation'],
    topicId: 'top-statements',
    title: 'Financial statements in 10 minutes',
    difficulty: 'Beginner',
    estimatedMinutes: 12,
    objectives: ['Read revenue/profit/EPS/margin', 'Compute TTM correctly', 'Split FACT vs MODEL OUTPUT for P/E'],
    sections: [
      { heading: 'Definition', body: 'Revenue - costs = profit. EPS uses parent-company profit / shares. Margin = part / revenue x 100.' },
      { heading: 'TTM', body: 'TTM = last 4 quarters. Never compare Q1 (3 months) with H1 (6 months). Restatements create versions; use the latest audited fact with lineage.' },
      { heading: 'VN-STOCK-AI-PRO usage', body: 'StockDetail fundamentals tab shows statements + TTM + lineage; Earnings Intelligence flags restatements.' },
      { heading: 'Valuation honesty', body: 'FACT: reported profit. ASSUMPTION: growth rate. ESTIMATE: future EPS. MODEL OUTPUT: fair value. Never teach output as fact.' },
    ],
    examples: [{ title: 'Margin math', body: 'SIMULATED: revenue 100, gross profit 25 -> margin 25%. P/E = price 20 / EPS 2 = 10x (MODEL OUTPUT if EPS is estimated).', dataBadge: SIM }],
    keyPoints: ['TTM = 4 quarters', 'Restatement = new version', 'P/E output is not a fact'],
    systemFeatureRefs: ['StockDetail fundamentals', 'Earnings Intelligence'],
    dataBadge: EDU,
    status: 'PUBLISHED',
    version: CATALOG_VERSION,
  },
  {
    id: 'les-risk-105',
    conceptIds: ['c-risk-size', 'c-diversification', 'c-data-risk'],
    topicId: 'top-risk',
    title: 'Risk and position sizing',
    difficulty: 'Beginner',
    estimatedMinutes: 12,
    objectives: ['Size a position from risk budget', 'Respect 100-share lots', 'Name concentration and data risks'],
    sections: [
      { heading: 'Definition', body: 'Decide max loss first, then quantity = risk budget / stop distance. Round DOWN to 100-share lots (HOSE/HNX).' },
      { heading: 'Why it matters', body: 'PositionSizer + RiskGuard enforce 20% single-stock, cash buffer, and kill-switch caps. Learn them before paper trading.' },
      { heading: 'VN-STOCK-AI-PRO usage', body: 'RiskCenter shows exposure/concentration/stress; Paper Trading blocks oversized, short, or stale-data orders (fail-closed).' },
      { heading: 'Common mistakes', body: 'Sizing by conviction instead of stop distance; holding 3 banks and calling it diversified.' },
    ],
    examples: [{ title: 'Sizing math', body: 'SIMULATED: risk budget 2,000,000 VND / stop distance 2,000 VND = 1,000 shares -> 10 lots. Illustrative only.', dataBadge: SIM }],
    keyPoints: ['Risk first, qty second', '100-share lots', 'Diversify sectors, cap size'],
    systemFeatureRefs: ['RiskCenter', 'Paper Trading', 'PositionSizer'],
    dataBadge: EDU,
    status: 'PUBLISHED',
    version: CATALOG_VERSION,
  },
  {
    id: 'les-system-106',
    conceptIds: ['c-workflow', 'c-data-risk'],
    topicId: 'top-system',
    title: 'Using VN-STOCK-AI-PRO end-to-end',
    difficulty: 'Beginner',
    estimatedMinutes: 10,
    objectives: ['Run screen -> detail -> watchlist -> paper -> risk review', 'Find any signal with provenance'],
    sections: [
      { heading: 'Workflow', body: 'Screen (filters) -> StockDetail (7 tabs) -> Watchlist -> Paper Trading (DEMO) -> RiskCenter review.' },
      { heading: 'Provenance', body: 'Every number should have source + as-of + freshness. UNAVAILABLE means the system refused to guess — respect it.' },
      { heading: 'AI correctly', body: 'AI Analyst is advisory-only. SYSTEM FACT vs EDUCATIONAL EXPLANATION vs MODEL ASSUMPTION vs SIMULATION are different things.' },
    ],
    examples: [{ title: 'Navigation task', body: 'Find the RSI(14) of a watchlist stock and its data as-of time. If missing, report UNAVAILABLE.', dataBadge: EDU }],
    keyPoints: ['One workflow', 'Provenance always', 'UNAVAILABLE is an answer'],
    systemFeatureRefs: ['Screener', 'StockDetail', 'Watchlist', 'Paper Trading', 'RiskCenter'],
    dataBadge: EDU,
    status: 'PUBLISHED',
    version: CATALOG_VERSION,
  },
  {
    id: 'les-practice-107',
    conceptIds: ['c-diversification', 'c-risk-size'],
    topicId: 'top-risk',
    title: 'Practice Lab briefing: diversification',
    difficulty: 'Intermediate',
    estimatedMinutes: 8,
    objectives: ['Enter the Practice Lab', 'Use evidence checkboxes', 'Explain a risk without giving advice'],
    sections: [
      { heading: 'What you will do', body: 'Open Practice Lab, read the SIMULATED 4-ticker portfolio (ACB/FPT/HPG/VCB), answer which risk is most visible, tick required evidence.' },
      { heading: 'Rules', body: 'Educational simulation only. Do not place real orders from lab conclusions. Explain WHY with correlation, sector exposure, position size.' },
    ],
    examples: [{ title: 'Lab data', body: 'SIMULATED EDUCATIONAL DATA — figures are fictional and static.', dataBadge: SIM }],
    keyPoints: ['SIMULATED != real', 'Evidence required', 'Explain, do not advise'],
    systemFeatureRefs: ['Practice Lab', 'Portfolio'],
    dataBadge: EDU,
    status: 'PUBLISHED',
    version: CATALOG_VERSION,
  },
];

export const EXERCISES: Exercise[] = [
  {
    id: 'ex-market-cap-01', lessonId: 'les-market-101', conceptIds: ['c-stock'], type: 'CALCULATION',
    difficulty: 'Beginner', question: 'SIMULATED: price 25,000 VND, 6,000,000,000 shares. Market cap (B VND)?',
    correctAnswer: '150000', tolerance: 0.01,
    explanation: 'Market cap = 25,000 x 6B = 150,000B VND. Scale price by shares; price alone tells nothing.',
    expectedReasoning: 'Multiply price by shares outstanding, express in billions.',
    systemFeature: 'Screener', dataBadge: SIM, status: 'PUBLISHED', version: CATALOG_VERSION,
  },
  {
    id: 'ex-stock-def-01', lessonId: 'les-market-101', conceptIds: ['c-stock'], type: 'KNOWLEDGE',
    difficulty: 'Beginner', question: 'What does owning a stock represent?',
    options: [{ id: 'a', label: 'Fractional ownership of the company' }, { id: 'b', label: 'A guaranteed fixed return' }, { id: 'c', label: 'A loan to the exchange' }],
    correctAnswer: 'a',
    explanation: 'Equity is residual ownership; returns are not guaranteed. Debt (loans) is a different claim.',
    expectedReasoning: 'Eliminate guaranteed-return and loan distractors.',
    systemFeature: 'Screener', dataBadge: EDU, status: 'PUBLISHED', version: CATALOG_VERSION,
  },
  {
    id: 'ex-stale-01', lessonId: 'les-price-volume-102', conceptIds: ['c-data-risk'], type: 'DEBUGGING',
    difficulty: 'Beginner', question: 'Quote shows price 50.0 with freshness STALE. What should you do?',
    options: [{ id: 'a', label: 'Trade immediately at 50.0' }, { id: 'b', label: 'Treat as UNAVAILABLE and refresh / wait' }, { id: 'c', label: 'Average it with yesterday price' }],
    correctAnswer: 'b',
    explanation: 'STALE means the system cannot vouch for the price. Fail-closed: block the decision, refresh provenance.',
    expectedReasoning: 'Freshness gates every decision.',
    systemFeature: 'Data Health', dataBadge: EDU, status: 'PUBLISHED', version: CATALOG_VERSION,
  },
  {
    id: 'ex-band-01', lessonId: 'les-index-sector-103', conceptIds: ['c-index-sector'], type: 'KNOWLEDGE',
    difficulty: 'Beginner', question: 'HOSE daily price band is?',
    options: [{ id: 'a', label: '±7%' }, { id: 'b', label: '±10%' }, { id: 'c', label: '±15%' }],
    correctAnswer: 'a',
    explanation: 'HOSE ±7%, HNX ±10%, UPCOM ±15%. Bands bound backtests and order validation.',
    expectedReasoning: 'Recall venue bands.',
    systemFeature: 'Market Map', dataBadge: EDU, status: 'PUBLISHED', version: CATALOG_VERSION,
  },
  {
    id: 'ex-margin-01', lessonId: 'les-statements-104', conceptIds: ['c-statements'], type: 'CALCULATION',
    difficulty: 'Beginner', question: 'SIMULATED: revenue 100B, gross profit 25B. Gross margin (%)?',
    correctAnswer: '25', tolerance: 0.5,
    explanation: 'Margin = 25/100 x 100 = 25%. Same formula the Metrics engine uses (part/revenue).',
    expectedReasoning: 'Divide part by revenue.',
    systemFeature: 'StockDetail fundamentals', dataBadge: SIM, status: 'PUBLISHED', version: CATALOG_VERSION,
  },
  {
    id: 'ex-ttm-debug-01', lessonId: 'les-statements-104', conceptIds: ['c-ttm'], type: 'DEBUGGING',
    difficulty: 'Beginner', question: 'Analyst sums Q1 + H1 + Q3 as TTM. What is wrong?',
    options: [{ id: 'a', label: 'Nothing, any 3 reports work' }, { id: 'b', label: 'H1 overlaps Q1/Q2; TTM needs 4 comparable quarters' }, { id: 'c', label: 'TTM must use prices, not profits' }],
    correctAnswer: 'b',
    explanation: 'H1 already contains Q1+Q2, so the sum double-counts. TTM = 4 non-overlapping quarters (comparability guard).',
    expectedReasoning: 'Check period comparability.',
    systemFeature: 'Earnings Intelligence', dataBadge: EDU, status: 'PUBLISHED', version: CATALOG_VERSION,
  },
  {
    id: 'ex-pe-fact-01', lessonId: 'les-statements-104', conceptIds: ['c-valuation'], type: 'INTERPRETATION',
    difficulty: 'Beginner', question: 'P/E 10x from an estimated EPS is best described as?',
    options: [{ id: 'a', label: 'Objective fact' }, { id: 'b', label: 'Model output resting on assumptions' }, { id: 'c', label: 'Guaranteed fair value' }],
    correctAnswer: 'b',
    explanation: 'FACT = reported inputs; ESTIMATE = forecast EPS; MODEL OUTPUT = P/E. Never present output as fact.',
    expectedReasoning: 'Separate fact/assumption/estimate/output.',
    systemFeature: 'Valuation', dataBadge: EDU, status: 'PUBLISHED', version: CATALOG_VERSION,
  },
  {
    id: 'ex-size-01', lessonId: 'les-risk-105', conceptIds: ['c-risk-size'], type: 'CALCULATION',
    difficulty: 'Beginner', question: 'SIMULATED: risk budget 2,000,000 VND, stop distance 2,000 VND. Shares?',
    correctAnswer: '1000', tolerance: 0.01,
    explanation: '1,000 shares = 10 lots of 100. Round down to lots; never round up risk.',
    expectedReasoning: 'Budget / distance, then lot-floor.',
    systemFeature: 'PositionSizer', dataBadge: SIM, status: 'PUBLISHED', version: CATALOG_VERSION,
  },
  {
    id: 'ex-decision-01', lessonId: 'les-risk-105', conceptIds: ['c-diversification'], type: 'DECISION',
    difficulty: 'Beginner', question: 'Portfolio holds 3 banks, all up together. What would you investigate next? (No buy/sell required.)',
    options: [{ id: 'a', label: 'Sector exposure and correlation in RiskCenter' }, { id: 'b', label: 'Immediately double the winners' }, { id: 'c', label: 'Ignore it; green means safe' }],
    correctAnswer: 'a',
    explanation: 'Correlated sector bets hide concentration. Investigate exposure/correlation before any action.',
    expectedReasoning: 'Follow evidence, not outcome.',
    systemFeature: 'RiskCenter', dataBadge: EDU, status: 'PUBLISHED', version: CATALOG_VERSION,
  },
  {
    id: 'ex-nav-01', lessonId: 'les-system-106', conceptIds: ['c-workflow'], type: 'SYSTEM_NAVIGATION',
    difficulty: 'Beginner', question: 'Where do you check quote freshness and provider status?',
    options: [{ id: 'a', label: 'Data Health' }, { id: 'b', label: 'Footer copyright' }, { id: 'c', label: 'AI chat only' }],
    correctAnswer: 'a',
    explanation: 'Data Health shows endpoint liveness, latency, and CURRENT/STALE/UNAVAILABLE per feed.',
    expectedReasoning: 'Navigate: Sidebar SYSTEM -> Data Health.',
    systemFeature: 'Data Health', dataBadge: EDU, status: 'PUBLISHED', version: CATALOG_VERSION,
  },
  {
    id: 'ex-lab-01', lessonId: 'les-practice-107', conceptIds: ['c-diversification'], type: 'INTERPRETATION',
    difficulty: 'Beginner', question: 'SIMULATED lab portfolio ACB/FPT/HPG/VCB: 2 of 4 names share one sector with high pairwise correlation. What does this tell you?',
    options: [{ id: 'a', label: 'Concentration/correlation risk is visible; check sector exposure and size' }, { id: 'b', label: 'It is safe because 4 tickers always means diversified' }, { id: 'c', label: 'FX settlement is the dominant risk here' }],
    correctAnswer: 'a',
    explanation: 'Count plus correlation beats count alone: two heavy weights in one correlated sector fall together. Check sector exposure, correlation, position size in the SIMULATED box.',
    expectedReasoning: 'State one correlation observation + one sector-exposure fact + one size fact, no buy/sell advice.',
    systemFeature: 'Practice Lab', dataBadge: SIM, status: 'PUBLISHED', version: CATALOG_VERSION,
  },
];

export const PATHS: LearningPath[] = [
  {
    id: 'path-beginner',
    title: 'VN Beginnings — Complete Beginner',
    description: 'Market basics -> statements -> risk -> platform workflow. Education only, not advice.',
    level: 'Beginner',
    items: [
      { kind: 'lesson', refId: 'les-market-101' },
      { kind: 'lesson', refId: 'les-price-volume-102' },
      { kind: 'lesson', refId: 'les-index-sector-103' },
      { kind: 'lesson', refId: 'les-statements-104' },
      { kind: 'lesson', refId: 'les-risk-105' },
      { kind: 'lesson', refId: 'les-system-106' },
      { kind: 'lesson', refId: 'les-practice-107' },
      { kind: 'lab', refId: 'lab-diversification-01' },
    ],
    status: 'PUBLISHED',
    version: CATALOG_VERSION,
  },
];

export const LABS: PracticeLab[] = [
  {
    id: 'lab-diversification-01',
    title: 'Portfolio Diversification Lab',
    topic: 'Diversification',
    difficulty: 'Intermediate',
    scenario: 'SIMULATED EDUCATIONAL DATA — fictional 4-ticker portfolio: ACB / FPT / HPG / VCB. Prices, weights and correlations below are invented for teaching and are NOT market data.',
    question: 'Which risk is most visible in this SIMULATED portfolio?',
    evidenceRequired: ['Correlation', 'Sector exposure', 'Position size'],
    guidance: 'Tick each evidence box only after you can state one SIMULATED observation for it. Then write one sentence explaining WHY (no buy/sell advice).',
    dataBadge: SIM,
    status: 'PUBLISHED',
    version: CATALOG_VERSION,
  },
];

export const PREREQUISITES: Record<string, string[]> = {
  'les-price-volume-102': ['les-market-101'],
  'les-index-sector-103': ['les-price-volume-102'],
  'les-statements-104': ['les-index-sector-103'],
  'les-risk-105': ['les-statements-104'],
  'les-system-106': ['les-risk-105'],
  'les-practice-107': ['les-system-106'],
};

export function getLesson(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}

export function getExercise(id: string): Exercise | undefined {
  return EXERCISES.find((e) => e.id === id);
}

export function getExercisesForLesson(lessonId: string): Exercise[] {
  return EXERCISES.filter((e) => e.lessonId === lessonId);
}

export function getPath(id: string): LearningPath | undefined {
  return PATHS.find((p) => p.id === id);
}

export function getLab(id: string): PracticeLab | undefined {
  return LABS.find((l) => l.id === id);
}

export const PROJECTS: Project[] = [
  {
    id: 'prj-company-101',
    title: 'Analyze one company (sandbox)',
    level: 'Beginner',
    summary:
      'EDUCATIONAL sandbox project. Pick any listed symbol, walk the Screener → StockDetail → RiskCenter flow, and write a one-paragraph thesis with evidence. No orders, no advice — analysis only.',
    steps: [
      'Open the Screener and pick one symbol you can explain in one sentence.',
      'Open StockDetail: read fundamentals (revenue, profit, EPS, margin) and check TTM comparability.',
      'Open RiskCenter: note position-size math and what STALE data would block.',
      'Write one paragraph: what you observed, what is still UNKNOWN, and what you would investigate next.',
    ],
    evidenceRequired: ['Revenue observation', 'Margin or EPS observation', 'TTM check', 'Risk or data-freshness note'],
    rubric:
      'All 4 evidence boxes ticked + a ≥24-character thesis paragraph mentioning one FACT and one UNKNOWN. Self-checked locally; sandbox only, never trading execution.',
    conceptIds: ['c-statements', 'c-ttm', 'c-risk-size', 'c-data-risk'],
    requiresLessonIds: ['les-statements-104', 'les-risk-105'],
    systemFeature: 'Screener + StockDetail + RiskCenter',
    dataBadge: EDU,
    status: 'PUBLISHED',
    version: CATALOG_VERSION,
  },
];

export function getProject(id: string): Project | undefined {
  return PROJECTS.find((p) => p.id === id);
}

export const ASSESSMENTS: Assessment[] = [
  {
    id: 'asmt-beginner-01',
    title: 'VN Beginnings — Competency Check',
    description:
      'EDUCATIONAL summative check over the beginner path. 7 questions across 7 concepts; overall ≥70% plus a perfect data-safety answer (fail-closed is non-negotiable). Self-graded locally; not an external accreditation.',
    exerciseIds: [
      'ex-stock-def-01',
      'ex-stale-01',
      'ex-band-01',
      'ex-margin-01',
      'ex-ttm-debug-01',
      'ex-size-01',
      'ex-decision-01',
    ],
    passThreshold: 0.7,
    competencyThresholds: { 'c-data-risk': 1 },
    dataBadge: EDU,
    status: 'PUBLISHED',
    version: CATALOG_VERSION,
  },
];

export function getAssessment(id: string): Assessment | undefined {
  return ASSESSMENTS.find((a) => a.id === id);
}
