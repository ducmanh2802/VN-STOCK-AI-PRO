# PHASE 19.1 — MACRO INTELLIGENCE FOUNDATION & DATA CONTRACT

**System**: VN STOCK AI PRO  
**Module**: Macroeconomic Intelligence Architecture  
**Status**: ACTIVE / VERIFIED  
**Version**: 19.1.0  

---

## 1. ARCHITECTURE OVERVIEW

Phase 19.1 establishes a production-grade, fail-closed foundation for macroeconomic intelligence data across the **United States** (Federal Reserve, US Treasury, BLS/FRED) and **Vietnam** (State Bank of Vietnam, General Statistics Office, Ministry of Finance) economic domains.

```text
       ┌────────────────────────────────────────────────────────┐
       │   Canonical Macro Indicator & Source Registries        │
       │   (US & VN Indicators, Authoritative Source Providers) │
       └───────────────────────────┬────────────────────────────┘
                                   │
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │             Macro Data Validation Layer                │
       │   - Fail-Closed Rule Engine                            │
       │   - Timestamp, Frequency, & Range Verification         │
       │   - Strict No-Mock / No-Synthetic Data Enforcement     │
       └───────────────────────────┬────────────────────────────┘
                                   │
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │              Centralized Freshness Policy              │
       │   - DAILY (72h), WEEKLY (10d), MONTHLY (45d),          │
       │     QUARTERLY (120d), EVENT (90d)                      │
       └───────────────────────────┬────────────────────────────┘
                                   │
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │            Read-Only Macro Service Contract            │
       │   - MacroDataProvider Interface                        │
       │   - EmptyMacroDataProvider (Safe Baseline NO_DATA)     │
       │   - Express API Endpoints (/api/macro/*)               │
       └────────────────────────────────────────────────────────┘
```

The layer acts as a strict verification barrier before macroeconomic signals can influence downstream quantitative models, regime classification engines, or investment strategies.

---

## 2. MACRO DATA LIFECYCLE

1. **Ingestion Contract (`MacroDataProvider`)**:
   External data providers fetch raw observations from authorized institutional feeds.
2. **Structural & Semantic Validation (`MacroDataValidator`)**:
   Every incoming observation is verified against its canonical registry definition (code, country, category, frequency, value bounds, negative allowance).
3. **Temporal & Freshness Check (`MacroFreshnessPolicy`)**:
   Observation timestamps are checked for clock skew / future timestamps. Data exceeding maximum frequency age thresholds is explicitly flagged as `STALE`.
4. **Immutability & Audit**:
   Observations are returned as readonly domain objects with explicit status (`VALID`, `STALE`, `INVALID`, `NO_DATA`) and source confidence scores (`0.0` to `1.0`).
5. **Consumption**:
   Read-only API routes and internal analytical services consume verified macroeconomic records without risk of corrupted or fabricated values.

---

## 3. TYPE SYSTEM CONTRACTS

Located in `src/types/macro.ts` and `src/lib/macro/types.ts`:

### Core Types
- `MacroSource`: `'FED' | 'FRED' | 'US_TREASURY' | 'SBV' | 'GSO_VIETNAM' | 'MOF_VIETNAM'`
- `MacroIndicatorCategory`: `'INTEREST_RATE' | 'INFLATION' | 'EMPLOYMENT' | 'LIQUIDITY' | 'CURRENCY' | 'GROWTH' | 'CENTRAL_BANK_POLICY'`
- `MacroFrequency`: `'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'EVENT'`
- `MacroDataStatus`: `'VALID' | 'STALE' | 'INVALID' | 'NO_DATA'`
- `MacroCountry`: `'US' | 'VN' | 'GLOBAL'`

### `MacroIndicator` Observation Interface
```typescript
export interface MacroIndicator {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly country: MacroCountry;
  readonly category: MacroIndicatorCategory;
  readonly value: number | null;
  readonly previousValue: number | null;
  readonly expectedValue?: number | null;
  readonly unit: string;
  readonly observationDate: string; // ISO Date e.g. "2026-03-01"
  readonly publishedAt: string;     // ISO Timestamp e.g. "2026-03-12T13:30:00Z"
  readonly source: MacroSource;
  readonly sourceUrl: string;
  readonly frequency: MacroFrequency;
  readonly status: MacroDataStatus;
  readonly confidence: number;      // 0.0 - 1.0
  readonly metadata?: Readonly<Record<string, unknown>>;
}
```

