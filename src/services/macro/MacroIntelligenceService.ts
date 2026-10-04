/**
 * PHASE 25+ — MACRO INTELLIGENCE SERVICE
 * ========================================
 * Production orchestrator service providing cached, real-data-first Macroeconomic Intelligence.
 *
 * Invariants:
 *   - In-memory 60s TTL cache (MACRO_SNAPSHOT_CACHE_TTL_MS = 60_000)
 *   - Key namespace isolation: 'MACRO_RADAR_SNAPSHOT_' + asOfDate
 *   - REAL DATA ONLY (P27-D2-legacy): metric VALUES resolve exclusively from
 *     persisted `macro_observations`. Static descriptor metadata (names, units,
 *     categories) is display vocabulary, never market data. Codes without
 *     persisted rows are omitted; an empty store yields an UNKNOWN regime —
 *     frozen samples are never served as a live feed.
 */

import { cacheGet, cacheSet } from '../market/marketDataCache.ts';
import {
  MacroSnapshotBuilder,
  type MacroCategory,
  type MacroMetricRecord,
  type MacroRadarSnapshot,
  type MacroTrendDirection,
} from '../../lib/analysis/macro/index.ts';
import {
  DrizzleMacroRegimeDataSource,
  type MacroRegimeDataSource,
} from '../macro-regime/MacroRegimeDataProvider.ts';
import type { MacroObservation } from '../../lib/macro-regime/index.ts';

const SNAPSHOT_CACHE_KEY_PREFIX = 'MACRO_RADAR_SNAPSHOT';
const SNAPSHOT_CACHE_TTL_MS = 60_000; // 60 seconds

export interface GetMacroSnapshotOptions {
  readonly asOfDate?: string;
  readonly forceRefresh?: boolean;
  /** Injected real-data source (defaults to the DB-backed provider). */
  readonly dataSource?: MacroRegimeDataSource;
  /** Pre-built metric records (test injection / offline simulation only). */
  readonly metricsOverride?: readonly MacroMetricRecord[];
}

interface MetricDescriptor {
  readonly name: string;
  readonly nameVi: string;
  readonly category: MacroCategory;
  readonly country: 'US' | 'VN' | 'GLOBAL' | 'EU' | 'CN' | 'JP';
  readonly unit: string;
  readonly isBenchmark: boolean;
  readonly description: string;
}

/**
 * Static DISPLAY vocabulary (P27-D2-legacy): names, categories and units for
 * known macro codes. Carries no market values — every number comes from the
 * persisted observations feed.
 */
