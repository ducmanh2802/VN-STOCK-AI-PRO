# Market Data Provider Requirements

**Phase 8.2 — REAL MARKET DATA PROVIDER: REQUIREMENTS & INTEGRATION SPEC**
**Status:** BLOCKED — NO REAL PROVIDER CONFIGURED
**Date:** 2026-09-04

---

## 0. Verification Result

An exhaustive search of the repository (source, config, environment, `package.json`,
documentation, and `.env.example`) was performed for:

- `SSI`, `TCBS`, `VNDIRECT`, `VCI` (Vietnamese exchanges/brokers)
- `TradingView`, `Yahoo`, `Twelve Data`, `Alpha Vantage`, `Finnhub`, `EOD Historical`
- `MARKET_DATA`, `MARKET_DATA_MODE`, `MARKET_DATA_API_KEY`
- `getQuote`, `getCandles`, `priceType`, `asOfTimestamp`

**Finding: no real market-data provider is configured.**

- There is **no `.env` file** present in the repository.
- `.env.example` declares only `GEMINI_API_KEY` and `APP_URL` placeholders.
- `package.json` contains **no market-data/finance SDK** dependency (only `@google/genai`, `pg`, `drizzle-orm`, `express`, React, etc.).
- The only code mention of `SSI` / `TCBS` is in documentation as a *future* "Live Exchange Feeds" reference — **no endpoint, key, or SDK**.
- No `MARKET_DATA_MODE`, `MARKET_DATA_API_KEY`, or provider config is read anywhere in `src/` or `server.ts`.

**Therefore:** the correct action (per Phase 8.2 rules 1, 4, 15 and STEP 1) is to **STOP and produce this requirements document**. No adapter, no fake provider, and no hardcoded prices are implemented. Do **not** proceed to Phase 6A-6F.

---

## 1. Purpose

This document defines the exact contract a real Vietnamese market-data provider must
satisfy before VN STOCK AI can replace its mock layer (`MockMarketDataProvider`) with a
`RealMarketDataProvider`. All requirements are written to prevent:
- inventing market prices,
- presenting mock/latest data as realtime,
- leaking provider credentials to the browser,
- rewriting the existing analysis/scoring engines.

---

## 2. Mandatory Capabilities

The provider MUST support the full set below. A provider that only offers EOD data is
acceptable **only if** its `priceType` is truthfully reported as `EOD`, never `REALTIME`.

### 2.1 Quote Endpoint
Required fields (normalized quote):

| Field | Type | Required | Notes |
|---|---|---|---|
| `symbol` | string | yes | e.g. `HPG` (uppercase) |
| `price` | number | yes | current/last traded price in VND |
| `change` | number | yes | absolute change vs reference |
| `changePercent` | number | yes | % change vs reference |
| `open` | number | yes | session open price |
| `high` | number | yes | session high |
| `low` | number | yes | session low |
| `previousClose` | number | yes | previous session close |
| `referencePrice` | number | yes | reference price (HOSE base) |
| `ceilingPrice` | number | yes | ceiling price (HOSE limit up) |
| `floorPrice` | number | yes | floor price (HOSE limit down) |
| `volume` | number | yes | accumulated volume |
| `value` | number | yes | traded value in VND |
| `asOfTimestamp` | string | yes | provider trade timestamp, ISO 8601 |
| `timezone` | string | yes | e.g. `Asia/Hanoi` (ICT) |
| `source` | string | yes | provider name |
| `priceType` | enum | yes | `REALTIME | DELAYED | EOD | LATEST | DEMO` |
| `isRealtime` | bool | derived | = `priceType === 'REALTIME'` |
| `isDelayed` | bool | derived | = `priceType === 'DELAYED'` |

**No ambiguous price status is allowed.** One and only one `priceType` must be set.

### 2.2 Historical Candle Endpoint
Required normalized candle series:

