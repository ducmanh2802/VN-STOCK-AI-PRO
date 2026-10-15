# Route QA (2026-10-15, `vite preview` of a fresh `npm run build`, static only - no backend /api)
OK (rendered <main>, no uncaught error): /watchlist /screener /stocks /portfolio /risk-center /paper-trading
/data-status /ai-analyst /learn /learn-path /learn-lesson /practice-lab /journal /fundamentals /settings, unknown path -> dashboard.
Browser back/forward restores the view (popstate + pushState verified).
Broken at runtime:
- / /dashboard /market /sector-intelligence: error state "yn.getMarketIndices is not a function" (marketService in src/services/market/index.ts exposes getIndices, useMarketQueries calls getMarketIndices)
- /recommendations: TypeError "rank is not a function" (top-level ERROR RECOVERY boundary)
- /stock/hpg: TypeError "generateAllHorizons is not a function"
- /strategy-lab and /backtest: React error #31, rendering HORIZON_LABELS value which is an object {vi,en,holding}
- /news-macro: TypeError "Cannot read properties of null (reading 'items')" (no backend in preview; page does not fail closed)