const METRIC_DESCRIPTORS: Readonly<Record<string, MetricDescriptor>> = {
  FED_FUNDS_RATE: { name: 'Fed Funds Rate', nameVi: 'Lãi suất điều hành Fed (FFR)', category: 'CENTRAL_BANK', country: 'US', unit: '%', isBenchmark: true, description: 'Lãi suất quỹ liên bang mục tiêu do FOMC quyết định.' },
  US_10Y_YIELD: { name: 'US 10Y Treasury Yield', nameVi: 'Lợi suất TPCP Mỹ 10 năm', category: 'INTEREST_RATE', country: 'US', unit: '%', isBenchmark: true, description: 'Lợi suất trái phiếu chính phủ Mỹ kỳ hạn 10 năm chuẩn.' },
  US_2Y_YIELD: { name: 'US 2Y Treasury Yield', nameVi: 'Lợi suất TPCP Mỹ 2 năm', category: 'INTEREST_RATE', country: 'US', unit: '%', isBenchmark: false, description: 'Lợi suất trái phiếu kỳ hạn 2 năm nhạy cảm với lãi suất điều hành.' },
  VN_DEPOSIT_RATE: { name: 'Vietnam 12M Deposit Rate', nameVi: 'Lãi suất huy động 12T bình quân', category: 'INTEREST_RATE', country: 'VN', unit: '%', isBenchmark: true, description: 'Lãi suất tiền gửi tiết kiệm kỳ hạn 12 tháng tại các NHTM lớn.' },
  SBV_REFINANCING_RATE: { name: 'SBV Refinancing Rate', nameVi: 'Lãi suất tái cấp vốn NHNN', category: 'CENTRAL_BANK', country: 'VN', unit: '%', isBenchmark: false, description: 'Lãi suất tái cấp vốn Ngân hàng Nhà nước.' },
  SBV_OMO_RATE: { name: 'SBV OMO Rate', nameVi: 'Lãi suất OMO NHNN', category: 'CENTRAL_BANK', country: 'VN', unit: '%', isBenchmark: false, description: 'Lãi suất nghiệp vụ thị trường mở Ngân hàng Nhà nước.' },
  VN_CREDIT_GROWTH: { name: 'Credit Growth YTD', nameVi: 'Tăng trưởng tín dụng toàn hệ thống YTD', category: 'LIQUIDITY', country: 'VN', unit: '% YTD', isBenchmark: false, description: 'Tốc độ tăng trưởng dư nợ tín dụng nền kinh tế so với đầu năm.' },
  VN_M2_GROWTH: { name: 'M2 Money Supply Growth', nameVi: 'Tăng trưởng cung tiền M2', category: 'LIQUIDITY', country: 'VN', unit: '% YoY', isBenchmark: false, description: 'Tốc độ tăng trưởng tổng phương tiện thanh toán M2.' },
  US_DXY: { name: 'US Dollar Index (DXY)', nameVi: 'Chỉ số USD (DXY)', category: 'CURRENCY', country: 'US', unit: 'Points', isBenchmark: true, description: 'Sức mạnh đồng USD so với rổ 6 đồng tiền chủ chốt.' },
  USD_VND: { name: 'USD/VND Interbank Rate', nameVi: 'Tỷ giá USD/VND liên ngân hàng', category: 'CURRENCY', country: 'VN', unit: 'VND', isBenchmark: true, description: 'Tỷ giá giao dịch USD/VND thị trường liên ngân hàng.' },
  BRENT_OIL: { name: 'Brent Crude Oil', nameVi: 'Giá dầu Brent thế giới', category: 'COMMODITY', country: 'GLOBAL', unit: 'USD/bbl', isBenchmark: true, description: 'Giá dầu thô Brent giao ngay chuẩn quốc tế.' },
  GLOBAL_GOLD: { name: 'Spot Gold Price', nameVi: 'Giá Vàng thế giới (XAU/USD)', category: 'COMMODITY', country: 'GLOBAL', unit: 'USD/oz', isBenchmark: true, description: 'Giá vàng giao ngay quốc tế (USD/ounce).' },
  GLOBAL_VIX: { name: 'CBOE Volatility Index (VIX)', nameVi: 'Chỉ số Biến động VIX (Chỉ số Sợ hãi)', category: 'GLOBAL_RISK', country: 'US', unit: 'Points', isBenchmark: true, description: 'Thước đo kỳ vọng biến động quyền chọn S&P 500 trong 30 ngày.' },
  VN_CPI: { name: 'Vietnam CPI YoY', nameVi: 'Lạm phát CPI Việt Nam (YoY)', category: 'ECONOMY', country: 'VN', unit: '% YoY', isBenchmark: false, description: 'Chỉ số giá tiêu dùng bình quân so với cùng kỳ.' },
  VN_GDP_GROWTH: { name: 'Vietnam Real GDP Growth', nameVi: 'Tăng trưởng GDP thực tế Việt Nam', category: 'ECONOMY', country: 'VN', unit: '% YoY', isBenchmark: false, description: 'Tốc độ tăng trưởng tổng sản phẩm nội địa GDP thực tế.' },
  HOSE_FOREIGN_FLOW: { name: 'HOSE Foreign Net Flow', nameVi: 'Giao dịch ròng khối ngoại HOSE', category: 'VIETNAM_MARKET', country: 'VN', unit: 'VND', isBenchmark: false, description: 'Giá trị mua/bán ròng của khối ngoại trên HOSE.' },
};

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export class MacroIntelligenceService {
  private static readonly defaultDataSource: MacroRegimeDataSource = new DrizzleMacroRegimeDataSource();

  /**
   * Retrieves or builds the canonical MacroRadarSnapshot from persisted observations.
   */
  public static async getSnapshot(
    options?: GetMacroSnapshotOptions
  ): Promise<MacroRadarSnapshot> {
    const asOfDate = options?.asOfDate ?? new Date().toISOString().slice(0, 10);
    const cacheKey = `${SNAPSHOT_CACHE_KEY_PREFIX}_${asOfDate}`;

    if (!options?.forceRefresh && !options?.metricsOverride) {
      const cached = cacheGet<MacroRadarSnapshot>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const metrics = options?.metricsOverride ?? (await this.resolveMetrics(asOfDate, options?.dataSource));
    const snapshot = MacroSnapshotBuilder.buildSnapshot({
      metrics,
      asOfDate,
    });

    if (!options?.metricsOverride) {
      cacheSet(cacheKey, snapshot, SNAPSHOT_CACHE_TTL_MS);
    }
    return snapshot;
  }

  private static async resolveMetrics(
    asOfDate: string,
    dataSource?: MacroRegimeDataSource
  ): Promise<MacroMetricRecord[]> {
    const source = dataSource ?? this.defaultDataSource;
    let observations: readonly MacroObservation[] = [];
    try {
      const result = await source.fetchObservations({ asOfDate });
      observations = result.observations;
    } catch {
      observations = [];
    }
    return mapObservationsToRecords(observations, asOfDate);
  }
}

/**
 * Maps persisted observations to display records (P27-D2-legacy). Only codes
 * with a known descriptor AND at least one persisted row produce a record;
 * values, changes and freshness come exclusively from the feed.
 */
export function mapObservationsToRecords(
  observations: readonly MacroObservation[],
  asOfDate: string
): MacroMetricRecord[] {
  const byCode = new Map<string, MacroObservation[]>();
  for (const obs of observations) {
    if (!METRIC_DESCRIPTORS[obs.metricCode]) continue;
    const list = byCode.get(obs.metricCode) ?? [];
    list.push(obs);
    byCode.set(obs.metricCode, list);
  }

  const records: MacroMetricRecord[] = [];
  for (const [code, list] of byCode) {
    const descriptor = METRIC_DESCRIPTORS[code];
    const sorted = [...list].sort((a, b) => {
      if (a.observationDate !== b.observationDate) return a.observationDate < b.observationDate ? 1 : -1;
      return b.revisionVersion - a.revisionVersion;
    });
    const latest = sorted[0];
    const previous = sorted.find((o) => o.observationDate < latest.observationDate && finiteOrNull(o.value) !== null);

    const value = finiteOrNull(latest.value);
    const previousValue = previous ? finiteOrNull(previous.value) : null;
    const change = value !== null && previousValue !== null ? Number((value - previousValue).toFixed(4)) : null;
    const changePercent =
      change !== null && previousValue !== null && previousValue !== 0
        ? Number(((change / Math.abs(previousValue)) * 100).toFixed(2))
        : null;

    let direction: MacroTrendDirection = 'UNKNOWN';
    if (changePercent !== null) {
      direction = changePercent > 0.5 ? 'RISING' : changePercent < -0.5 ? 'FALLING' : 'STABLE';
    } else if (value !== null) {
      direction = 'STABLE';
    }

    records.push({
      id: `MACRO_${code}`,
      code,
      name: descriptor.name,
      nameVi: descriptor.nameVi,
      category: descriptor.category,
      country: descriptor.country,
      value,
      previousValue,
      change,
      changePercent,
      unit: latest.unit || descriptor.unit,
      direction,
      source: latest.source,
      timestamp: `${latest.publicationDate}T00:00:00.000Z`,
      period: latest.periodId ?? latest.observationDate,
      freshness: latest.freshnessStatus,
      isBenchmark: descriptor.isBenchmark,
      description: descriptor.description,
    });
  }

  records.sort((a, b) => (a.code < b.code ? -1 : 1));
  return records;
}