| Field | Type | Required | Notes |
|---|---|---|---|
| `symbol` | string | yes | e.g. `HPG` |
| `range` | string | yes | `1M`, `3M`, `6M`, `1Y`, `3Y` |
| `interval` | string | yes | `1D` (daily) |
| `candles[]` | array | yes | ordered ascending by `timestamp` |
| `candles[].timestamp` | string/number | yes | ISO date or epoch (UTC / ICT documented) |
| `candles[].open` | number | yes | |
| `candles[].high` | number | yes | |
| `candles[].low` | number | yes | |
| `candles[].close` | number | yes | |
| `candles[].volume` | number | yes | |
| `source` | string | yes | provider name |

Rules:
- Do not fabricate or interpolate missing candles.
- Return only candles actually returned by the provider.
- A provider without historical candles must be reported as "candles not supported".

### 2.3 Intraday Support (optional but strongly preferred)
- If intraday is available, expose it separately (e.g. `interval='5m'`) with real
  timestamps from the provider.
- Intraday data must never be synthesized.
## 3. Vietnamese Stock Market Requirements

The provider MUST cover Vietnamese equities on the exchanges used by this app.

- **Exchanges:** HOSE (main), HNX, UPCOM.
- **`HPG` (Hoa Phát / Hoa Group) on HOSE is the primary integration target.**
- The provider must resolve the symbol `HPG` to the correct HOSE instrument and return
  its OHLCV, reference price, ceiling/floor limits, and volume.

### Reference / Ceiling / Floor
- HOSE applies daily price bands based on the reference price:
  - `referencePrice` = base reference for the session.
  - `ceilingPrice` = upper limit (HOSE cap).
  - `floorPrice` = lower limit (HOSE floor).
- The normalized quote must carry all three with the provider's own values — never derived
  from a hardcoded mock.

### Foreign Flow (optional)
- If the provider offers foreign-investor net buy/sell value/volume, expose it as
  separate fields with their own timestamps. These are `LATEST`/`EOD` by nature, not
  realtime, and must be labelled accordingly.

---

## 4. Price Type Semantics

| priceType | Meaning | Correct UI label |
|---|---|---|
| `REALTIME` | Live streaming/exchange tape, at most a few seconds old | `REALTIME · HH:MM ICT` |
| `DELAYED` | Exchange feed delayed by a fixed interval (often 15 min) | `DELAYED · HH:MM ICT` |
| `EOD` | End-of-day close (previous/current session close, not intraday) | `EOD · YYYY-MM-DD` |
| `LATEST` | Most recent available snapshot, provenance non-realtime | `LATEST · YYYY-MM-DD HH:MM` |
| `DEMO` | Mock/development data from `MockMarketDataProvider` | `DEMO` |

**Rules:**
- The UI must **never** display "Đang giao dịch" (live trading) for `DELAYED`, `EOD`,
  `LATEST`, or `DEMO` data.
- The provider's `asOfTimestamp` is authoritative; cache/dispatch timestamps must not
  replace it.

---

## 5. Authentication

- **Server-side only.** All provider credentials must live in environment variables
  (`MARKET_DATA_API_KEY`, and any `MARKET_DATA_*` secret) and be read only by the Express
  backend.
