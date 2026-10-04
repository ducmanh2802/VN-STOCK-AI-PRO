# UI REDESIGN AUDIT — VN-STOCK-AI-PRO

Scope: frontend presentation only. No backend, engine, provider, schema,
API, calculation, scoring, auth or freshness logic is touched.

---

## 1. CURRENT FRONTEND ARCHITECTURE

### 1.1 Application shell

- `src/App.tsx` — shell + client-side view router (no react-router).
  Holds all TanStack Query subscriptions, global loading/error gate, mobile
  bottom nav, modals and drawers.
- `src/components/common/Header.tsx` — top bar + market ribbon (single sticky
  `<header>`).
- `src/components/common/Sidebar.tsx` — left navigation, collapsible,
  5 groups / 16 items.
- `src/components/common/Footer.tsx` — demo-data disclaimer strip.
- `src/components/layout/CommandPalette.tsx` — Ctrl+K palette.
- `src/components/ai/AICopilot.tsx` — right drawer assistant.

### 1.2 Routing

View id strings in `src/store/useAppStore.ts` drive a conditional render chain
in `App.tsx`. `popstate` handles `/stock/:symbol` deep links only. Views:
dashboard, market, sector-intelligence, watchlist, screener/stocks, portfolio,
risk-center, paper-trading, data-status, recommendations, ai-analyst,
stock-detail, plus placeholder views (strategy-lab, backtest, fundamentals,
news-macro, journal, settings).

### 1.3 Pages

`src/pages/`: Dashboard, Market, SectorIntelligence, Watchlist,
StockScreener, Portfolio, RiskCenter, PaperTrading, DataStatus,
Recommendations, AIAnalyst, StockDetail, PhasePlaceholder.

### 1.4 Shared UI primitives (`src/components/ui/`)

Card, Badge, Button, Metric, MetricCard, ScoreRing, DataStatusBadge, Signal,
DataTable, EmptyState, LoadingState, ErrorBoundary.

### 1.5 Feature components

`components/dashboard/` (14 widgets), `components/stock/` (19),
`components/watchlist/` (8), `components/trading/macro/` (10),
`components/common/` (DemoBadge, Header, Sidebar, Footer), `components/ai/`.

### 1.6 Data layer (READ-ONLY for this sprint)

`src/hooks/useMarketQueries.ts` → `src/services/market/*` → providers
(VPS realtime/fundamentals, KBS history). Chart bundle is gated on
`dataStatus === 'OK'`; `stockDetailService` fails closed. All unavailable
semantics already exist and must be preserved verbatim.

---

## 2. FINDINGS

### F-01 — Broken top bar layout (CRITICAL)

`#input-stock-search` measures **122px** wide at 1280px viewport. Cause: the
search wrapper is `flex-1` but has no `min-w-0`/basis inside a flex row whose
siblings carry intrinsic content, so flex shrink collapses it. Result: the
placeholder is unreadable and the terminal's primary affordance is unusable.
Also the top bar is `h-16` (64px) — far too tall for a dense terminal.

### F-02 — Loading state renders one word per line (CRITICAL)

`App.tsx` wraps `LoadingState` in a flex column that lets the message collapse.
Observed: "Đang / đồng / bộ / dữ / liệu / thị / trường / và / mô / hình / định
/ lượng..." stacked vertically in a 20px column. This is the first thing a
user sees on load. `LoadingState` itself has no width guard.

### F-03 — Page container wastes horizontal space

`main > div` uses `max-w-[1480px] p-7` (28px padding). At 1920px this yields
large dead margins either side of dense terminal content. Vertical rhythm
between sections is `space-y-6/7` (24–28px), too loose for a 900px-tall
viewport that must show index state + breadth + movers together.

### F-04 — Excessive corner radius

`rounded-xl` / `rounded-2xl` present in: PortfolioPage, RiskCenterPage,
StockDetailPage, StockScreenerPage, RecommendationsPage, DataStatusPage,
CommandPalette, AddStockModal, Header (dropdown `rounded-xl`), Metric
(`rounded-lg`). Target is 2–6px.

### F-05 — Gradient / glow language in shell chrome

- `Sidebar` logo: `bg-gradient-to-tr from-indigo-600 to-violet-600` +
  `shadow-indigo-600/30`.
- `Sidebar` AI CTA: `bg-gradient-to-r from-indigo-900/30 to-violet-900/30`.
- `Header` search-dropdown: no gradient, but `rounded-xl` + `shadow-2xl`.
- `RecommendationsPage` hero: `bg-gradient-to-r from-slate-900 via-slate-900/90
to-emerald-950/40` with `rounded-2xl` — reads as a marketing banner.
- `Header` market status dot: `animate-pulse` (perpetual motion).
- `Button` ships an `accent-glow` variant name and is used as the primary
  header CTA for "AI Copilot".

