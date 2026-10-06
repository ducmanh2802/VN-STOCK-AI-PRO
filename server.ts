// MUST stay first: populates process.env before the eager Postgres pool in
// src/db/index.ts is constructed. See src/db/bootstrapEnv.ts for the full rationale.
import './src/db/bootstrapEnv.ts';
import express from 'express';
import http from 'http';
import path from 'path';
import * as dotenv from 'dotenv';
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
import { getAdminAuthState } from './src/lib/firebase-admin.ts';
// PLATFORM FOUNDATION — platform layer mounts below product/feature routes.
import { createPlatformRouter, defaultProbes } from './src/lib/platform/api/createPlatformRouter.ts';
import { correlationMiddleware, securityHeaders, sendSafeError } from './src/middleware/platform/security.ts';
import { runHealthCheck, statusCodeFor } from './src/lib/platform/observability/health.ts';
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
import { RecommendationEngine } from './src/lib/analysis/strategy/RecommendationEngine.ts';
import { InvestmentHorizon } from './src/types/recommendation.ts';
import { VIETNAM_STOCKS_UNIVERSE } from './src/services/market/stockUniverse.ts';
import { cacheStats } from './src/services/market/marketDataCache.ts';
import { PaperBroker } from './src/lib/trading/paper/PaperBroker.ts';
import { TradingEngine } from './src/lib/trading/engine/TradingEngine.ts';
import { createTradingApiRouter } from './src/lib/trading/api/TradingApiRouter.ts';
import { createMacroApiRouter } from './src/lib/macro/api/macroRouter.ts';
import { MarketIntelligenceService } from './src/services/market/MarketIntelligenceService.ts';
// P0-04 — canonical bar / provenance / quality persistence, mounted so the tables
// and the repository have a real production caller instead of being orphans.
import { createCanonicalDataApiRouter } from './src/services/data/CanonicalDataApiRouter.ts';
// P1-02 / P1-04 — research lane entrypoint (AuditEngine.certify, ResearchRepository,
// DecisionJournalRepository, PointInTimeGuard).
import { createResearchApiRouter } from './src/services/research/ResearchApiRouter.ts';
// P1-09 — paper replay lane entrypoint (PaperReplayEngine, ReplayRepository).
import { createPaperReplayApiRouter } from './src/services/replay/PaperReplayApiRouter.ts';
// P1-08 — commercial lane entrypoint (entitlements, subscriptions, usage, audit).
import { createBusinessApiRouterComposition } from './src/services/business-api/BusinessApiRouterComposition.ts';
import { runAiChat } from './src/services/assistant/aiChatService.ts';