---

## 4. CANONICAL REGISTRIES

### A. US / Federal Reserve Indicators (`src/lib/macro/registry/indicatorRegistry.ts`)
| Code | Name | Category | Unit | Frequency | Default Source |
|---|---|---|---|---|---|
| `FED_FUNDS_RATE` | Federal Funds Effective Rate | `INTEREST_RATE` | `%` | `DAILY` | `FED` |
| `FED_POLICY_STANCE` | Fed Policy Stance / Score | `CENTRAL_BANK_POLICY` | `Score (-1 to +1)` | `EVENT` | `FED` |
| `FOMC_NEXT_MEETING` | Next FOMC Meeting Schedule | `CENTRAL_BANK_POLICY` | `Epoch ms / Days` | `EVENT` | `FED` |
| `US_CPI` | US Consumer Price Index (YoY) | `INFLATION` | `% YoY` | `MONTHLY` | `FRED` |
| `US_CORE_CPI` | US Core CPI (YoY) | `INFLATION` | `% YoY` | `MONTHLY` | `FRED` |
| `US_PCE` | US Headline PCE Price Index | `INFLATION` | `% YoY` | `MONTHLY` | `FRED` |
| `US_CORE_PCE` | US Core PCE Price Index | `INFLATION` | `% YoY` | `MONTHLY` | `FRED` |
| `US_UNEMPLOYMENT` | US Unemployment Rate (U-3) | `EMPLOYMENT` | `%` | `MONTHLY` | `FRED` |
| `US_NFP` | US Non-Farm Payrolls Change | `EMPLOYMENT` | `Thousands` | `MONTHLY` | `FRED` |
| `US_10Y_YIELD` | US 10-Year Treasury Yield | `INTEREST_RATE` | `%` | `DAILY` | `US_TREASURY` |
| `US_2Y_YIELD` | US 2-Year Treasury Yield | `INTEREST_RATE` | `%` | `DAILY` | `US_TREASURY` |
| `US_DXY` | US Dollar Index (DXY) | `CURRENCY` | `Index Points` | `DAILY` | `FRED` |
| `FED_BALANCE_SHEET` | Fed Total Assets (QT/QE) | `LIQUIDITY` | `Trillion USD` | `WEEKLY` | `FRED` |

### B. Vietnam / SBV & GSO Indicators
| Code | Name | Category | Unit | Frequency | Default Source |
|---|---|---|---|---|---|
| `SBV_REFINANCING_RATE` | Lãi suất tái cấp vốn NHNN | `INTEREST_RATE` | `%` | `EVENT` | `SBV` |
| `SBV_DISCOUNT_RATE` | Lãi suất tái chiết khấu NHNN | `INTEREST_RATE` | `%` | `EVENT` | `SBV` |
| `SBV_OMO_RATE` | Lãi suất nghiệp vụ OMO | `INTEREST_RATE` | `%` | `DAILY` | `SBV` |
| `VN_DEPOSIT_RATE` | Lãi suất huy động tiền gửi bình quân 12T | `INTEREST_RATE` | `%` | `MONTHLY` | `SBV` |
| `VN_LENDING_RATE` | Lãi suất cho vay bình quân | `INTEREST_RATE` | `%` | `MONTHLY` | `SBV` |
| `VN_CREDIT_GROWTH` | Tăng trưởng tín dụng hệ thống | `LIQUIDITY` | `%` | `MONTHLY` | `SBV` |
| `VN_CPI` | Chỉ số giá tiêu dùng CPI Việt Nam (YoY) | `INFLATION` | `% YoY` | `MONTHLY` | `GSO_VIETNAM` |
| `VN_GDP_GROWTH` | Tăng trưởng GDP Việt Nam (YoY) | `GROWTH` | `% YoY` | `QUARTERLY` | `GSO_VIETNAM` |
| `USD_VND` | Tỷ giá USD/VND trung tâm & liên ngân hàng | `CURRENCY` | `VND` | `DAILY` | `SBV` |
| `VN_M2_GROWTH` | Tăng trưởng cung tiền M2 | `LIQUIDITY` | `% YoY` | `MONTHLY` | `SBV` |

