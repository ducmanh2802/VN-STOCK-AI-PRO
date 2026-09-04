# VN STOCK AI — ARCHITECTURE & CODEBASE AUDIT REPORT
**Lead Software Architect Assessment**  
*Document Version: 1.0.0 | Date: 2026-09-03 | Status: Production Audit Baseline*

---

## EXECUTIVE SUMMARY

**VN STOCK AI** is a financial web application designed as an institutional-grade stock analysis platform tailored for Vietnamese retail investors (HOSE, HNX, UPCOM). 

The platform currently stands at **Phase 1 (Dashboard & Market Foundation)** with an established dark financial terminal aesthetic (`#0B0E14` slate palette), comprehensive Vietnamese market mock database (25+ equities), reactive filtering and watchlisting, and an abstracted Data Provider contract layer (`MarketDataProvider`).

This audit provides an exhaustive evaluation of the existing repository, its strengths, architectural bottlenecks, technical debt, and an actionable migration blueprint toward subsequent phases without disrupting working code.

---

## 1. COMPREHENSIVE INVENTORY & ANALYSIS

### 1.1 Current Framework & Core Stack
- **Client Framework**: React 19.0.1 (latest major release).
- **Bundler & Tooling**: Vite 6.2.3 with `@vitejs/plugin-react` 5.0.4.
- **Styling Engine**: Tailwind CSS v4.1.14 using the native `@tailwindcss/vite` plugin and `@import "tailwindcss"` in `src/index.css`.
- **Language**: TypeScript 5.8.2 in strict ES2022 / ESNext bundler resolution mode.
- **Motion & Interactions**: `motion` 12.23.24 for component transitions.
- **Data Visualization**: `recharts` 3.10.1 installed; inline lightweight vector SVG sparklines in current UI widgets.
- **Iconography**: `lucide-react` 0.546.0.

### 1.2 Folder Structure
The repository is structured with modular separation:
```
/
├── .env.example                # Declared runtime environment variables (GEMINI_API_KEY, APP_URL)
├── index.html                  # HTML entry point (title, viewport, root mount)
├── metadata.json               # Platform capabilities & application permissions
├── package.json                # Project dependencies and script declarations
├── tsconfig.json               # TS compiler configuration with path alias '@/*'
├── vite.config.ts              # Vite plugins and configuration
└── src/
    ├── main.tsx                # Client DOM mount entry point
    ├── App.tsx                 # Root layout, primary state controller, view router, modals
    ├── index.css               # Global Tailwind CSS imports and scrollbar styling
    ├── components/
    │   ├── common/
    │   │   ├── DemoBadge.tsx   # Visual indicator for simulated market data
    │   │   ├── Footer.tsx      # Financial disclaimers, data freshness, version info
    │   │   ├── Header.tsx      # Live index ticker ribbon, global search, market status
    │   │   └── Sidebar.tsx     # Navigation sidebar with Phase status badges
    │   ├── dashboard/
    │   │   ├── AIMarketSummaryCard.tsx # Qualitative & quantitative market summary
    │   │   ├── MarketHeatmap.tsx       # Sector performance breakdown & leader stocks
    │   │   ├── MarketOverview.tsx      # VN-INDEX, VN30, HNX, UPCOM cards with sparklines
    │   │   ├── TopMovers.tsx           # Gainers, losers, liquidity volume leaders
    │   │   └── WatchlistWidget.tsx     # Dashboard compact watchlist widget
    │   └── stock/
    │       └── StockQuickViewModal.tsx # Fast multi-metric modal for selected stock
    ├── data/
    │   └── mock/
    │       └── marketData.ts   # 820+ lines of realistic Vietnamese market mock records
    ├── pages/
    │   ├── AIAnalystPage.tsx          # Market-wide AI summary & ethical data guidelines
    │   ├── DashboardPage.tsx          # Composite Phase 1 dashboard grid
    │   ├── MarketPage.tsx             # Sector and index breakdown analysis
    │   ├── PhasePlaceholderPage.tsx   # Structured roadmaps for Phases 2 through 10
    │   ├── StocksPage.tsx             # Comprehensive stock screener with multi-criteria filters
    │   └── WatchlistPage.tsx          # Full-screen tabular watchlist manager
    ├── services/
    │   └── market/
    │       ├── MarketDataProvider.ts     # Data access interface export
    │       ├── MockMarketDataProvider.ts # Concrete mock provider implementation
    │       └── index.ts                  # Singleton provider instance & barrel exports
    ├── types/
    │   ├── market.ts           # Indices, market states, and AI summary interfaces
    │   ├── provider.ts         # MarketDataProvider interface definition
    │   └── stock.ts            # StockSummary, TopMover, SectorHeatmapItem
    └── utils/
        └── formatters.ts       # Currency (VND), billion VND, volume, and percentage formatters
```

