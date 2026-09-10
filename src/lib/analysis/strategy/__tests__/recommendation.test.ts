import { describe, it, expect } from 'vitest';
import { RecommendationEngine } from '../RecommendationEngine';
import { RiskRewardEngine } from '../RiskRewardEngine';
import { StrategyScorer } from '../StrategyScorer';
import { SignalEngine } from '../SignalEngine';

describe('PHASE 17 — RiskRewardEngine', () => {
  it('calculates risk-reward ratio correctly', () => {
    const res = RiskRewardEngine.calculate({
      entryPrice: 100_000,
      stopLossPrice: 95_000,
      targetPrice: 110_000,
    });

    expect(res.riskAmount).toBe(5_000);
    expect(res.rewardAmount).toBe(10_000);
    expect(res.riskPercent).toBe(5);
    expect(res.rewardPercent).toBe(10);
    expect(res.ratio).toBe(2);
    expect(res.ratioLabel).toBe('1 : 2');
    expect(res.isFavorable).toBe(true);
  });

  it('suggests lot-rounded position size based on capital risk', () => {
    const res = RiskRewardEngine.calculate({
      entryPrice: 50_000,
      stopLossPrice: 48_000, // 2,000 risk per share
      targetPrice: 56_000,
      capitalVnd: 100_000_000,
      maxRiskPerTradePercent: 2, // 2,000,000 max loss
    });

    expect(res.riskCapitalVnd).toBe(2_000_000);
    expect(res.suggestedShares).toBe(1000); // 2,000,000 / 2,000 = 1000 shares
  });

  it('throws for non-positive prices', () => {
    expect(() =>
      RiskRewardEngine.calculate({
        entryPrice: 0,
        stopLossPrice: 90,
        targetPrice: 110,
      })
    ).toThrow('Prices must be positive numbers');
  });
});

describe('PHASE 17 — RecommendationEngine', () => {
  const baseScores = {
    technicalScore: 78,
    fundamentalScore: 82,
    momentumScore: 75,
    moneyFlowScore: 80,
    valuationScore: 70,
    riskScore: 25,
  };

  it('generates a full BUY recommendation for high score stock', () => {
    const rec = RecommendationEngine.generate({
      symbol: 'FPT',
      strategy: 'SHORT_TERM',
      currentPrice: 130_000,
      scores: baseScores,
      supportPrice: 125_000,
      resistancePrice: 142_000,
      peRatio: 22.5,
      roe: 28.4,
    });

    expect(rec.symbol).toBe('FPT');
    expect(rec.strategy).toBe('SHORT_TERM');
    expect(rec.signal).toBe('BUY');
    expect(rec.score).toBeGreaterThan(70);
    expect(rec.confidence).toBe('HIGH');
    expect(rec.entryPrice).toBe(130_000);
    expect(rec.targetPrice).toBe(142_000);
    expect(rec.stopLoss).toBe(125_000);
    expect(rec.potentialUpside).toBeGreaterThan(5);
    expect(rec.potentialDownside).toBeGreaterThan(0);
    expect(rec.reasons.length).toBeGreaterThan(0);
    expect(rec.evidence.length).toBeGreaterThan(0);
  });

  it('generates multi-horizon recommendations (SHORT, MEDIUM, LONG)', () => {
    const recs = RecommendationEngine.generateMultiHorizon({
      symbol: 'VCB',
      currentPrice: 95_000,
      scores: baseScores,
      fairValuePrice: 115_000,
    });

    expect(recs.SHORT_TERM.strategy).toBe('SHORT_TERM');
    expect(recs.MEDIUM_TERM.strategy).toBe('MEDIUM_TERM');
    expect(recs.LONG_TERM.strategy).toBe('LONG_TERM');

    expect(recs.SHORT_TERM.signal).toBe('BUY');
    expect(recs.MEDIUM_TERM.signal).toBe('BUY');
    expect(recs.LONG_TERM.signal).toBe('BUY');
  });

  it('ranks universe correctly by score and expected return', () => {
    const universeData = new Map();
    universeData.set('FPT', {
      currentPrice: 130_000,
      scores: { ...baseScores, technicalScore: 85, fundamentalScore: 90 },
      fairValuePrice: 155_000,
    });
    universeData.set('VNM', {
      currentPrice: 68_000,
      scores: { ...baseScores, technicalScore: 45, fundamentalScore: 60, riskScore: 50 },
      fairValuePrice: 72_000,
    });
    universeData.set('HPG', {
      currentPrice: 28_000,
      scores: { ...baseScores, technicalScore: 70, fundamentalScore: 75 },
      fairValuePrice: 34_000,
    });

    const ranking = RecommendationEngine.rankUniverse(
      {
        strategy: 'MEDIUM_TERM',
        symbols: ['FPT', 'VNM', 'HPG'],
        minScore: 50,
      },
      universeData
    );

    expect(ranking.universeSize).toBe(3);
    expect(ranking.rankings.length).toBeGreaterThanOrEqual(2);
    expect(ranking.rankings[0].symbol).toBe('FPT');
    expect(ranking.rankings[0].rank).toBe(1);
    expect(ranking.rankings[0].signal).toBe('BUY');
  });
});
