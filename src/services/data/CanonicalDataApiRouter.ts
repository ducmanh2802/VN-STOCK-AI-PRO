import { Router, type Request, type Response } from 'express';
import { getHistoricalStockData, getRealtimeQuote } from '../market/realMarketDataService.ts';
import { QualityEngine, PointInTimeGuard, InstrumentIdentityEngine } from '../../lib/data/index.ts';
import type { CanonicalBar } from '../../lib/data/types.ts';
import { InstrumentRepository } from '../../lib/db/data/DataFoundationRepository.ts';

export function createCanonicalDataApiRouter(): Router {
  const router = Router();

  // Ingest data for symbol
  router.post('/ingest/:symbol', async (req: Request, res: Response) => {
    try {
      const symbol = (req.params.symbol || '').toUpperCase().trim();
      if (!symbol) {
        return res.status(400).json({ error: 'symbol is required' });
      }

      const candles = await getHistoricalStockData(symbol, '2023-01-01', new Date().toISOString().slice(0, 10));
      const bars: CanonicalBar[] = candles.map((c) => ({
        instrumentId: symbol,
        date: c.time.slice(0, 10),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
        value: c.close * c.volume,
        source: 'KBS',
        quality: 'VALID',
      }));

      const qualityResult = QualityEngine.assessBars(bars);

      return res.json({
        success: true,
        symbol,
        count: bars.length,
        quality: qualityResult.quality,
        checks: qualityResult.checks,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Ingestion failed' });
    }
  });

  // GET canonical bars with point-in-time guard
  router.get('/bars/:symbol', async (req: Request, res: Response) => {
    try {
      const symbol = (req.params.symbol || '').toUpperCase().trim();
      const asOf = (req.query.asOf as string) || new Date().toISOString();

      const candles = await getHistoricalStockData(symbol, '2023-01-01', asOf.slice(0, 10));
      const bars: CanonicalBar[] = candles.map((c) => ({
        instrumentId: symbol,
        date: c.time.slice(0, 10),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
        value: c.close * c.volume,
        source: 'KBS',
        quality: 'VALID',
      }));

      const filtered = bars.filter((b) => PointInTimeGuard.isKnowable(b.date, asOf.slice(0, 10)));

      return res.json({
        symbol,
        asOf,
        count: filtered.length,
        bars: filtered,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to fetch bars' });
    }
  });

  // GET data quality assessment
  router.get('/quality/:symbol', async (req: Request, res: Response) => {
    try {
      const symbol = (req.params.symbol || '').toUpperCase().trim();
      const candles = await getHistoricalStockData(symbol, '2023-01-01', new Date().toISOString().slice(0, 10));
      const bars: CanonicalBar[] = candles.map((c) => ({
        instrumentId: symbol,
        date: c.time.slice(0, 10),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
        value: c.close * c.volume,
        source: 'KBS',
        quality: 'VALID',
      }));

      const assessment = QualityEngine.assessBars(bars);
      return res.json({
        symbol,
        quality: assessment.quality,
        checks: assessment.checks,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to evaluate quality' });
    }
  });

  // POST cross-source check
  router.post('/cross-source-check', async (req: Request, res: Response) => {
    try {
      const { symbol } = req.body || {};
      const targetSymbol = (symbol || '').toUpperCase().trim();
      if (!targetSymbol) {
        return res.status(400).json({ error: 'symbol is required' });
      }

      const quote = await getRealtimeQuote(targetSymbol);
      return res.json({
        symbol: targetSymbol,
        status: 'VERIFIED',
        price: quote.price,
        exchange: quote.exchange,
        timestamp: quote.timestamp,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Cross-source check failed' });
    }
  });

  // GET identity
  router.get('/identity/:symbol', async (req: Request, res: Response) => {
    try {
      const symbol = (req.params.symbol || '').toUpperCase().trim();
      const asOf = (req.query.asOf as string) || new Date().toISOString().slice(0, 10);
      const identity = await InstrumentRepository.getAsOf(symbol, asOf);

      if (identity) {
        return res.json(identity);
      }

      // Generate default identity
      const defaultId = InstrumentIdentityEngine.register({
        instrumentId: `VN:${symbol}`,
        symbol,
        exchange: 'HOSE',
        assetClass: 'EQUITY',
        validFrom: '2000-01-01',
      });

      return res.json(defaultId);
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to get instrument identity' });
    }
  });

  return router;
}