### 1.3 Existing UI & Visual Design
- **Theme**: Financial Terminal Dark Theme (`#0B0E14` primary dark background, `#111622` card surfaces, `#1E293B` / `slate-800` borders, subtle `blue-600` brand accents).
- **Typography**: Dual-font hierarchy using Inter/system sans for textual data and JetBrains Mono/monospace font families for numeric data (prices, ratios, volume, scores).
- **Navigation**: Dual-navigation model featuring a fixed desktop sidebar (collapsible on mobile), top header bar with live running index ribbons, and a fixed mobile bottom navigation bar (`lg:hidden`).
- **Feedback & States**: Clean loading spinner, error banners with retry triggers, and explicit "DEMO" badges to comply with strict financial transparency.

### 1.4 Existing Components
1. **`Header`**: Displays ticker tape for VN-INDEX, VN30, HNX-INDEX, UPCOM-INDEX, search bar with debounce-ready input, and market state pill (`ĐANG GIAO DỊCH` / `ĐÓNG CỬA`).
2. **`Sidebar`**: Vertical navigation tabs with route keys, phase status tags (`Phase 1` active vs `Phase 2–10` planned), and system connectivity ping.
3. **`Footer`**: Regulatory disclaimers, data model status, and platform copyright.
4. **`MarketOverview`**: High-density 4-column cards with SVG-rendered sparkline charts, advance/decline ratios, ceiling/floor counters, and intraday percentage movements.
5. **`MarketHeatmap`**: Grid of 11 sectors displaying daily return, market cap in billion VND, number of component stocks, and leader tickers.
6. **`TopMovers`**: Tabbed widget sorting top 5 gainers, top 5 losers, and top 5 most active volume stocks.
7. **`WatchlistWidget`**: Dashboard-embedded table with fast symbol link navigation, price change highlights, and removal actions.
8. **`AIMarketSummaryCard`**: Structured financial narrative breaking down trend score (0–100), market trend, money flow, strong/weak sectors, and risk alerts.
9. **`StockQuickViewModal`**: Modal dialog detailing price, trading value, market cap, P/E, P/B, ROE, RSI(14), reference/ceiling/floor, estimated fair value, upside percentage, and AI score.
10. **`DemoBadge`**: Standardized reusable badge ensuring visual transparency across all widgets.

### 1.5 Existing API
- **Current State**: Client-side standalone application.
- **Backend API**: Currently, no active Express backend routes exist. Although `express` 4.21.2 and `@google/genai` 2.4.0 are declared in `package.json`, Vite currently serves the application directly on port 3000 (`vite --port=3000 --host=0.0.0.0`).
- **Data Abstraction**: The application uses a service provider interface pattern (`MarketDataProvider`), with all queries directed through `MockMarketDataProvider`. All data retrieval methods (`getMarketIndices`, `getSectorHeatmap`, `getTopMovers`, `getWatchlist`, `searchStocks`, `getStockDetail`, `getAIMarketSummary`) return asynchronous Promises, which matches standard REST/WebSocket client patterns.

### 1.6 Existing Database
- **Persistent Cloud Database**: None currently provisioned (no PostgreSQL, Cloud SQL, or Firestore instances).
- **In-Memory Store**: A structured mock database of 25 Vietnamese stocks (`MOCK_STOCKS_DATABASE`) covering prominent tickers across HOSE, HNX, and UPCOM (e.g., VCB, HPG, FPT, SSI, VNM, MWG, TCB, MBB, DGC, KDH).
- **Client Persistence**: Browser `localStorage` (`vn_stock_ai_watchlist`) is used for persisting user-curated watchlist symbols between sessions.