- **Never** expose the key to the browser, React code, or a Vite-public env var.
- Supported auth schemes (pick the provider's actual documented scheme — do not invent one):
  - API key header (e.g. `X-API-Key`, `Authorization: Bearer ...`)
  - OAuth2 client credentials
  - none (public endpoints)
- Credentials must be added to `.env.example` as **placeholders only**.

---

## 6. Rate Limits

Undocumented/assumed limits MUST NOT be invented. Required documentation per provider:

| Item | Required |
|---|---|
| Requests/second | from provider docs |
| Requests/min/hour/day | from provider docs |
| Concurrent connections | from provider docs |
| Realtime stream cap | from provider docs |
| Candle request volume cap | from provider docs |

The application cache (see section 8) must be sized so the polling interval never exceeds
the provider's documented rate limit.
## 7. Timestamp / Timezone

- Provider timestamps are authoritative. Preserve them verbatim.
- Normalize to ISO 8601 and record:
  - `asOfTimestamp` (provider-supplied),
  - `timezone` (e.g. `Asia/Hanoi`, ICT = UTC+7),
  - `receivedAt` (application receipt time, UTC) — used only for cache expiry, never for
    price freshness claims.
- Vietnam is UTC+7 with no DST. If the provider returns epoch seconds, convert to ICT and
  state the conversion.

---

## 8. Cache Requirements

Server-side cache in the Express backend:

| Key | TTL recommendation |
|---|---|
| quote | 5–15 s for REALTIME; 60 s for DELAYED; 15 min for EOD/LATEST |
| candles | 5–15 min for daily candles |
| status | 30–60 s |

Rules:
- Cache **must not** make stale data appear realtime.
- Response `asOfTimestamp` = original provider timestamp (never the cache write time).
- On cache hit, return cached payload with original `asOfTimestamp`.
- Respect provider rate limits when choosing TTL.

---

## 9. Error Handling

Required behavior for the normalized backend API:

| Case | Response |
|---|---|
| Unknown symbol | `404 { error: "symbol not found" }` |
| Provider down / timeout | `502` / `504` with `{ error }`, no fabricated data |
| Invalid provider payload | `502`, fail closed |
| Cache + provider both unavailable | `503`, never return stale-as-real |
| Rate limit exceeded | `429`, backoff, no fake data |

Never fall back to hardcoded/mock prices in a `MARKET_DATA_MODE=real` request unless the
mode is explicitly switched back to mock.
## 10. Integration Architecture (Target)

```
External Vietnamese Provider (HOSE/HNX/UPCOM)   e.g. SSI / TCBS / vendor
        │
        ▼
Provider Adapter  ----->   src/services/market/adapters/<provider>Adapter.ts
        │                    (map vendor shape → normalized model; add source/priceType/asOf)
        ▼
RealMarketDataProvider  ->  src/services/market/RealMarketDataProvider.ts
        │
        ▼
Normalized Market Data  ->  src/types/marketQuote.ts (Quote) + candles type
        │
        ▼
Express Backend Routes ->   GET /api/market/quote/:symbol
        │                    GET /api/market/candles/:symbol
        │                    GET /api/market/status
        ▼
React Query hooks      ->   src/hooks/useMarketQueries.ts
        │
        ▼
UI (Stock Detail)          price/change/volume + as-of + source + priceType label
```

Mode switch:
- `MARKET_DATA_MODE=mock` → `MockMarketDataProvider` (UI shows `DEMO`).
- `MARKET_DATA_MODE=real` → `RealMarketDataProvider` behind the backend (UI shows real
  status).

---

## 11. Acceptance Criteria for Phases 8.x to Proceed

A real provider may connect only once ALL of the following are verifiable with the actual
provider responses:

- [ ] Quote endpoint returns a live value for `HPG` with a provider timestamp.
- [ ] Candle endpoint returns real historical candles for `HPG` (or is confirmed unsupported).
- [ ] `priceType` is truthfully `REALTIME | DELAYED | EOD | LATEST` (never invented `REALTIME`).
- [ ] Reference/ceiling/floor come from the provider, not a mock.
- [ ] Credentials are read server-side only.
- [ ] Rate limits are documented and respected.
- [ ] `/api/market/quote/HPG` returns `{ symbol, price, asOfTimestamp, timezone, source, priceType }`.
- [ ] No analysis/scoring formula is modified.

---

## 12. What Is Required Next

1. Provision a data vendor account or use a public HOSE/HNX/UPCOM endpoint that the project
   maintainers have verified.
2. Provide the provider's official API documentation for: quote, candles, intraday (if any),
   auth, and rate limits.
3. Set the credentials in a server-side `.env` (e.g. `MARKET_DATA_MODE=real`,
   `MARKET_DATA_API_KEY=...`) — never in Git or frontend code.
4. Confirm `HPG` (HOSE) is supported and returns reference/ceiling/floor.
5. Then a follow-up implementation task (Phase 8.3) can safely build the adapter, backend
   proxy, hooks, and UI labels against the real, documented contract.

Until then VN STOCK AI remains in `DEMO` mode via `MockMarketDataProvider`.