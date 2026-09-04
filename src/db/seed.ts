import { db } from './index.ts';
import {
  stocks,
  stockDaily,
  technicalIndicators,
  financialRatios,
  valuationResults,
  moneyFlows,
  foreignTrading,
  signals,
} from './schema.ts';
import { MOCK_STOCKS_DATABASE } from '../data/mock/marketData.ts';
import { eq } from 'drizzle-orm';

export async function seedDatabase() {
  console.log('--- Starting Cloud SQL Database Seeding ---');

  for (const [symbol, data] of Object.entries(MOCK_STOCKS_DATABASE)) {
    // 1. Upsert stock
    const existing = await db.select().from(stocks).where(eq(stocks.symbol, symbol)).limit(1);
    let stockId: number;

    if (existing.length > 0) {
      stockId = existing[0].id;
    } else {
      const inserted = await db
        .insert(stocks)
        .values({
          symbol: data.symbol,
          companyName: data.companyName,
          exchange: data.exchange,
          sector: data.sector,
          industry: data.sector,
          listedShares: 1000000000,
          outstandingShares: 1000000000,
          isActive: true,
        })
        .returning();
      stockId = inserted[0].id;
    }

    const todayStr = '2025-02-28';

    // 2. Upsert stock daily record
    await db
      .insert(stockDaily)
      .values({
        stockId,
        date: todayStr,
        open: String(data.open),
        high: String(data.high),
        low: String(data.low),
        close: String(data.price),
        refPrice: String(data.refPrice),
        ceilingPrice: String(data.ceilingPrice),
        floorPrice: String(data.floorPrice),
        change: String(data.change),
        changePercent: String(data.changePercent),
        volume: data.volume,
        value: String(data.tradingValue * 1e9),
      })
      .onConflictDoNothing();

    // 3. Upsert technical indicators
    await db
      .insert(technicalIndicators)
      .values({
        stockId,
        date: todayStr,
        timeframe: '1D',
        ma20: String(data.price * 0.98),
        ma50: String(data.price * 0.95),
        ma200: String(data.price * 0.88),
        rsi14: String(data.rsi),
        macd: '1.45',
        macdSignal: '1.12',
        macdHistogram: '0.33',
        bollingerUpper: String(data.ceilingPrice * 0.97),
        bollingerMiddle: String(data.price),
        bollingerLower: String(data.floorPrice * 1.03),
        volumeMa20: Math.round(data.volume * 0.9),
        signalSummary: data.trend,
      })
      .onConflictDoNothing();

    // 4. Upsert financial ratios
    await db
      .insert(financialRatios)
      .values({
        stockId,
        year: 2024,
        quarter: 4,
        pe: String(data.pe),
        pb: String(data.pb),
        roe: String(data.roe),
        eps: String(Math.round(data.price / (data.pe || 15))),
        bvps: String(Math.round(data.price / (data.pb || 2))),
      })
      .onConflictDoNothing();

    // 5. Upsert valuation results
    await db
      .insert(valuationResults)
      .values({
        stockId,
        modelName: 'CONSENSUS',
        targetPrice: String(data.fairValue),
        currentPrice: String(data.price),
        upsidePercent: String(((data.fairValue - data.price) / data.price * 100).toFixed(2)),
        rating: data.fairValue > data.price ? 'UNDERVALUED' : 'FAIR',
        marginOfSafety: '15.0',
        assumptions: 'Mô hình chiết khấu dòng tiền kết hợp định giá P/E mục tiêu ngành.',
      })
      .onConflictDoNothing();

    // 6. Upsert money flows
    await db
      .insert(moneyFlows)
      .values({
        stockId,
        date: todayStr,
        largeOrdersBuy: String((data.tradingValue * 0.45 * 1e9).toFixed(0)),
        largeOrdersSell: String((data.tradingValue * 0.35 * 1e9).toFixed(0)),
        netBigMoney: String((data.tradingValue * 0.10 * 1e9).toFixed(0)),
        activeBuyPressurePercent: '58.5',
      })
      .onConflictDoNothing();

    // 7. Upsert foreign trading
    const foreignBuyVol = Math.round(data.volume * 0.18);
    const foreignSellVol = Math.round(data.volume * 0.12);
    const foreignNetVol = foreignBuyVol - foreignSellVol;
    const foreignBuyVal = Math.round(foreignBuyVol * data.price);
    const foreignSellVal = Math.round(foreignSellVol * data.price);
    const foreignNetVal = foreignBuyVal - foreignSellVal;

    await db
      .insert(foreignTrading)
      .values({
        stockId,
        date: todayStr,
        buyVolume: foreignBuyVol,
        sellVolume: foreignSellVol,
        netVolume: foreignNetVol,
        buyValue: String(foreignBuyVal),
        sellValue: String(foreignSellVal),
        netValue: String(foreignNetVal),
        ownershipPercent: '18.5',
      })
      .onConflictDoNothing();

    // 8. Upsert active signals
    if (data.aiScore >= 80) {
      await db
        .insert(signals)
        .values({
          stockId,
          signalType: data.aiScore >= 88 ? 'STRONG_BUY' : 'BUY',
          timeframe: 'SHORT_TERM',
          triggerPrice: String(data.price),
          targetPrice: String(data.fairValue),
          stopLoss: String(Math.round(data.price * 0.93)),
          riskRewardRatio: '2.85',
          confidence: String(data.aiScore / 100),
          source: 'AI_STUDIO_ALGO',
          status: 'ACTIVE',
        })
        .onConflictDoNothing();
    }
  }

  console.log('--- Seeding completed successfully ---');
}

// If run directly via CLI
if (process.argv[1]?.endsWith('seed.ts')) {
  seedDatabase()
    .then(() => {
      console.log('Seed process finished');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed process failed:', err);
      process.exit(1);
    });
}