### 1.7 Existing Stock Data Model
Defined in `src/types/stock.ts`:
- **`StockSummary`**:
  - Tickers & Company: `symbol`, `companyName`, `exchange` ('HOSE' | 'HNX' | 'UPCOM'), `sector`.
  - Intraday Pricing: `price`, `change`, `changePercent`, `open`, `high`, `low`, `refPrice`, `ceilingPrice`, `floorPrice`.
  - Liquidity & Scale: `volume`, `tradingValue` (tỷ VND), `marketCap` (tỷ VND).
  - Financial Ratios: `pe`, `pb`, `roe`.
  - Technical & Valuation: `rsi`, `trend` ('UPTREND' | 'DOWNTREND' | 'SIDEWAY'), `aiScore` (0–100), `fairValue` (VND), `sparkline` (`number[]`).
  - Compliance: `isDemo: true`.

### 1.8 Existing Technical Indicators
- **Current Available Indicators**:
  - `RSI` (Relative Strength Index, 14 periods) stored as a single scalar value.
  - `Trend` classification ('UPTREND' | 'DOWNTREND' | 'SIDEWAY').
  - Intraday `sparkline` (8 points) representing normalized intra-session price motion.
- **Omissions**:
  - No historical OHLCV candlestick time series (e.g., 1D, 1W, 1M historical bars).
  - No moving average arrays (MA20, MA50, MA200, EMA12, EMA26).
  - No oscillator indicators (MACD line, signal line, histogram).
  - No volatility bands (Bollinger Bands upper/middle/lower, ATR).
  - No volume indicators (OBV, Volume SMA20, VWAP).

### 1.9 Existing TypeScript Errors
- **Audit Verification**: Execution of `tsc --noEmit` / `lint_applet` passed with **0 errors**.
- Type safety across all components, interfaces, and services is 100% compliant with TypeScript 5.8.

### 1.10 Existing Dependencies
- **Production (`dependencies`)**:
  - `@google/genai`: `^2.4.0` (Google Gen AI SDK for server-side Gemini intelligence)
  - `@tailwindcss/vite`: `^4.1.14`
  - `@vitejs/plugin-react`: `^5.0.4`
  - `dotenv`: `^17.2.3`
  - `express`: `^4.21.2` (Available for backend proxying)
  - `lucide-react`: `^0.546.0`
  - `motion`: `^12.23.24`
  - `react`: `^19.0.1`
  - `react-dom`: `^19.0.1`
  - `recharts`: `^3.10.1`
  - `vite`: `^6.2.3`
- **Development (`devDependencies`)**:
  - `@types/express`: `^4.17.21`
  - `@types/node`: `^22.14.0`
  - `autoprefixer`: `^10.4.21`
  - `esbuild`: `^0.25.0`
  - `tailwindcss`: `^4.1.14`
  - `tsx`: `^4.21.0`
  - `typescript`: `~5.8.2`

---

## 2. ARCHITECTURAL PROBLEMS & LIMITATIONS

1. **Monolithic State Management in `App.tsx`**:
   - `App.tsx` directly owns all top-level state: `indices`, `sectors`, `topMovers`, `watchlist`, `allStocks`, `aiSummary`, `currentView`, `isLoading`, `error`.
   - Any state update forces re-evaluation of all child pages.
   - There is no React Context, Zustand store, or TanStack Query cache to manage asynchronous lifecycle, cache invalidation, or background polling.

2. **Simulated Static Data (No Real-Time Tick Engine)**:
   - Data is loaded once during `useEffect` mount. There is no WebSocket client or periodic polling interval simulating live tick changes in prices, bids/asks, or order book updates.
   - The sparklines consist of static 8-point hardcoded arrays without timestamp correlation.

3. **Missing Backend Server Execution (`server.ts`)**:
   - Although `@google/genai`, `express`, and `dotenv` are installed, the application currently runs as a client-side SPA.
   - Any future live Gemini AI analysis or external stock API proxying requires a backend server to guard API keys and prevent CORS violations.

