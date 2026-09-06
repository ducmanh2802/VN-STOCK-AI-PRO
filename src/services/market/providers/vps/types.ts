/**
 * VPS Securities realtime data feed types (bgapidatafeed.vps.com.vn).
 *
 * Endpoints (public, no API key, no auth):
 *   - Quote:        GET https://bgapidatafeed.vps.com.vn/getliststockdata/{SYMBOL}
 *   - Fundamentals: GET https://bgapidatafeed.vps.com.vn/getliststockbaseinfo/{SYMBOL}
 *
 * UNIT SEMANTICS — verified 2026-09-06 by cross-checking the live VPS quote for
 * HPG against the live KBS daily bar for the SAME session (2026-09-04):
 *
 *   VPS quote                                  KBS bar (same session)
 *   lastPrice  = 21.7        --x1000--> 21700  close   = 21700  ✓
 *   openPrice  = "21.75"     --x1000--> 21750  open    = 21750  ✓
 *   highPrice  = "21.8"      --x1000--> 21800  high    = 21800  ✓
 *   lowPrice   = "21.6"      --x1000--> 21600  low     = 21600  ✓
 *   lot        = 1392090     --x10  --> 13920900  volume = 13920900 ✓
 *   closePrice = "21600.0"   (already VND)      = previous session close (KBS 2026-09-03 close = 21600) ✓
 *   r / c / f  = 21.6 / 23.1 / 20.1 (kVND)      = reference / ceiling / floor
 *   fBValue    = 2.8088076E7 kVND = 28.09 B VND (= fBVol 129368 lots x 10 x 21700 VND) ✓
 *
 * Therefore:
 *   - `lastPrice`, `openPrice`, `highPrice`, `lowPrice`, `avePrice`, `r`, `c`, `f`
 *     are quoted in THOUSANDS of VND (kVND) -> multiply by 1000.
 *   - `closePrice` is ALREADY in VND and holds the reference / previous-session close.
 *   - `lot`, `fBVol`, `fSVolume` are in LOTS; 1 lot = 10 shares.
 *   - `fBValue`, `fSValue` are in THOUSANDS of VND.
 *   - `fRoom` is in shares.
 *   - `changePc` is a percentage string ("0.46" == +0.46 %).
 *
 * The normalization itself lives in `normalize.ts` and is unit-tested; the quote
 * service additionally cross-checks the normalized last price against the latest
 * KBS close before it is used anywhere.
 */

// ---------------------------------------------------------------------------
// Raw quote payload (getliststockdata) — array with a single element per symbol.
// Fields arrive as number OR string (vendor is inconsistent, e.g. "21.8",
// "21600.0", "2.8088076E7" scientific notation) OR null.
// ---------------------------------------------------------------------------
export interface VpsRawQuote {
  sym?: string;
  /** Last matched price, kVND. */
  lastPrice?: number | string | null;
  /** Session open, kVND. */
  openPrice?: number | string | null;
  /** Session high, kVND. */
  highPrice?: number | string | null;
  /** Session low, kVND. */
  lowPrice?: number | string | null;
  /** Volume-weighted average price, kVND. */
  avePrice?: number | string | null;
  /** Reference / previous-session close, ALREADY VND (not kVND). */
  closePrice?: number | string | null;
  /** Reference price, kVND (== closePrice / 1000). */
  r?: number | string | null;
  /** Ceiling price, kVND. */
  c?: number | string | null;
  /** Floor price, kVND. */
  f?: number | string | null;
  /** Change vs reference, percent string. */
  changePc?: number | string | null;
  /** Accumulated matched volume, LOTS (1 lot = 10 shares). */
  lot?: number | string | null;
  /** Volume of the last matched trade, LOTS. */
  lastVolume?: number | string | null;
  /** Foreign buy volume, LOTS. */
  fBVol?: number | string | null;
  /** Foreign buy value, kVND. */
  fBValue?: number | string | null;
  /** Foreign sell volume, LOTS. */
  fSVolume?: number | string | null;
  /** Foreign sell value, kVND. */
  fSValue?: number | string | null;
  /** Remaining foreign room, shares. */
  fRoom?: number | string | null;
  [field: string]: unknown;
}
// ---------------------------------------------------------------------------
// Raw fundamentals payload (getliststockbaseinfo)
// ---------------------------------------------------------------------------
export interface VpsRawPeriod {
  TermCode?: string;
  TermName?: string;
  TermNameEN?: string;
  YearPeriod?: number | string | null;
  PeriodEnd?: string | null;
  PeriodBegin?: string | null;
  /** 1-based slot index the source uses for this period (Row 1 == newest slot). */
  Row?: number | string | null;
  ID?: number | string | null;
  DisplayOrdering?: number | string | null;
  TotalRow?: number | string | null;
  [field: string]: unknown;
}

export interface VpsRawStatementRow {
  Name?: string | null;
  NameEn?: string | null;
  /** Value for value-slot V1 (newest slot per source ordering). */
  Value1?: number | string | null;
  Value2?: number | string | null;
  Value3?: number | string | null;
  Value4?: number | string | null;
  Vl?: number | string | null;
  Unit?: string | null;
  UnitEn?: string | null;
  ReportNormID?: number | string | null;
  ReportComponentNameEn?: string | null;
  [field: string]: unknown;
}

