# DNSE Provider Verification

**Phase 8.2A — VERIFY DNSE REAL MARKET DATA**

**Date:** 2026-09-04
**Type:** Verification only — no production code modified, no adapter built, no price invented.

---

## Result

**BLOCKED**

Verification is blocked because **no DNSE credentials are configured** in this environment/project. Without valid `DNSE_API_KEY` + `DNSE_API_SECRET`, no authenticated request to the DNSE Market Data API can be made, so no HPG market data could be fetched or verified.

---

## Credentials

**NOT_CONFIGURED**

Checked locally (without printing any secret value):

| Variable | Present? |
|---|---|
| `DNSE_API_KEY` | NO |
| `DNSE_API_SECRET` | NO |
| `MARKET_DATA_MODE` | NO |
| `MARKET_DATA_API_KEY` | NO |

Evidence gathered during this phase:
- No `.env` file exists in the project root.
- `.env.example` contains only `GEMINI_API_KEY` and `APP_URL` placeholders — nothing DNSE/market-data related.
- Source-code search found **zero** references to `DNSE`, `LightSpeed`, `lightspeed`, `DNSE_API_KEY`, `DNSE_API_SECRET`, `MARKET_DATA_MODE`, or `MARKET_DATA_API_KEY`.
- `package.json` declares no DNSE / LightSpeed SDK dependency.

Per Phase 8.2A Step 1, when credentials do not exist we report `DNSE_CREDENTIALS = NOT_CONFIGURED` and **stop**. No credentials were invented.

---

## HPG Verification

**Not performed** — no valid credentials.

- symbol: `HPG` (requested, but unverified via provider)
- exchange: `HOSE` (from app mock; provider value unverified)
- price: **UNVERIFIED** (no provider response)
- change: UNVERIFIED
- changePercent: UNVERIFIED
- open: UNVERIFIED
- high: UNVERIFIED
- low: UNVERIFIED
- volume: UNVERIFIED
- reference: UNVERIFIED
- ceiling: UNVERIFIED
- floor: UNVERIFIED
- providerTimestamp: UNVERIFIED
- receivedAt: N/A
- timezone: N/A (expected `Asia/Ho_Chi_Minh`, i.e. ICT)
- priceType: UNVERIFIED

No trading order was placed and no trading endpoint was called.

---

## Historical OHLC

**NOT_SUPPORTED / UNVERIFIED**

Not verified. A real historical OHLC request for HPG requires valid credentials. No candles were requested from any provider.

---

## Realtime

**NOT_SUPPORTED / UNVERIFIED**

The official DNSE developer portal describes the **Market Data API** as providing realtime market data:
> "Dữ liệu realtime theo biến động thị trường" — DNSE Market Data API provides real-time data following market movements, and "Đầy đủ dữ liệu của các mã, chỉ số" — full data of market instruments and indices.

This confirms the **capability exists by documentation**, but **no live realtime request was possible** in this phase (no credentials). `REALTIME` is therefore **NOT claimed** for any actual value. Per the phase rules, we do not claim REALTIME unless the provider explicitly delivers realtime data — which requires credentials to observe.

---

## Foreign Investor Data

**UNVERIFIED**

Not verified. No DNSE foreign-investor endpoint was queried (no credentials). The app's mock includes foreign-flow fields, but that is unrelated to DNSE.

---

## Rate Limits

**Not verified / undocumented here.**

The public DNSE documentation pages reachable during this phase did not expose concrete numeric rate limits. Per the hard rule **"Do not invent undocumented limits"**, no limit values are stated. Any real adapter must use the limits documented by DNSE at provisioning time (in the official spec for Market Data / LightSpeed API).

---

## Official Documentation

Only official DNSE documentation is referenced:

- https://developers.dnse.com.vn/ — DNSE OpenAPI / LightSpeed Portal (home)
- DNSE Market Data API section (linked from the portal home) — described as realtime market data, full instrument & index data, easy multi-language integration
- DNSE LightSpeed API docs (portal) — OpenAPI, RESTful standard, API Key + API Secret authentication

Note: A concrete single OpenAPI spec URL was not retrievable from the pages I could access during this phase (the portal's spec section is a viewer). I did **not** invent any endpoint path, parameter, or response schema.
---

## Security

- **Credentials remain server-side only.** No DNSE secrets are (or would be) placed in React components, frontend code, Vite-public env vars, source files, or Git.
- Any future implementation must read `DNSE_API_KEY` / `DNSE_API_SECRET` exclusively in the Express backend and proxy requests to the browser.
- Only **placeholders** would be added to `.env.example` — never real values.
- No secret value was printed or committed in this phase.

---

## Recommendation

**BLOCKED** — DNSE is **documented** as a realtime Market Data provider and is therefore a technically promising candidate, but **it cannot be confirmed or used for Phase 8.3** in its current state because:

1. No DNSE credentials are configured in this environment (`DNSE_API_KEY`, `DNSE_API_SECRET` absent; no `.env`).
2. Without credentials, HPG quote / OHLC / historical / realtime behavior could not be observed, so we **cannot claim** a real HPG price, `priceType`, provider timestamp, or candle support.
3. Concrete endpoint paths, exact response fields, and rate limits were not extracted from a reachable official spec page during this phase (and were deliberately **not invented**).

**Required to unblock Phase 8.3:**
- Provision a DNSE developer account and obtain `DNSE_API_KEY` + `DNSE_API_SECRET` (or an equivalent approved account).
- Configure them server-side (`.env`) — never in Git/frontend.
- Confirm official DNSE OpenAPI spec endpoints for: latest trade, OHLC, historical OHLC, WebSocket market data, security definition, and (if available) foreign investor data.
- Run a minimal read-only `HPG` (HOSE) quote + small historical OHLC request and record symbol, price, change, OHLCV, reference/ceiling/floor, provider timestamp, timezone, and priceType.
- Record documented rate limits.

Only after a real HPG response is observed can we truthfully set `HPG_REAL_DATA = YES` and allow Phase 8.3.

---

## FINAL STATUS

- **DNSE_VERIFICATION = BLOCKED**
- **HPG_REAL_DATA = NO**
- **PHASE_8_3_ALLOWED = NO**