4. **Lack of Historical Time-Series Engine**:
   - The data model only holds snapshot indicators (`rsi: 61.5`). It lacks historical OHLCV data structures required to render interactive candlestick charts or compute technical indicators on the fly.

---

## 3. TECHNICAL DEBT

1. **Ad-Hoc Page Routing**:
   - Navigation between pages is managed via a manual `currentView` string state (`'dashboard' | 'market' | 'stocks' | 'watchlist' | 'ai-analyst' | 'phase-X'`).
   - Browser back/forward navigation and URL bookmarking (`window.location.hash` or HTML5 history) are not synchronized.

2. **Watchlist Persistence Coupling**:
   - `MockMarketDataProvider` directly accesses browser `localStorage`.
   - In sandboxed iframe environments or incognito modes with restricted storage, this falls back gracefully, but there is no remote synchronization or multi-device persistence.

3. **Deterministic Calculations Embedded in Mock Data**:
   - Ratios like P/E, P/B, Fair Value, and AI Score are pre-baked in `marketData.ts` rather than generated by pure valuation functions from underlying balance sheet / income statement numbers.

---

## 4. MISSING MODULES (ROADMAP GAP ANALYSIS)

| Module / Phase | Status | Missing Capabilities |
| :--- | :--- | :--- |
| **Phase 1: Dashboard Foundation** | **Completed** | Full overview, sector heatmap, top movers, stock directory, watchlist widget, AI market summary. |
| **Phase 2: Real-time Market Stream** | *Planned* | WebSocket/SSE client, price tick engine, simulated live trades, order book (Sổ lệnh 3 giá mua / 3 giá bán). |
| **Phase 3: Stock Screener Pro** | *Planned* | Advanced multi-metric filter engine (P/E range, ROE threshold, RSI overbought/oversold, MA crossovers). |
| **Phase 4: Financial Statements** | *Planned* | Balance sheet (Bảng CĐKT), Income statement (Báo cáo KQKD), Cash flow (Lưu chuyển tiền tệ), historical quarterly/annual trends. |
| **Phase 5: Technical Charting** | *Planned* | Interactive candlestick charts (Lightweight Charts / Recharts), multi-timeframe OHLCV bars (1D, 1W, 1M), MA/EMA/MACD overlays. |
| **Phase 6: Valuation Models** | *Planned* | Deterministic valuation calculators: Discounted Cash Flow (DCF), Graham Formula, P/E multiple model, Sensitivity analysis matrix. |
| **Phase 7: Deep AI Stock Analyst** | *Planned* | Server-side Gemini API proxy, investment thesis generator, Bull/Base/Bear scenarios, earnings report summarization. |
| **Phase 8: Alerts & Backtesting** | *Planned* | Price alert triggers, indicator breakout alerts, strategy rule backtester with historical win-rate. |
| **Phase 9: Portfolio Tracker** | *Planned* | Buy/sell trade logging, portfolio P&L calculation, asset allocation pie charts, dividend tracking. |
| **Phase 10: Live Data Integration** | *Planned* | Production market data adapters (SSI iBoard, Vietstock, TCBS, or FireAnt connectors) implementing `MarketDataProvider`. |

---

## 5. RECOMMENDED TARGET ARCHITECTURE