async function startServer() {
  // Local development convenience only. Google AI Studio / Cloud Run inject real
  // environment variables, and dotenv never overrides an already-set variable.
  dotenv.config();

  const app = express();
  // AI Studio forwards a dynamic port, so the port must never be hardcoded.
  const PORT = Number(process.env.PORT) || 3000;
  const HOST = process.env.HOST || '0.0.0.0';
  const httpServer = http.createServer(app);

  app.use(express.json());

  // PLATFORM FOUNDATION — correlation ids + security headers for every route (§26/§28).
  app.use(correlationMiddleware);
  app.use(securityHeaders);

  // Paper-only process-local runtime. Portfolio/account state stays in PaperBroker.
  const tradingEngine = new TradingEngine({ broker: new PaperBroker() });
  app.use('/api/trading', createTradingApiRouter(tradingEngine));

  // Macroeconomic Intelligence layer (Phase 19.1)
  app.use('/api/macro', createMacroApiRouter());

  // P0-04 — canonical market-data persistence surface:
  // POST /api/canonical-data/ingest/:symbol  (provider -> validation -> persistence
  //                                          -> provenance -> quality)
  // GET  /api/canonical-data/bars/:symbol   (point-in-time safe query)
  // GET  /api/canonical-data/quality/:symbol
  // POST /api/canonical-data/cross-source-check
  // GET  /api/canonical-data/identity/:symbol
  app.use('/api/canonical-data', createCanonicalDataApiRouter());

  // P1-02 / P1-04 — research: metrics, certification, experiments, decisions, PIT.
  // `AuditEngine.certify` is reachable only here; nothing else may claim CERTIFIED.
  app.use('/api/research', createResearchApiRouter());

  // P1-09 — paper replay: paper-only assertion, run + persistence, transitions.
  app.use('/api/replay', createPaperReplayApiRouter());

  // P1-08 — commercial layer: entitlements, subscription, usage, commercial audit.
  // Identity comes from the shared PLATFORM IdentityService; status probes fail closed.
  app.use('/api/billing', createBusinessApiRouterComposition());

  // ========================================================
  // PLATFORM FOUNDATION (identity/auth, authorization, audit, health)
  // Mounts below feature routers; owns no financial semantics.
  // ========================================================
  app.use('/api/platform', createPlatformRouter());

  // ========================================================
  // API ROUTES (Backend Data Layer over PostgreSQL / Drizzle)
  // ========================================================

  // Market-data provider reachability is observed, never assumed: a provider reports
  // AVAILABLE only once THIS process has completed a real successful fetch. No synthetic
  // or assumed-good state is ever produced.
  const providerProbes = () => {
    const keys = cacheStats().keys;
    const kbs = keys.some((k) => k.startsWith('history:'));
    const vps = keys.some((k) => k.startsWith('quote:') || k.startsWith('fundamentals:'));
    return [
      {
        name: 'marketDataKbs',
        optional: true,
        check: (): 'OK' | 'DEGRADED' => (kbs ? 'OK' : 'DEGRADED'),
      },
      {
        name: 'marketDataVps',
        optional: true,
        check: (): 'OK' | 'DEGRADED' => (vps ? 'OK' : 'DEGRADED'),
      },
    ];
  };

  app.get('/api/health', async (req, res) => {
    // A blanket `status:'ok'` while a dependency is unusable is a false green: a load
    // balancer would route traffic to a process that cannot serve its DB-backed routes.
    // The top-level status is therefore DERIVED from the same dependency probes the
    // platform readiness endpoint already uses, instead of being asserted. Liveness
    // alone is proven by /api/platform/healthz (touches no dependency).
    const cache = cacheStats();
    const report = await runHealthCheck({
      now: () => Date.now(),
      probes: [...defaultProbes(), ...providerProbes()],
    });

    res.status(statusCodeFor(report)).json({
      // 'ok' | 'degraded' | 'unavailable' — truthful, never a hardcoded pass.
      status: report.status,
      process: 'PROCESS_OK',
      ready: report.ready,
      timestamp: new Date(report.checkedAt).toISOString(),
      checkedAt: new Date(report.checkedAt).toISOString(),
      // Entry COUNT only. `cacheStats().keys` enumerates every symbol and timeframe the
      // process has fetched, and /api/health is unauthenticated — do not disclose it.
      marketDataCache: { size: cache.size },
      providers: {
        // Derived from observed real fetches in this process. 'UNVERIFIED' means "not yet
        // proven reachable", which is distinct from "broken" and from a fabricated OK.
        kbs: cache.keys.some((k) => k.startsWith('history:')) ? 'AVAILABLE' : 'UNVERIFIED',
        vps: cache.keys.some((k) => k.startsWith('quote:') || k.startsWith('fundamentals:'))
          ? 'AVAILABLE'
          : 'UNVERIFIED',
      },
      dependencyProbes: report.dependencies.map((d) => ({ name: d.name, status: d.status, optional: d.optional })),
      blockedBy: report.blockedBy,
      dependencies: {
        database: report.dependencies.find((d) => d.name === 'database')?.status === 'OK'
          ? 'DATABASE_CONFIGURED'
          : 'DATABASE_CONFIGURATION_REQUIRED',
        auth: getAdminAuthState().status,
        gemini: process.env.GEMINI_API_KEY ? 'GEMINI_CONFIGURED' : 'GEMINI_CONFIGURATION_REQUIRED',
      },
    });
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
      sendSafeError(res, 500, 'Lỗi khi đồng bộ thông tin người dùng', error);
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
      sendSafeError(res, 500, 'Lỗi khi tải danh sách cổ phiếu', error);
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
      sendSafeError(res, 500, 'Lỗi khi tìm kiếm', error);
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
      sendSafeError(res, 500, 'Lỗi hệ thống', error);
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
      sendSafeError(res, 500, 'Lỗi khi tải lịch sử giá', error);
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
      sendSafeError(res, 500, 'Lỗi khi tải dữ liệu giao dịch trong ngày', error);
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
      sendSafeError(res, 500, 'Lỗi khi tải chỉ báo kỹ thuật', error);
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
      sendSafeError(res, 500, 'Lỗi khi tải dữ liệu tài chính', error);
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
      sendSafeError(res, 500, 'Lỗi khi tải kết quả định giá', error);
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
      sendSafeError(res, 500, 'Lỗi khi tải tín hiệu khuyến nghị', error);
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
      sendSafeError(res, 500, 'Lỗi khi tính toán phân tích kỹ thuật', error);
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
      sendSafeError(res, 500, 'Lỗi khi tính toán phân tích cơ bản', error);
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

      const rawClose = latestDaily?.close != null ? Number(latestDaily.close) : NaN;
      if (!Number.isFinite(rawClose) || rawClose <= 0) {
        return res.status(404).json({
          symbol: req.params.symbol,
          dataStatus: 'DATA_UNAVAILABLE',
          error: 'Dữ liệu giá không khả dụng cho phân tích định giá',
        });
      }

      const currentPrice = rawClose;
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
      sendSafeError(res, 500, 'Lỗi khi phân tích định giá', error);
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
      sendSafeError(res, 500, 'Lỗi khi phân tích dòng tiền', error);
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
      sendSafeError(res, 500, 'Lỗi khi tải dữ liệu lịch sử thật', error);
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
      sendSafeError(res, 500, 'Lỗi khi tải giá realtime thật', error);
    }
  });

  // Market Intelligence Foundation (Phase 20)
  // Deterministic multi-factor snapshot (Regime, Breadth, Sectors, RS, Volume/Flow)
  app.get('/api/market-intelligence', async (req, res) => {
    try {
      const forceRefresh = req.query.refresh === 'true';
      const snapshot = await MarketIntelligenceService.getSnapshot({ forceRefresh });
      res.json(snapshot);
    } catch (error: any) {
      console.error('Error in GET /api/market-intelligence:', error);
      sendSafeError(res, 500, 'Market intelligence evaluation failed', error);
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
      sendSafeError(res, 500, 'Lỗi khi tải dữ liệu tài chính thật', error);
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
      sendSafeError(res, 500, 'Analysis failed', error);
    }
  });

  // ========================================================
  // PHASE 17 — AI INVESTMENT RECOMMENDATIONS (MULTI-HORIZON)
  // ========================================================

  app.get('/api/stocks/:symbol/recommendations', async (req, res) => {
    try {
      const symbol = req.params.symbol?.toUpperCase()?.trim();
      if (!symbol || !/^[A-Z0-9_.]{1,20}$/.test(symbol)) {
        return res.status(400).json({ error: 'Invalid symbol format' });
      }

      // 1. Fetch real historical candles from KBS for technical scoring
      const history = await getHistoricalStockData(symbol, '1Y').catch(() => null);
      if (!history || history.candles.length < 20) {
        return res.status(200).json({
          symbol,
          dataStatus: 'INSUFFICIENT_DATA',
          message: 'Cần ít nhất 20 phiên giao dịch thật từ KBS để phân tích khuyến nghị',
        });
      }

      const candles = history.candles;
      const window52 = candles.slice(-252);
      const high52Week = Math.max(...window52.map((c) => c.high));
      const low52Week = Math.min(...window52.map((c) => c.low));

      const technicalAnalysis = StockAnalysisEngine.analyze({ candles, high52Week, low52Week });
      const currentPrice = candles[candles.length - 1].close;

      // 2. Fetch real fundamentals from VPS if available
      const fundamentals = await getStockFundamentals(symbol).catch(() => null);
      const pe = fundamentals?.peRatio ?? null;
      const pb = fundamentals?.pbRatio ?? null;
      const roe = fundamentals?.roe ?? null;
      const eps = fundamentals?.eps ?? null;

      // 3. Score derivations
      const technicalScore = technicalAnalysis.score;
      const rsi = technicalAnalysis.indicators.rsi14;
      const momentumScore = rsi ? Math.min(100, Math.max(0, Math.round(rsi * 1.1))) : null;

      let fundamentalScore: number | null = null;
      if (roe !== null) {
        // ROE > 20% -> 80+, ROE 15% -> 65, ROE 10% -> 50
        fundamentalScore = Math.min(95, Math.max(20, Math.round(roe * 3.5 + 15)));
      }

      let valuationScore: number | null = null;
      if (pe !== null && pe > 0) {
        // PE < 12 -> 80+, PE ~15 -> 65, PE > 25 -> 40
        valuationScore = Math.min(95, Math.max(20, Math.round(110 - pe * 3)));
      }

      // Money flow estimation from last 20 candles volume and candle body direction
      const last20 = candles.slice(-20);
      const upVol = last20.filter((c) => c.close >= c.open).reduce((acc, c) => acc + c.volume, 0);
      const totalVol = last20.reduce((acc, c) => acc + c.volume, 0);
      const moneyFlowScore = totalVol > 0 ? Math.round((upVol / totalVol) * 100) : null;

      const riskScore = Math.round(
        Math.min(90, Math.max(15, ((high52Week - low52Week) / currentPrice) * 50))
      );

      const supportPrice = technicalAnalysis.supportResistance.support[0]?.price ?? null;
      const resistancePrice = technicalAnalysis.supportResistance.resistance[0]?.price ?? null;

      // 4. Generate multi-horizon recommendations
      const recommendations = RecommendationEngine.generateMultiHorizon({
        symbol,
        currentPrice,
        supportPrice,
        resistancePrice,
        fairValuePrice: (eps !== null && eps > 0 && pe !== null && pe > 0) ? Math.round(eps * 15) : null,
        peRatio: pe,
        pbRatio: pb,
        roe: roe,
        rsi: rsi,
        scores: {
          technicalScore,
          fundamentalScore,
          momentumScore,
          moneyFlowScore,
          valuationScore,
          riskScore,
        },
      });

      res.json({
        symbol,
        dataStatus: 'OK',
        currentPrice,
        recommendations,
        retrievedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error(`Error in GET /api/stocks/${req.params.symbol}/recommendations:`, error);
      sendSafeError(res, 500, 'Recommendation generation failed', error);
    }
  });

  // Strategy Rankings for Universe
  app.get('/api/recommendations/rankings', async (req, res) => {
    try {
      const strategyParam = (req.query.strategy as InvestmentHorizon) || 'SHORT_TERM';
      const validStrategies: InvestmentHorizon[] = ['SHORT_TERM', 'MEDIUM_TERM', 'LONG_TERM'];
      const strategy = validStrategies.includes(strategyParam) ? strategyParam : 'SHORT_TERM';

      // Pick leading VN30 symbols for real-time ranking
      const targetSymbols = ['HPG', 'FPT', 'VCB', 'TCB', 'MBB', 'MWG', 'MSN', 'VHM', 'SSI', 'VNM'];

      const universeData = new Map();

      await Promise.allSettled(
        targetSymbols.map(async (sym) => {
          try {
            const history = await getHistoricalStockData(sym, '6M');
            const candles = history.candles;
            if (candles.length < 20) return;

            const currentPrice = candles[candles.length - 1].close;
            const window52 = candles.slice(-120);
            const high52Week = Math.max(...window52.map((c) => c.high));
            const low52Week = Math.min(...window52.map((c) => c.low));

            const technical = StockAnalysisEngine.analyze({ candles, high52Week, low52Week });
            const rsi = technical.indicators.rsi14;
            const momentumScore = rsi ? Math.min(100, Math.max(0, Math.round(rsi * 1.1))) : null;

            const fundamentals = await getStockFundamentals(sym).catch(() => null);
            // Fail-closed fundamentals — NEVER substitute a placeholder for a missing
            // ROE / P/E / EPS. Missing values stay null (see .clinerules/20 no-mock rule).
            const roe = fundamentals?.roe ?? null;
            const pe = fundamentals?.peRatio ?? null;
            const eps = fundamentals?.eps ?? null;

            const fundamentalScore = roe !== null ? Math.min(95, Math.max(20, Math.round(roe * 3.5 + 15))) : null;
            const valuationScore = pe !== null && pe > 0 ? Math.min(95, Math.max(20, Math.round(110 - pe * 3))) : null;
            // Real 52-week-range risk (same existing formula as the single-symbol endpoint).
            const riskScore = currentPrice > 0
              ? Math.round(Math.min(90, Math.max(15, ((high52Week - low52Week) / currentPrice) * 50)))
              : null;

            // Real technical levels only; never price-multiplier placeholders.
            const supportPrice = technical.supportResistance.support[0]?.price ?? null;
            const resistancePrice = technical.supportResistance.resistance[0]?.price ?? null;

            // Money flow from the real last-20 candle volume; null when degenerate.
            const last20m = candles.slice(-20);
            const upVol = last20m.filter((c) => c.close >= c.open).reduce((acc, c) => acc + c.volume, 0);
            const totalVol = last20m.reduce((acc, c) => acc + c.volume, 0);
            const moneyFlowScore = totalVol > 0 ? Math.round((upVol / totalVol) * 100) : null;

            universeData.set(sym, {
              currentPrice,
              supportPrice,
              resistancePrice,
              fairValuePrice: eps !== null && eps > 0 && pe !== null && pe > 0 ? Math.round(eps * 15) : null,
              peRatio: pe,
              roe: roe,
              rsi: rsi,
              scores: {
                technicalScore: technical.score,
                fundamentalScore,
                momentumScore,
                moneyFlowScore,
                valuationScore,
                riskScore,
              },
            });
          } catch (e) {
            // ignore individual stock fetch errors in ranking
          }
        })
      );

      const rankingResult = RecommendationEngine.rankUniverse(
        {
          strategy,
          symbols: targetSymbols,
          minScore: 0,
        },
        universeData
      );

      res.json(rankingResult);
    } catch (error: any) {
      console.error('Error in GET /api/recommendations/rankings:', error);
      sendSafeError(res, 500, 'Rankings calculation failed', error);
    }
  });

  // ========================================================
  // AI COPILOT ADVISORY ENDPOINT
  // Server-side Gemini API proxy. Advisory only.
  // Cannot execute trades, cannot mutate balances or positions.
  // ========================================================
  app.post('/api/ai/chat', async (req, res) => {
    const { message, context } = req.body ?? {};
    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Nội dung tin nhắn không được để trống' });
    }

    const symbol =
      typeof context?.symbol === 'string' ? context.symbol.trim().toUpperCase() : undefined;
    const tab = typeof context?.tab === 'string' ? context.tab.trim() : undefined;

    // P1-03: the advisory implementation now lives in src/ so the feature registry
    // can cite a real, reachable module instead of a test-only one. ADVISORY ONLY:
    // it holds no trading authority and can never place or modify an order.
    try {
      const result = await runAiChat({ message, symbol, tab });
      return res.json(result);
    } catch (error: any) {
      console.error('Error in POST /api/ai/chat:', error);
      // `sendSafeError` terminates the response, so the advisory marker travels with it
      // rather than in a second `res.json()` (which would be a headers-already-sent throw).
      return res.status(500).json({
        error: 'Lỗi khi kết nối dịch vụ AI Copilot.',
        advisoryOnly: true,
        ...(process.env.NODE_ENV !== 'production' && error instanceof Error
          ? { dev: error.message }
          : {}),
      });
    }
  });

  // ========================================================
  // VITE MIDDLEWARE / STATIC ASSETS
  // ========================================================
  const isProduction = process.env.NODE_ENV === 'production';

  // An unmatched /api path must answer a JSON 404, never the SPA shell. Without this,
  // the wildcard fallback below answers /api/typo with index.html and HTTP 200, which
  // hides a client/server contract break behind an apparent success.
  //
  // Registered in BOTH modes on purpose. In production the SPA fallback is ours, so the
  // guard is the only thing standing between a typo and an HTML 200. In development the
  // Vite dev server applies the same rewrite, and it sits behind this guard — so a guard
  // that only existed in the production branch would leave `npm run dev` (the command
  // Google AI Studio runs by default) answering every unmatched /api path with HTML 200.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'NOT_FOUND' });
  });

  if (!isProduction) {
    // Loaded dynamically on purpose. `vite` is a devDependency, so a static
    // top-level import would emit `require("vite")` into dist/server.cjs and the
    // production server would die at startup whenever devDependencies are pruned.
    const { createServer: createViteServer } = await import('vite');
    // AI Studio sets DISABLE_HMR=true to stop the page flickering and the file watcher
    // burning CPU while an agent edits files. These are INLINE options, and inline
    // options outrank vite.config.ts, so `hmr` had to be resolved here too — otherwise
    // `hmr: { server: httpServer }` silently re-enabled HMR and defeated the flag.
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: hmrDisabled ? null : {},
        hmr: hmrDisabled ? false : { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');

    app.use(express.static(distPath));

    // A missing hashed asset must 404 as an asset. Falling through to the SPA shell would
    // return HTML with a 200 for a stale bundle reference, so a broken deploy looks healthy
    // and the browser reports a MIME error instead of a missing file.
    app.use('/assets', (_req, res) => {
      res.status(404).type('text/plain').send('Not Found');
    });

    // SPA fallback for client-side routes only. Registered last, after /api and /assets
    // have had their chance to claim the request.
    app.get('*', (_req, res) => { res.sendFile(path.join(distPath, 'index.html')); });
  }

  // A failed bind must be loud, deterministic and non-zero, never an unhandled 'error'
  // event that prints a stack and leaves the exit code ambiguous to the platform.
  httpServer.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`FATAL: cannot bind ${HOST}:${PORT} — address already in use.`);
    } else {
      console.error('FATAL: HTTP server error:', error);
    }
    process.exitCode = 1;
  });

  httpServer.listen(PORT, HOST, () => { console.log(`VN STOCK AI Server running on http://${HOST}:${PORT}`); });
}

startServer().catch((error) => {
  // A fatal startup failure must be loud and actionable, never a silent exit.
  console.error('FATAL: server failed to start:', error);
  process.exitCode = 1;
});