### C. Source Registry (`src/lib/macro/registry/sourceRegistry.ts`)
- `FED`: Board of Governors of the Federal Reserve System (Official)
- `FRED`: Federal Reserve Bank of St. Louis Economic Data
- `US_TREASURY`: United States Department of the Treasury
- `SBV`: State Bank of Vietnam (Ngân hàng Nhà nước Việt Nam)
- `GSO_VIETNAM`: General Statistics Office of Vietnam (Tổng cục Thống kê)
- `MOF_VIETNAM`: Ministry of Finance Vietnam (Bộ Tài chính)

---

## 5. VALIDATION RULES (`MacroDataValidator`)

1. **Identifier & Code**: Must exist and match a registered code in `MACRO_INDICATOR_REGISTRY`.
2. **Metadata Integrity**: `country` and `category` must match the registry definition.
3. **Source Authorization**: `source` must be registered in `MACRO_SOURCE_REGISTRY` with `reliabilityScore >= 0.8` and `enabled: true`.
4. **Numeric Validity**:
   - `null` is the only valid representation for unavailable data (with status `NO_DATA`).
   - If numeric, must be finite (`typeof === 'number' && Number.isFinite()`).
   - `allowNegative: false` strictly rejects negative values (e.g. `USD_VND`).
   - Bounds (`minValue`, `maxValue`) are strictly enforced when defined.
5. **Temporal Consistency**:
   - `publishedAt` and `observationDate` must be valid ISO date strings.
   - Future timestamps (> reference time + 5m clock skew) are strictly rejected as invalid.
   - Only `EVENT` indicators (e.g., scheduled FOMC meetings) may have future `observationDate`.
6. **Confidence Bounds**: `confidence` must be in `[0.0, 1.0]`.

---

## 6. FRESHNESS POLICY (`MacroFreshnessPolicy`)

Centralized thresholds configured in `src/lib/macro/freshness/MacroFreshnessPolicy.ts`:

- **DAILY**: 72 hours (3 days, accounting for weekends)
- **WEEKLY**: 10 days
- **MONTHLY**: 45 days (accounting for reporting publication lags)
- **QUARTERLY**: 120 days (accounting for 90-day quarter + 30-day reporting lag)
- **EVENT**: 90 days (configurable based on event cycles)

Data older than its frequency threshold is automatically classified with `status: 'STALE'`.

---

## 7. STRICT NO-MOCK-DATA POLICY

To protect quantitative accuracy and institutional trust:
- **Zero random values** (`Math.random()`, seeded pseudo-randoms).
- **Zero synthetic/mock rates** (no fake 4.5% interest rate or hardcoded 3.2% inflation placeholders).
- **Zero substitution of null with 0** (missing data is strictly `null` with `status: 'NO_DATA'`).
- The default baseline provider (`EmptyMacroDataProvider`) returns explicit `NO_DATA` records.

---

## 8. FUTURE PHASES ROADMAP

- **Phase 19.2**: FRED Live API Provider (US CPI, PCE, NFP, Unemployment, DXY, Fed Balance Sheet).
- **Phase 19.3**: US Treasury & Federal Reserve Direct Ingestion (Yield Curve, FOMC statements).
- **Phase 19.4**: SBV & GSO Vietnam Ingestion Adapters (Policy rates, central USD/VND, CPI, GDP).
- **Phase 19.5**: Macro Regime Classification Engine (Hawkish/Dovish, Inflationary/Deflationary, Risk-On/Risk-Off).
- **Phase 19.6**: Recommendation Scoring Integration & Macro Intelligence Dashboard UI.

---

## 9. KNOWN LIMITATIONS (PHASE 19.1)

- Live network adapters to FRED / SBV are not connected in Phase 19.1 (by architectural design).
- `EmptyMacroDataProvider` acts as the active fail-closed baseline returning `status: 'NO_DATA'`.
- All read-only endpoints (`/api/macro/*`) return clean metadata and `NO_DATA` indicator placeholders without fabricating data.