export interface VpsRawBaseInfo {
  symbol?: string;
  coban?: Record<string, unknown> | null;
  /** Quarterly period metadata (observed: stale/inconsistent with values). */
  ttQuy?: VpsRawPeriod[];
  /** Quarterly income statement rows. */
  ketquaKDQuy?: VpsRawStatementRow[];
  /** Quarterly balance sheet rows. */
  candoiKTQuy?: VpsRawStatementRow[];
  /** Quarterly financial ratio rows. */
  chisoTCQuy?: VpsRawStatementRow[];
  /** Annual period metadata (observed: array of empty objects — NO labels). */
  ttNam?: VpsRawPeriod[];
  /** Annual income statement rows. */
  ketquaKDNam?: VpsRawStatementRow[];
  /** Annual balance sheet rows. */
  candoiKTNam?: VpsRawStatementRow[];
  /** Annual financial ratio rows. */
  chisoTCNam?: VpsRawStatementRow[];
  [field: string]: unknown;
}

// ---------------------------------------------------------------------------
// Normalized application-side types
// ---------------------------------------------------------------------------
export interface VpsNormalizedQuote {
  symbol: string;
  source: 'VPS';
  fetchedAt: string;
  /** Last matched price, VND/share (source lastPrice x 1000). */
  lastPrice: number;
  /** Session open, VND/share. */
  openPrice: number | null;
  /** Session high, VND/share. */
  highPrice: number | null;
  /** Session low, VND/share. */
  lowPrice: number | null;
  /** Volume-weighted average price, VND/share. */
  averagePrice: number | null;
  /** Reference / previous-session close, VND/share (source closePrice, already VND). */
  referencePrice: number | null;
  /** Ceiling price, VND/share. */
  ceilingPrice: number | null;
  /** Floor price, VND/share. */
  floorPrice: number | null;
  /** Absolute change vs reference, VND (derived from two real source fields). */
  change: number | null;
  /** Percent change vs reference (source changePc). */
  changePercent: number | null;
  /** Accumulated matched volume, SHARES (source lot x 10). */
  matchedVolumeShares: number | null;
  /** Foreign buy volume, SHARES. */
  foreignBuyVolumeShares: number | null;
  /** Foreign buy value, VND. */
  foreignBuyValueVnd: number | null;
  /** Foreign sell volume, SHARES. */
  foreignSellVolumeShares: number | null;
  /** Foreign sell value, VND. */
  foreignSellValueVnd: number | null;
  /** Remaining foreign room, SHARES. */
  foreignRoomShares: number | null;
}

/** Value slot as provided by the fundamentals endpoint. */
export type VpsValueSlot = 'V1' | 'V2' | 'V3' | 'V4';

export const VPS_VALUE_SLOTS: readonly VpsValueSlot[] = ['V1', 'V2', 'V3', 'V4'] as const;

/** Period label exactly as provided by the source metadata (or null). */
export interface VpsPeriodLabel {
  slot: VpsValueSlot;
  /** Human-readable source label, e.g. "Quý 2 2021" — null when source has none. */
  sourceLabel: string | null;
  termCode: string | null;
  yearPeriod: number | null;
  /** Source PeriodEnd raw value, e.g. "202106". */
  periodEnd: string | null;
}

/**
 * A financial series in source slot order V1..V4.
 * `null` = the source did not report a value for that slot (never fabricated).
 */
export interface VpsFinancialSeries {
  /** Net revenue, MILLION VND (unit cross-checked, see VpsNormalizedFundamentals). */
  netRevenue: (number | null)[];
  grossProfit: (number | null)[];
  operatingProfit: (number | null)[];
  netProfit: (number | null)[];
  totalAssets: (number | null)[];
  liabilities: (number | null)[];
  equity: (number | null)[];
  /** Trailing EPS, VND/share. */
  eps: (number | null)[];
  /** Book value per share, VND/share. */
  bvps: (number | null)[];
  /** Price-to-earnings, multiple (as computed by the source at its snapshot date). */
  pe: (number | null)[];
  /** Return on sales (ROS), %. */
  ros: (number | null)[];
  /** Return on equity (source ROEA), %. */
  roe: (number | null)[];
  /** Return on assets (source ROAA), %. */
  roa: (number | null)[];
}

export interface VpsNormalizedFundamentals {
  symbol: string;
  source: 'VPS';
  fetchedAt: string;
  /**
   * Statement value unit. Cross-checked 2026-09-06: HPG annual net revenue V1 =
   * 90,118,503 == published HPG FY2022 revenue of 90,118 billion VND -> MILLION VND.
   */
  statementUnit: 'MILLION_VND';
  quarterly: VpsFinancialSeries;
  annual: VpsFinancialSeries;
  /** Source period labels per slot, verbatim where present. */
  quarterlyPeriods: VpsPeriodLabel[];
  annualPeriods: VpsPeriodLabel[];
  periodMetadata: {
    /**
     * The source's period metadata did not align with the reported values when
     * verified (ttQuy labels appear stale; ttNam provides no labels at all).
     * Values are real, but their period mapping is NOT reliable.
     */
    mappingStatus: 'AMBIGUOUS';
    /** Never true for this endpoint: no period can be confirmed as current. */
    isCurrentPeriodConfirmed: false;
    notes: string[];
  };
  dataStatus: 'OK';
}