### F-06 — Over-tall vertical rhythm / hero treatment on dashboard

Dashboard header is a 2-line hero (badge icon tile + eyebrow + `text-xl`
title + subtitle). Section headers repeat a decorative `h-1.5 w-1.5
rounded-full` dot three times. For a command centre this hierarchy is
inverted: chrome outweighs data.

### F-07 — Duplicated surface recipes

`bg-[#111827] border border-[#263244] rounded-xl` is hand-written in
PortfolioPage, RiskCenterPage, StockScreenerPage, DataStatusPage. The token
layer already normalises `bg-[#111827]` via `index.css`, so the literal and
the token disagree — fragile and hard to change globally.

### F-08 — Two parallel token vocabularies

`index.css` defines a canonical palette (`--color-surface`, `--color-up`, …)
_and_ a `terminal-*` alias block. UI primitives use `terminal-*`; dashboard and
stock components mix both. Result: a colour change requires N edits.

### F-09 — Typography scale is inconsistent

Headers at `text-xl`/`text-3xl` (Metric `lg`), body at `text-xs`,
financials at `text-[9px]`–`text-[11px]`. Metric `sm` renders `text-sm
sm:text-base`, so a metric changes size across breakpoints. Spec requires
financial numbers at 12–15px, large key metric ≤24px.

### F-10 — Mixed icon + emoji-free but mixed sizing

Lucide is the only icon library (good), but sizes range `w-1.5` → `w-10`
(`AlertCircle w-10 h-10` in the stock-not-found panel, `w-8` loading tile).
Decorative oversized icons dominate error/empty states.

### F-11 — Empty/loading/error states are not terminal-styled

No shared `DATA UNAVAILABLE` / `STALE` / `NO DATA` presentation primitive.
`StockDetailPage` renders its own bespoke `rounded-xl` panel; dashboard widgets
roll their own. Inconsistent with the spec's compact terminal states.

### F-12 — Animation budget

Global `transition-duration: 180ms` is applied to _every_ element
(`index.css` base rule on button/a/input/select/textarea plus section 171–179),
and `transition-duration: 200ms` on the shell. Combined with `animate-pulse`
dots in Header/StatusBadge, the UI feels busy rather than fast. Spec allows
100–180ms, subtle only.

---

## 3. WHAT IS ALREADY CORRECT — DO NOT REWRITE

- Data layer, freshness and fail-closed semantics.
- `DataTable` right-alignment, tabular numerals, sticky columns in
  `WatchlistTable`.
- `RankingsTable` / `StockRecommendationsView` markup — **test-locked** on exact
  substrings such as `>87<`, `>87.3/100<`, `>42/100<`, `KHUYẾN NGHỊ MUA`.
  These files receive class-only edits at most.
- `metrics.ts` formatters and every `lib/` engine.
- `LoadingState`, `EmptyState`, `DataStatusBadge` component APIs — reused, not
  replaced.

---

## 4. REDESIGN PLAN

| Phase | Work                                                                                                                                                                                                         |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B     | Consolidate tokens: promote `terminal-*` aliases to the single source; add density/border-radius/typography scales; cut blanket 180ms transition; add `.tnum`, `.panel`, `.panel-header` primitives.         |
| C     | Rebuild Header (top bar h-11, fixed search flex bug, compact ribbon, terminal status chip) and Sidebar (no gradient, grouped compact nav, restrained AI entry). Fix App container density + loading wrapper. |
| D     | Dashboard: replace hero header with `PageHeader`, convert `space-y-6` stack into labelled panel rows with tight gaps.                                                                                        |
| E     | StockDetail: replace bespoke error panel with terminal state; radius/density normalisation; keep chart + gated data logic untouched.                                                                         |
| F     | Radius/gradient cleanup on Portfolio, RiskCenter, Screener, DataStatus, Recommendations, modals, Metric.                                                                                                     |
| G     | Terminal empty/loading/error states, responsive collapse, a11y labels.                                                                                                                                       |

---

## 5. ACCEPTANCE GUARDRAILS

- No change under `src/lib/**`, `src/services/**`, `src/db/**`, `server.ts`.
- No new hardcoded market values. Every number stays bound to existing props.
- No test file modified.
- `tsc --noEmit`, `vitest run`, `vite build` must all pass.