```
                               ┌────────────────────────────────────────┐
                               │           Client Layer (React)         │
                               └──────────────────┬─────────────────────┘
                                                  │
                ┌─────────────────────────────────┴────────────────────────────────┐
                ▼                                                                  ▼
┌───────────────────────────────┐                                ┌───────────────────────────────────┐
│     UI Presentation Layer     │                                │     Client State & Data Cache     │
│  - Terminal Dashboard Views   │                                │  - MarketContext / Zustand Store  │
│  - Financial Data Grids       │◄───────────────────────────────┤  - Watchlist Manager              │
│  - Interactive Charts         │                                │  - Real-time Tick Subscriber      │
└───────────────────────────────┘                                └─────────────────┬─────────────────┘
                                                                                   │
                                                                 ┌─────────────────▼─────────────────┐
                                                                 │   Data Abstraction Layer (SDK)    │
                                                                 │     interface MarketDataProvider   │
                                                                 └─────────────────┬─────────────────┘
                                                                                   │
                                   ┌───────────────────────────────────────────────┴─────────────────────────────┐
                                   ▼                                                                             ▼
                ┌──────────────────────────────────────┐                                      ┌──────────────────────────────────────┐
                │        MockDataProvider (Local)      │                                      │       HttpMarketDataProvider         │
                │  - In-Memory VN Stocks Database      │                                      │  - Connects to /api/market/*         │
                │  - Simulated Tick Emitter            │                                      │  - Connects to /api/stocks/*         │
                └──────────────────────────────────────┘                                      └──────────────────┬───────────────────┘
                                                                                                                 │
                                                                                                                 ▼
                                                                                      ┌──────────────────────────────────────┐
                                                                                      │         Express Backend (Node.js)    │
                                                                                      │  - Port 3000 Unified Server          │
                                                                                      │  - Server-Side Gemini AI Endpoint    │
                                                                                      │  - Market Data Aggregator & Cache    │
                                                                                      └──────────────────┬───────────────────┘
                                                                                                         │
                                                                                                         ▼
                                                                                      ┌──────────────────────────────────────┐
                                                                                      │      External Providers & Models     │
                                                                                      │  - Google GenAI (Gemini 2.5 Flash)   │
                                                                                      │  - Live Exchange Feeds (SSI / TCBS)  │
                                                                                      └──────────────────────────────────────┘
```

### Architectural Principles:
1. **Preserve Working Code**: The existing `MarketDataProvider` interface and UI components remain completely intact. Any new data service simply implements the same interface.
2. **Server-Side AI Isolation**: All Gemini 2.5 Flash API calls are executed strictly within `/api/ai/*` server routes to protect credentials and sanitize inputs.
3. **Deterministic Financial Math**: Financial calculations (DCF, Graham value, RSI, MACD, percentage changes) must be computed with pure deterministic TypeScript functions, never guessed or generated by LLMs.
4. **Gradual Decoupling**: Introduce a light React Context (`MarketContext`) to decouple `App.tsx` from granular widget state without requiring heavy external dependencies.

---

## 6. MIGRATION STRATEGY

### Phase A: Non-Breaking Architectural Enhancement (Current Step)
- Retain all existing working components and pages.
- Keep `MockMarketDataProvider` active as the primary reliable provider.
- Formalize indicator calculation utilities (`src/utils/indicators.ts`) to compute true technical indicators (SMA, EMA, RSI, MACD) from price arrays.

### Phase B: Full-Stack Server Integration
- Introduce `server.ts` binding Express on port `3000` with Vite development middleware.
- Configure scripts in `package.json` (`dev: tsx server.ts`, `build: vite build && esbuild server.ts ...`).
- Implement `/api/ai/market-summary` and `/api/ai/stock-analysis/:symbol` using `@google/genai` (Gemini 2.5 Flash).

### Phase C: Time-Series & Interactive Charting Engine (Phase 5)
- Extend `stock.ts` with `OHLCVBar` types.
- Seed realistic historical daily bars for prominent stocks in `marketData.ts`.
- Integrate interactive candlestick and volume charts into `StockQuickViewModal` and a dedicated Stock Detail view.

### Phase D: Financial Statements & Quantitative Valuation (Phases 4 & 6)
- Add quarterly financial records (Doanh thu, Lợi nhuận sau thuế, Biên lãi gộp, Nợ vay/VCSH).
- Implement pure TypeScript valuation models (DCF, P/E band, Graham).

### Phase E: Live Market Data Adapters (Phase 10)
- Create `HttpMarketDataProvider` implementing `MarketDataProvider`.
- Allow zero-downtime switching between `MockMarketDataProvider` and `HttpMarketDataProvider` via configuration.

---

## CONCLUSION
The VN STOCK AI codebase is cleanly structured, strongly typed with zero compile errors, visually polished according to financial terminal standards, and architected with an interface-driven separation of concerns. It is positioned for iterative expansion without requiring any refactoring or deletion of working features.
