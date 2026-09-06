import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
      // (vite import moved to top)
import {
  StockRepository,
  PriceRepository,
  TechnicalRepository,
  FundamentalRepository,
  ValuationRepository,
  SignalRepository,
  WatchlistRepository,
  PortfolioRepository,
  MoneyFlowRepository,
} from './src/lib/db/index.ts';
import {
  TechnicalScoreEngine,
  FundamentalScoreEngine,
  ValuationEngine,
  MoneyFlowEngine,
} from './src/lib/analysis/index.ts';
import { requireAuth, type AuthRequest } from './src/middleware/auth.ts';
import { getOrCreateUser } from './src/db/users.ts';
// PHASE 8.5C — REAL market data (KBS historical OHLCV + VPS realtime/fundamentals)
import {
  getHistoricalStockData,
  getRealtimeQuote,
  getStockFundamentals,
  MarketDataUnavailableError,
} from './src/services/market/realMarketDataService.ts';
import { buildChartDataBundleFromCandles } from './src/services/market/stockHistory.ts';
import { StockAnalysisEngine } from './src/lib/analysis/technical/StockAnalysisEngine.ts';
import { cacheStats } from './src/services/market/marketDataCache.ts';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // ========================================================
  // API ROUTES (Backend Data Layer over PostgreSQL / Drizzle)
  // ========================================================

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), marketDataCache: cacheStats() });
  });

  // Current Authenticated User Profile (Cloud SQL + Firebase Auth)
  app.get('/api/users/me', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.uid) {
        return res.status(401).json({ error: 'Chưa xác thực người dùng' });
      }
      const user = await getOrCreateUser(req.user.uid, req.user.email || '', req.user.name);
      res.json(user);
    } catch (error: any) {
      console.error('Error in GET /api/users/me:', error);
      res.status(500).json({ error: error.message || 'Lỗi khi đồng bộ thông tin người dùng' });
    }
  });

  // Stocks Master List
  app.get('/api/stocks', async (req, res) => {
    try {
      const exchange = req.query.exchange as string | undefined;
      const sector = req.query.sector as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

      const stocksList = await StockRepository.getStocks({ exchange, sector, limit });
      res.json(stocksList);
    } catch (error: any) {
      console.error('Error in GET /api/stocks:', error);
      res.status(500).json({ error: error.message || 'Lỗi khi tải danh sách cổ phiếu' });
    }
  });

  // Stock Search
  app.get('/api/stocks/search', async (req, res) => {
    try {
      const q = (req.query.q as string) || '';
      if (!q.trim()) {
        return res.json([]);
      }
      const results = await StockRepository.search(q);
      res.json(results);
    } catch (error: any) {
      console.error('Error in GET /api/stocks/search:', error);
      res.status(500).json({ error: error.message || 'Lỗi khi tìm kiếm' });
    }
  });

  // Stock Detail by Symbol
  app.get('/api/stocks/:symbol', async (req, res) => {
    try {
      const symbol = req.params.symbol;
      const stock = await StockRepository.getBySymbol(symbol);
      if (!stock) {
        return res.status(404).json({ error: `Không tìm thấy mã cổ phiếu ${symbol}` });
      }
      res.json(stock);
    } catch (error: any) {
      console.error(`Error in GET /api/stocks/${req.params.symbol}:`, error);
      res.status(500).json({ error: error.message || 'Lỗi hệ thống' });
    }
  });

  // Stock Daily OHLCV Bars
  app.get('/api/stocks/:symbol/daily', async (req, res) => {
    try {
      const stock = await StockRepository.getBySymbol(req.params.symbol);
      if (!stock) {
        return res.status(404).json({ error: 'Không tìm thấy cổ phiếu' });
      }

      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 120;

      const history = await PriceRepository.getDailyHistory(stock.id, { from, to, limit });
      res.json(history);
    } catch (error: any) {
      console.error(`Error in GET /api/stocks/${req.params.symbol}/daily:`, error);
      res.status(500).json({ error: error.message || 'Lỗi khi tải lịch sử giá' });
    }
  });

  // Stock Intraday Ticks
  app.get('/api/stocks/:symbol/intraday', async (req, res) => {
    try {
      const stock = await StockRepository.getBySymbol(req.params.symbol);
      if (!stock) {
        return res.status(404).json({ error: 'Không tìm thấy cổ phiếu' });
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 200;
      const intraday = await PriceRepository.getIntradayHistory(stock.id, limit);
      res.json(intraday);
    } catch (error: any) {
      console.error(`Error in GET /api/stocks/${req.params.symbol}/intraday:`, error);
      res.status(500).json({ error: error.message || 'Lỗi khi tải dữ liệu giao dịch trong ngày' });
    }
  });

  // Stock Technical Indicators
  app.get('/api/stocks/:symbol/technicals', async (req, res) => {
    try {
      const stock = await StockRepository.getBySymbol(req.params.symbol);
      if (!stock) {
        return res.status(404).json({ error: 'Không tìm thấy cổ phiếu' });
      }

      const timeframe = (req.query.timeframe as string) || '1D';
      const indicators = await TechnicalRepository.getLatest(stock.id, timeframe);
      res.json(indicators || {});
    } catch (error: any) {
      console.error(`Error in GET /api/stocks/${req.params.symbol}/technicals:`, error);
      res.status(500).json({ error: error.message || 'Lỗi khi tải chỉ báo kỹ thuật' });
    }
  });

  // Stock Financial Statements & Ratios
  app.get('/api/stocks/:symbol/fundamentals', async (req, res) => {
    try {
      const stock = await StockRepository.getBySymbol(req.params.symbol);
      if (!stock) {
        return res.status(404).json({ error: 'Không tìm thấy cổ phiếu' });
      }

      const [statements, ratios, latestRatios] = await Promise.all([
        FundamentalRepository.getStatements(stock.id),
        FundamentalRepository.getRatios(stock.id, 8),
        FundamentalRepository.getLatestRatios(stock.id),
      ]);

      res.json({
        statements,
        ratios,
        latestRatios,
      });
    } catch (error: any) {
      console.error(`Error in GET /api/stocks/${req.params.symbol}/fundamentals:`, error);
      res.status(500).json({ error: error.message || 'Lỗi khi tải dữ liệu tài chính' });
    }
  });

  // Stock Valuation Results
  app.get('/api/stocks/:symbol/valuations', async (req, res) => {
    try {
      const stock = await StockRepository.getBySymbol(req.params.symbol);
      if (!stock) {
        return res.status(404).json({ error: 'Không tìm thấy cổ phiếu' });
      }

      const valuations = await ValuationRepository.getByStock(stock.id);
      res.json(valuations);
    } catch (error: any) {
      console.error(`Error in GET /api/stocks/${req.params.symbol}/valuations:`, error);
      res.status(500).json({ error: error.message || 'Lỗi khi tải kết quả định giá' });
    }
  });

  // Trading Signals
  app.get('/api/signals', async (req, res) => {
    try {
      const timeframe = req.query.timeframe as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 30;

      const activeSignals = await SignalRepository.getActiveSignals({ timeframe, limit });
      res.json(activeSignals);
    } catch (error: any) {
      console.error('Error in GET /api/signals:', error);
      res.status(500).json({ error: error.message || 'Lỗi khi tải tín hiệu khuyến nghị' });
    }
  });

  // Deterministic Technical Analysis Score
  app.get('/api/stocks/:symbol/technical-analysis', async (req, res) => {
    try {
      const stock = await StockRepository.getBySymbol(req.params.symbol);
      if (!stock) {
        return res.status(404).json({ error: 'Không tìm thấy cổ phiếu' });
      }

      const history = await PriceRepository.getDailyHistory(stock.id, { limit: 100 });
      const candles = history.map((h) => ({
        time: h.date,
        open: Number(h.open),
        high: Number(h.high),
        low: Number(h.low),
        close: Number(h.close),
        volume: Number(h.volume),
      }));

      const evaluation = TechnicalScoreEngine.evaluate(candles);
      res.json(evaluation);
    } catch (error: any) {
      console.error(`Error in GET /api/stocks/${req.params.symbol}/technical-analysis:`, error);
      res.status(500).json({ error: error.message || 'Lỗi khi tính toán phân tích kỹ thuật' });
    }
  });

  // Deterministic Fundamental Analysis Score
  app.get('/api/stocks/:symbol/fundamental-analysis', async (req, res) => {
    try {
      const stock = await StockRepository.getBySymbol(req.params.symbol);
      if (!stock) {
        return res.status(404).json({ error: 'Không tìm thấy cổ phiếu' });
      }

      const latestRatios = await FundamentalRepository.getLatestRatios(stock.id);
      const latestDaily = await PriceRepository.getLatestDaily(stock.id);

      const priceVal = latestDaily ? Number(latestDaily.close) : null;
      const epsVal = latestRatios?.eps ? Number(latestRatios.eps) : null;
      const bvpsVal = latestRatios?.bvps ? Number(latestRatios.bvps) : null;
      const roeVal = latestRatios?.roe ? Number(latestRatios.roe) : null;
      const roaVal = latestRatios?.roa ? Number(latestRatios.roa) : null;
      const deVal = latestRatios?.debtToEquity ? Number(latestRatios.debtToEquity) : null;

      const evaluation = FundamentalScoreEngine.evaluate({
        price: priceVal,
        totalEquity: bvpsVal && stock.listedShares ? bvpsVal * stock.listedShares : null,
        outstandingShares: stock.outstandingShares || stock.listedShares,
        bookValuePerShare: bvpsVal,
        currentProfit: epsVal && stock.listedShares ? epsVal * stock.listedShares : null,
      });

      res.json(evaluation);
    } catch (error: any) {
      console.error(`Error in GET /api/stocks/${req.params.symbol}/fundamental-analysis:`, error);
      res.status(500).json({ error: error.message || 'Lỗi khi tính toán phân tích cơ bản' });
    }
  });

  // Deterministic Stock Valuation Analysis
  app.get('/api/stocks/:symbol/valuation-analysis', async (req, res) => {
    try {
      const stock = await StockRepository.getBySymbol(req.params.symbol);
      if (!stock) {
        return res.status(404).json({ error: 'Không tìm thấy cổ phiếu' });
      }

      const latestDaily = await PriceRepository.getLatestDaily(stock.id);
      const latestRatios = await FundamentalRepository.getLatestRatios(stock.id);

      const currentPrice = latestDaily ? Number(latestDaily.close) : 100000;
      const eps = latestRatios?.eps ? Number(latestRatios.eps) : null;
      const bvps = latestRatios?.bvps ? Number(latestRatios.bvps) : null;

      const valuation = ValuationEngine.evaluate({
        currentPrice,
        eps,
        bookValuePerShare: bvps,
        targetPE: 16,
        targetPB: 2.2,
      });

      res.json(valuation);
    } catch (error: any) {
      console.error(`Error in GET /api/stocks/${req.params.symbol}/valuation-analysis:`, error);
      res.status(500).json({ error: error.message || 'Lỗi khi phân tích định giá' });
    }
  });

  // Deterministic Money Flow Analysis
  app.get('/api/stocks/:symbol/money-flow-analysis', async (req, res) => {
    try {
      const stock = await StockRepository.getBySymbol(req.params.symbol);
      if (!stock) {
        return res.status(404).json({ error: 'Không tìm thấy cổ phiếu' });
      }

      const history = await PriceRepository.getDailyHistory(stock.id, { limit: 60 });
      const candles = history.map((h) => ({
        time: h.date,
        open: Number(h.open),
        high: Number(h.high),
        low: Number(h.low),
        close: Number(h.close),
        volume: Number(h.volume),
      }));

      // Retrieve foreign trading data if available (do not infer if absent)
      const foreignRow = await MoneyFlowRepository.getLatestForeign(stock.id);
      const foreignTrading = foreignRow
        ? {
            foreignBuyVolume: foreignRow.buyVolume,
            foreignBuyValue: Number(foreignRow.buyValue),
            foreignSellVolume: foreignRow.sellVolume,
            foreignSellValue: Number(foreignRow.sellValue),
            foreignNetVolume: foreignRow.netVolume,
            foreignNetValue: Number(foreignRow.netValue),
          }
        : null;

      // Retrieve institutional money flow data if available
      const moneyFlowRow = await MoneyFlowRepository.getLatestMoneyFlow(stock.id);
      const institutionalTrading = moneyFlowRow
        ? {
            largeOrderBuyValue: Number(moneyFlowRow.largeOrdersBuy),
            largeOrderSellValue: Number(moneyFlowRow.largeOrdersSell),
            largeOrderNetValue: Number(moneyFlowRow.netBigMoney),
          }
        : null;

      const moneyFlowResult = MoneyFlowEngine.evaluate({
        candles,
        foreignTrading,
        institutionalTrading,
      });

      res.json(moneyFlowResult);
    } catch (error: any) {
      console.error(`Error in GET /api/stocks/${req.params.symbol}/money-flow-analysis:`, error);
      res.status(500).json({ error: error.message || 'Lỗi khi phân tích dòng tiền' });
    }
  });


  // ========================================================
  // PHASE 8.5C — REAL MARKET DATA ENDPOINTS (KBS + VPS)
  // No PostgreSQL. No synthetic fallback. No mock prices.
  // ========================================================

  const TIMEFRAMES = ['1W', '1M', '3M', '6M', '1Y', '3Y'] as const;
  type ApiTimeframe = (typeof TIMEFRAMES)[number];

  function isSupportedTimeframe(value: string): value is ApiTimeframe {
    return (TIMEFRAMES as readonly string[]).includes(value);
  }

  function respondMarketDataUnavailable(res: any, source: string, symbol: string, reason: string) {
    // Explicit unavailable state — the UI renders this as "no real data", never fake data.
    res.status(200).json({ symbol, dataStatus: 'DATA_UNAVAILABLE', dataSource: source, error: reason });
  }

  // Real historical OHLCV + technical indicator bundle (KBS)
  app.get('/api/market-data/history/:symbol', async (req, res) => {
    try {
      const symbol = req.params.symbol?.toUpperCase()?.trim() || '';
      const timeframeParam = (req.query.timeframe as string) || '3M';
      if (!/^[A-Z0-9_.]{1,20}$/.test(symbol)) {
        return res.status(400).json({ error: 'Invalid symbol format' });
      }
      if (!isSupportedTimeframe(timeframeParam)) {
        return respondMarketDataUnavailable(
          res,
          'KBS',
          symbol,
          `TIMEFRAME_NOT_SUPPORTED: "${timeframeParam}" requires intraday bars which KBS does not provide; synthetic candles are disabled.`
        );
      }
      try {
        const history = await getHistoricalStockData(symbol, timeframeParam);
        const lastBar = history.bars[history.bars.length - 1] ?? null;
        const bundle = buildChartDataBundleFromCandles(history.candles, {
          from: history.from,
          to: history.to,
          latestValueVnd: lastBar ? lastBar.value : null,
        });
        res.json({
          symbol: history.symbol,
          timeframe: history.timeframe,
          dataStatus: 'OK',
          dataSource: 'KBS',
          retrievedAt: history.retrievedAt,
          ...bundle,
        });
      } catch (error) {
        if (error instanceof MarketDataUnavailableError) {
          return respondMarketDataUnavailable(res, error.source, symbol, error.reason);
        }
        throw error;
      }
    } catch (error: any) {
      console.error(`Error in GET /api/market-data/history/${req.params.symbol}:`, error);
      res.status(500).json({ error: error.message || 'Lỗi khi tải dữ liệu lịch sử thật' });
    }
  });

  // Realtime quote snapshot (VPS) with KBS cross-check metadata
  app.get('/api/market-data/quote/:symbol', async (req, res) => {
    try {
      const symbol = req.params.symbol?.toUpperCase()?.trim() || '';
      if (!/^[A-Z0-9_.]{1,20}$/.test(symbol)) {
        return res.status(400).json({ error: 'Invalid symbol format' });
      }
      try {
        const realtime = await getRealtimeQuote(symbol);
        res.json(realtime);
      } catch (error) {
        if (error instanceof MarketDataUnavailableError) {
          return respondMarketDataUnavailable(res, error.source, symbol, error.reason);
        }
        throw error;
      }
    } catch (error: any) {
      console.error(`Error in GET /api/market-data/quote/${req.params.symbol}:`, error);
      res.status(500).json({ error: error.message || 'Lỗi khi tải giá realtime thật' });
    }
  });

  // Real fundamentals (VPS) — periods exposed as provided, mapping flagged AMBIGUOUS
  app.get('/api/market-data/fundamentals/:symbol', async (req, res) => {
    try {
      const symbol = req.params.symbol?.toUpperCase()?.trim() || '';
      if (!/^[A-Z0-9_.]{1,20}$/.test(symbol)) {
        return res.status(400).json({ error: 'Invalid symbol format' });
      }
      try {
        const fundamentals = await getStockFundamentals(symbol);
        res.json({ ...fundamentals, dataStatus: 'OK' });
      } catch (error) {
        if (error instanceof MarketDataUnavailableError) {
          return respondMarketDataUnavailable(res, error.source, symbol, error.reason);
        }
        throw error;
      }
    } catch (error: any) {
      console.error(`Error in GET /api/market-data/fundamentals/${req.params.symbol}:`, error);
      res.status(500).json({ error: error.message || 'Lỗi khi tải dữ liệu tài chính thật' });
    }
  });

  // Unified Stock Analysis (Technical Indicators + Signal + Score)
  // PHASE 8.5C: pipeline is now  KBS historical OHLCV → normalized candles →
  // StockAnalysisEngine → JSON.  No PostgreSQL, no synthetic/mock fallback.
  app.get('/api/analysis/:symbol', async (req, res) => {
    try {
      const symbol = req.params.symbol?.toUpperCase()?.trim();
      if (!symbol || !/^[A-Z]{2,4}$/.test(symbol)) {
        return res.status(400).json({ error: 'Invalid symbol format' });
      }
      try {
        // '1Y' window (≈500 calendar days) keeps ≥200 trading bars so MA200 is real.
        const history = await getHistoricalStockData(symbol, '1Y');
        const candles = history.candles;
        if (candles.length < 20) {
          return res.status(200).json({
            symbol,
            dataStatus: 'INSUFFICIENT_DATA',
            dataSource: 'KBS',
            message: 'Not enough real historical data for analysis',
            candleCount: candles.length,
          });
        }

        // 52-week extremes computed from the real candles themselves.
        const window52 = candles.slice(-252);
        const high52Week = Math.max(...window52.map((c) => c.high));
        const low52Week = Math.min(...window52.map((c) => c.low));

        const result = StockAnalysisEngine.analyze({ candles, high52Week, low52Week });
        res.json({
          symbol,
          price: candles[candles.length - 1].close,
          score: result.score,
          signal: result.signal,
          confidence: result.confidence,
          indicators: result.indicators,
          support: result.supportResistance.support,
          resistance: result.supportResistance.resistance,
          pricePosition: result.pricePosition,
          reasons: result.reasons,
          risks: result.risks,
          dataStatus: 'OK',
          dataSource: 'KBS',
          historyFrom: history.from,
          historyTo: history.to,
          candleCount: candles.length,
          high52Week,
          low52Week,
          retrievedAt: history.retrievedAt,
        });
      } catch (error) {
        if (error instanceof MarketDataUnavailableError) {
          return respondMarketDataUnavailable(res, error.source, symbol, error.reason);
        }
        throw error;
      }
    } catch (error: any) {
      console.error('Error in GET /api/analysis/' + req.params.symbol + ':', error);
      res.status(500).json({ error: error.message || 'Analysis failed' });
    }
  });

  // ========================================================
  // VITE MIDDLEWARE / STATIC ASSETS
  // ========================================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => { res.sendFile(path.join(distPath, 'index.html')); });
  }
  app.listen(PORT, '0.0.0.0', () => { console.log(`VN STOCK AI Server running on http://0.0.0.0:${PORT}`); });
}

startServer();
