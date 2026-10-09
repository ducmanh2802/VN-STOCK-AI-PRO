import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Globe,
  RefreshCw,
  AlertTriangle,
  Server,
  Activity,
  Filter,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { MetricCard } from '../components/ui/MetricCard';
import { DataStatusBadge } from '../components/ui/DataStatusBadge';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { MacroRadar } from '../components/trading/macro/MacroRadar';
import type { MacroRadarSnapshot } from '../lib/analysis/macro/types';
import type { MacroIndicator } from '../types/macro';
import { formatNumber, formatPercent } from '../utils/formatters';

interface StatusPayload {
  readonly phase?: string;
  readonly health?: {
    readonly providerName?: string;
    readonly status?: string;
    readonly message?: string;
    readonly lastChecked?: string;
  };
  readonly timestamp?: string;
}

interface IndicatorsPayload {
  readonly indicators?: readonly MacroIndicator[];
  readonly count?: number;
  readonly note?: string;
}

interface MarketIntelligenceLite {
  readonly dataFreshness?: string;
  readonly regime?: { readonly regime?: string; readonly confidence?: number };
}

interface LoadState<T> {
  readonly status: 'idle' | 'loading' | 'success' | 'error';
  readonly data: T | null;
  readonly message: string | null;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    // Both shapes are in use: legacy `{ error: "msg" }` and the list routes'
    // `{ error: { code, message } }`.
    const raw = (body as { error?: string | { message?: string } } | null)?.error;
    const message = typeof raw === 'string' ? raw : raw?.message;
    throw new Error(message ?? `HTTP ${res.status} khi gọi ${url}`);
  }
  return body as T;
}

// ---------------------------------------------------------------------------
// News / macro list routes (shared repository + service server-side)
// ---------------------------------------------------------------------------

type ListKey = 'news' | 'policy' | 'earnings' | 'observations';

const LIST_ENDPOINTS: Readonly<Record<ListKey, string>> = {
  news: '/api/news?limit=10',
  policy: '/api/policy-events?limit=10',
  earnings: '/api/earnings-calendar?limit=10',
  observations: '/api/macro/observations?limit=10',
};

const LIST_LABELS: Readonly<Record<ListKey, string>> = {
  news: 'Tin tức',
  policy: 'Chính sách',
  earnings: 'Lịch BCTC',
  observations: 'Quan sát vĩ mô',
};

interface NewsMacroItem {
  readonly key: string;
  readonly kind: string;
  readonly id: number;
  readonly symbol: string | null;
  readonly title: string;
  readonly summary: string | null;
  readonly source: string;
  readonly sourceTier: string | null;
  readonly url: string | null;
  readonly canonicalTimestamp: string;
  readonly extra?: Readonly<Record<string, string | number | null>>;
}

interface NewsMacroListPayload {
  readonly kind?: string;
  readonly items?: readonly NewsMacroItem[];
  readonly count?: number;
  readonly nextCursor?: string | null;
  readonly dataStatus?: string;
  readonly retrievedAt?: string;
}

function listStatus(item: NewsMacroItem): string | null {
  const extra = item.extra ?? {};
  if (item.kind === 'MACRO_OBSERVATION') return (extra.freshnessStatus as string) ?? null;
  if (item.kind === 'EARNINGS_EVENT') return (extra.status as string) ?? null;
  if (item.kind === 'POLICY_EVENT') return (extra.status as string) ?? null;
  return (extra.sentiment as string) ?? null;
}

function listSecondary(item: NewsMacroItem): string | null {
  const extra = item.extra ?? {};
  if (item.kind === 'NEWS') return item.summary;
  if (item.kind === 'POLICY_EVENT') return (extra.documentNumber as string) ?? null;
  if (item.kind === 'EARNINGS_EVENT') return (extra.reportDate as string) ?? null;
  if (item.kind === 'MACRO_OBSERVATION') {
    const value = extra.value;
    return value === null || value === undefined
      ? `${(extra.frequency as string) ?? ''}`.trim() || null
      : `${value} ${extra.unit ?? ''}`.trim();
  }
  return null;
}


const REGIME_LABELS: Readonly<Record<string, string>> = {
  STRONG_BULL: 'BÒ MẠNH',
  BULL: 'BÒ',
  NEUTRAL: 'TRUNG TÍNH',
  BEAR: 'GẤU',
  STRONG_BEAR: 'GẤU MẠNH',
  HIGH_VOLATILITY: 'BIẾN ĐỘNG MẠNH',
  RISK_OFF: 'THOÁI HIỂM',
  UNKNOWN: 'CHƯA XÁC ĐỊNH',
};

function statusBadge(status: string | undefined): 'up' | 'down' | 'secondary' | 'accent' {
  if (status === 'VALID') return 'up';
  if (status === 'STALE') return 'accent';
  if (status === 'NO_DATA' || status === 'INVALID') return 'down';
  return 'secondary';
}

async function loadOne<T>(
  setter: React.Dispatch<React.SetStateAction<LoadState<T>>>,
  url: string
): Promise<void> {
  try {
    const data = await fetchJson<T>(url);
    setter({ status: 'success', data, message: null });
  } catch (err) {
    setter({
      status: 'error',
      data: null,
      message: err instanceof Error ? err.message : 'Không tải được dữ liệu',
    });
  }
}

/**
 * PHASE 19.1 / 25+ / 27 — NEWS & MACRO INTELLIGENCE
 *
 * Three fail-closed layers, none of which can invent a number:
 *   - Macro Radar snapshot (regime, transmission chains, sector sensitivity,
 *     calendar, alerts) built server-side from persisted observations.
 *   - Indicator registry with explicit VALID / STALE / NO_DATA status.
 *   - Market regime from the KBS-backed Market Intelligence snapshot.
 */
export const MacroNewsPage: React.FC = () => {
  const [radar, setRadar] = useState<LoadState<MacroRadarSnapshot>>({
    status: 'idle',
    data: null,
    message: null,
  });
  const [indicators, setIndicators] = useState<LoadState<IndicatorsPayload>>({
    status: 'idle',
    data: null,
    message: null,
  });
  const [status, setStatus] = useState<LoadState<StatusPayload>>({
    status: 'idle',
    data: null,
    message: null,
  });
  const [market, setMarket] = useState<LoadState<MarketIntelligenceLite>>({
    status: 'idle',
    data: null,
    message: null,
  });
  const [countryFilter, setCountryFilter] = useState<'ALL' | 'VN' | 'US' | 'GLOBAL'>('ALL');
  const [loading, setLoading] = useState(false);
  const [listTab, setListTab] = useState<ListKey>('news');
  const [lists, setLists] = useState<Record<ListKey, LoadState<NewsMacroListPayload>>>({
    news: { status: 'idle', data: null, message: null },
    policy: { status: 'idle', data: null, message: null },
    earnings: { status: 'idle', data: null, message: null },
    observations: { status: 'idle', data: null, message: null },
  });

  const loadList = useCallback(async (key: ListKey) => {
    setLists((prev) => ({ ...prev, [key]: { status: 'loading', data: null, message: null } }));
    try {
      const data = await fetchJson<NewsMacroListPayload>(LIST_ENDPOINTS[key]);
      setLists((prev) => ({ ...prev, [key]: { status: 'success', data, message: null } }));
    } catch (err) {
      setLists((prev) => ({
        ...prev,
        [key]: {
          status: 'error',
          data: null,
          message: err instanceof Error ? err.message : 'Không tải được danh sách',
        },
      }));
    }
  }, []);

  const loadAll = useCallback(
    async (forceRefresh = false) => {
      setLoading(true);
      await Promise.all([
        loadOne<MacroRadarSnapshot>(
          setRadar,
          `/api/macro/radar${forceRefresh ? '?refresh=true' : ''}`
        ),
        loadOne<IndicatorsPayload>(setIndicators, '/api/macro/indicators'),
        loadOne<StatusPayload>(setStatus, '/api/macro/status'),
        loadOne<MarketIntelligenceLite>(setMarket, '/api/market-intelligence'),
        loadList('news'),
        loadList('policy'),
        loadList('earnings'),
        loadList('observations'),
      ]);
      setLoading(false);
    },
    [loadList]
  );

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const allIndicators = useMemo(
    () => indicators.data?.indicators ?? [],
    [indicators.data]
  );

  const visibleIndicators = useMemo(
    () =>
      countryFilter === 'ALL'
        ? allIndicators
        : allIndicators.filter((i) => i.country === countryFilter),
    [allIndicators, countryFilter]
  );

  const withData = allIndicators.filter((i) => i.value !== null).length;
  const regime = market.data?.regime?.regime ?? 'UNKNOWN';
  const regimeLabel = REGIME_LABELS[regime] ?? regime;

  return (
    <div id="page-news-macro" className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-terminal-border">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-600/20 border border-teal-500/30 flex items-center justify-center text-teal-400">
              <Globe className="w-4 h-4" />
            </div>
            <h1 className="page-title">Macro &amp; Tin tức Vĩ mô</h1>
            <DataStatusBadge
              status={
                loading
                  ? 'LOADING'
                  : radar.status === 'error'
                    ? 'DATA_UNAVAILABLE'
                    : radar.data?.dataFreshness === 'CURRENT'
                      ? 'LIVE'
                      : 'PARTIAL'
              }
              compact
            />
          </div>
          <p className="text-xs text-terminal-text-muted mt-1">
            Chế độ thị trường, chuỗi truyền dẫn chính sách, độ nhạy ngành và lịch sự kiện — tất cả
            đều fail-closed khi thiếu quan sát.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          leftIcon={RefreshCw}
          isLoading={loading}
          onClick={() => loadAll(true)}
        >
          Đồng bộ lại
        </Button>
      </div>

      {/* Headline metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="CHẾ ĐỘ THỊ TRƯỜNG"
          value={regimeLabel}
          subValue={`Điểm tin cậy ${formatNumber(market.data?.regime?.confidence, 0)}`}
          badge={regime === 'UNKNOWN' ? 'UNKNOWN' : 'DETERMINISTIC'}
          badgeVariant={regime === 'UNKNOWN' ? 'warning' : 'success'}
          icon={Activity}
          status={market.data?.dataFreshness === 'CURRENT' ? 'LIVE' : 'PARTIAL'}
        />
        <MetricCard
          label="CHỈ BÁO CÓ GIÁ TRỊ"
          value={`${withData} / ${allIndicators.length}`}
          subValue="Quan sát thực có số; còn lại là NO_DATA"
          badge={withData > 0 ? 'REAL' : 'NO_DATA'}
          badgeVariant={withData > 0 ? 'success' : 'danger'}
          status={withData > 0 ? 'LIVE' : 'DATA_UNAVAILABLE'}
        />
        <MetricCard
          label="MACRO RADAR"
          value={radar.data?.dataFreshness ?? (radar.status === 'error' ? 'UNAVAILABLE' : '…')}
          subValue={
            radar.data
              ? `${radar.data.allMetrics.length} chỉ số · ${radar.data.dataLineage.engineVersion}`
              : radar.message ?? 'Chưa tải'
          }
          badge={radar.data ? `${radar.data.upcomingEvents.length} SỰ KIỆN` : '—'}
          badgeVariant="indigo"
          status={radar.data ? 'LIVE' : 'DATA_UNAVAILABLE'}
        />
        <MetricCard
          label="NHÀ CUNG CẤP MACRO"
          value={status.data?.health?.status ?? '…'}
          subValue={status.data?.health?.providerName ?? status.message ?? 'Đang kiểm tra'}
          badge="FAILOVER"
          badgeVariant="neutral"
          icon={Server}
          status={status.data?.health?.status === 'NO_DATA' ? 'DATA_UNAVAILABLE' : 'PARTIAL'}
        />
      </div>

      {/* Failure strip */}
      {(radar.status === 'error' || indicators.status === 'error') && (
        <div className="flex items-start gap-2.5 bg-amber-950/30 border border-amber-800/40 rounded-md p-3.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-300 font-mono">
            <div className="font-semibold uppercase text-[11px] mb-0.5">
              Một hoặc nhiều nguồn macro gián đoạn
            </div>
            {radar.message && <div>Macro Radar: {radar.message}</div>}
            {indicators.message && <div>Registry: {indicators.message}</div>}
          </div>
        </div>
      )}

      {/* Macro Radar */}
      <MacroRadar
        snapshot={radar.data}
        isLoading={radar.status === 'idle' || radar.status === 'loading'}
        defaultExpanded
      />

      {/* Indicator registry */}
      <div className="bg-terminal-surface border border-terminal-border rounded-md overflow-hidden">
        <div className="px-4 py-2.5 border-b border-terminal-border flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-[11px] font-mono uppercase text-terminal-text-muted">
            <Filter className="w-3.5 h-3.5" /> Đăng ký chỉ số vĩ mô ({visibleIndicators.length})
          </span>
          <span className="flex gap-1.5">
            {(['ALL', 'VN', 'US', 'GLOBAL'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCountryFilter(c)}
                className={`px-2.5 py-1 rounded text-[11px] font-mono border transition-colors ${
                  countryFilter === c
                    ? 'border-terminal-accent/60 bg-terminal-accent/15 text-terminal-accent'
                    : 'border-terminal-border text-terminal-text-muted hover:text-terminal-text-primary'
                }`}
              >
                {c}
              </button>
            ))}
          </span>
        </div>

        {indicators.status === 'error' ? (
          <EmptyState
            compact
            title="REGISTRY_UNAVAILABLE"
            description={indicators.message ?? 'Không tải được đăng ký chỉ số vĩ mô.'}
          />
        ) : visibleIndicators.length === 0 ? (
          <EmptyState
            compact
            title="NO_INDICATORS"
            description="Không có chỉ số nào khớp bộ lọc."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px] font-mono border-collapse">
              <thead>
                <tr className="bg-terminal-surface-subtle text-[10px] uppercase text-terminal-text-muted">
                  <th className="px-3 py-2">Mã</th>
                  <th className="px-3 py-2">Chỉ số</th>
                  <th className="px-3 py-2">Quốc gia</th>
                  <th className="px-3 py-2">Nhóm</th>
                  <th className="px-3 py-2 text-right">Giá trị</th>
                  <th className="px-3 py-2 text-right">Trước đó</th>
                  <th className="px-3 py-2">Ngày quan sát</th>
                  <th className="px-3 py-2">Nguồn</th>
                  <th className="px-3 py-2">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-terminal-border">
                {visibleIndicators.map((ind) => (
                  <tr key={ind.id} className="hover:bg-terminal-surface-hover">
                    <td className="px-3 py-1.5 font-bold text-terminal-text-primary">{ind.code}</td>
                    <td className="px-3 py-1.5 text-terminal-text-secondary">{ind.name}</td>
                    <td className="px-3 py-1.5 text-terminal-text-muted">{ind.country}</td>
                    <td className="px-3 py-1.5 text-terminal-text-muted">{ind.category}</td>
                    <td className="px-3 py-1.5 text-right text-terminal-text-primary">
                      {ind.value === null ? (
                        <span className="text-terminal-text-muted">--</span>
                      ) : (
                        `${formatNumber(ind.value, 2)} ${ind.unit}`
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right text-terminal-text-secondary">
                      {formatNumber(ind.previousValue, 2)}
                    </td>
                    <td className="px-3 py-1.5 text-terminal-text-muted">{ind.observationDate}</td>
                    <td className="px-3 py-1.5 text-terminal-text-muted">{ind.source}</td>
                    <td className="px-3 py-1.5">
                      <Badge variant={statusBadge(ind.status)} size="xs">
                        {ind.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-4 py-2 border-t border-terminal-border text-[10px] font-mono text-terminal-text-muted">
          {indicators.data?.note ?? 'Không có ghi chú nguồn.'}
        </div>
      </div>

      {/* News / policy / earnings / macro observation lists */}
      <div className="bg-terminal-surface border border-terminal-border rounded-md overflow-hidden">
        <div className="px-4 py-2.5 border-b border-terminal-border flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-mono uppercase text-terminal-text-muted">
            Bảng tin &amp; sự kiện — 4 danh sách dùng chung repository
          </span>
          <div className="flex items-center gap-1.5">
            {(Object.keys(LIST_LABELS) as ListKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setListTab(key)}
                aria-pressed={listTab === key}
                className={`px-2.5 py-1 rounded text-[11px] font-mono border transition-colors ${
                  listTab === key
                    ? 'border-terminal-accent/60 bg-terminal-accent/15 text-terminal-accent'
                    : 'border-terminal-border text-terminal-text-muted hover:text-terminal-text-primary'
                }`}
              >
                {LIST_LABELS[key]}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-mono text-terminal-text-muted">
          <DataStatusBadge
            status={
              lists[listTab].status === 'error'
                ? 'DATA_UNAVAILABLE'
                : lists[listTab].status === 'success'
                  ? 'LIVE'
                  : 'LOADING'
            }
            compact
          />
          {lists[listTab].data && (
            <>
              <span>{lists[listTab].data.count ?? 0} mục</span>
              <span>dataStatus: {lists[listTab].data.dataStatus ?? '—'}</span>
              <span>
                {lists[listTab].data.nextCursor ? 'còn trang sau' : 'đã hết trang'}
              </span>
            </>
          )}
        </div>

        {lists[listTab].status === 'error' && (
          <div className="px-4 py-3 border-t border-terminal-border text-[11px] font-mono text-rose-400 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span className="block">{lists[listTab].message}</span>
            <span className="block text-terminal-text-muted">
              Danh sách hiển thị rỗng — không có dữ liệu thay thế.
            </span>
          </div>
        )}

        {(lists[listTab].status === 'loading' || lists[listTab].status === 'idle') && (
          <div className="px-4 py-4 border-t border-terminal-border text-[11px] font-mono text-terminal-text-muted">
            Đang đọc danh sách…
          </div>
        )}

        {lists[listTab].status === 'success' &&
          (lists[listTab].data.items?.length ?? 0) === 0 && (
            <div className="border-t border-terminal-border">
              <EmptyState
                compact
                title="NO_DATA"
                description="Chưa có bản ghi nào trong cửa sổ đọc."
              />
            </div>
          )}

        {lists[listTab].status === 'success' &&
          (lists[listTab].data.items?.length ?? 0) > 0 && (
            <div className="overflow-x-auto border-t border-terminal-border">
              <table className="w-full text-left text-[11px] font-mono border-collapse">
                <thead>
                  <tr className="bg-terminal-surface-subtle text-[10px] uppercase text-terminal-text-muted">
                    <th className="px-3 py-2">Thời gian (UTC)</th>
                    <th className="px-3 py-2">Nội dung</th>
                    <th className="px-3 py-2">Mã</th>
                    <th className="px-3 py-2">Nguồn</th>
                    <th className="px-3 py-2">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-terminal-border">
                  {lists[listTab].data.items.map((item) => (
                    <tr key={item.key} className="hover:bg-terminal-surface-hover">
                      <td className="px-3 py-1.5 text-terminal-text-muted whitespace-nowrap">
                        {item.canonicalTimestamp}
                      </td>
                      <td className="px-3 py-1.5 text-terminal-text-primary">
                        {item.url ? (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-terminal-accent"
                          >
                            {item.title}
                          </a>
                        ) : (
                          item.title
                        )}
                        {listSecondary(item) && (
                          <span className="block text-[10px] text-terminal-text-muted">
                            {listSecondary(item)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-terminal-text-secondary">
                        {item.symbol ?? (item.extra?.metricCode as string) ?? '—'}
                      </td>
                      <td className="px-3 py-1.5 text-terminal-text-muted">
                        {item.source}
                        {item.sourceTier && (
                          <span className="ml-1 text-[9px] uppercase text-terminal-text-muted">
                            {item.sourceTier}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        {listStatus(item) ? (
                          <Badge
                            variant={
                              listStatus(item) === 'VALID' ||
                              listStatus(item) === 'EFFECTIVE' ||
                              listStatus(item) === 'POSITIVE'
                                ? 'up'
                                : listStatus(item) === 'NO_DATA' ||
                                    listStatus(item) === 'NEGATIVE'
                                  ? 'down'
                                  : 'secondary'
                            }
                            size="xs"
                          >
                            {listStatus(item)}
                          </Badge>
                        ) : (
                          <span className="text-terminal-text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {/* Provider health */}
      {status.data?.health && (
        <div className="bg-terminal-surface border border-terminal-border rounded-md p-4 space-y-2">
          <div className="text-[11px] font-mono uppercase text-terminal-text-muted">
            Sức khỏe nguồn dữ liệu vĩ mô
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] font-mono">
            <span className="text-terminal-text-secondary">
              {status.data.health.providerName}
            </span>
            <DataStatusBadge
              status={status.data.health.status === 'NO_DATA' ? 'DATA_UNAVAILABLE' : 'LIVE'}
              compact
            />
            <span className="text-terminal-text-muted">{status.data.health.message}</span>
            <span className="text-terminal-text-muted">
              {status.data.health.lastChecked
                ? new Date(status.data.health.lastChecked).toLocaleString('vi-VN')
                : ''}
            </span>
          </div>
          {typeof status.data.health.status === 'string' &&
            status.data.health.status === 'NO_DATA' && (
              <p className="text-[10px] font-mono text-terminal-text-muted leading-relaxed">
                Không có feed bên ngoài nào đang kết nối. Hệ thống hiển thị registry trống và chế
                độ UNKNOWN thay thế — tuyệt đối không dùng số liệu đóng băng làm nguồn sống.
              </p>
            )}
        </div>
      )}

      <div className="text-[10px] font-mono text-terminal-text-muted leading-relaxed">
        AI không xác định chế độ thị trường hay chỉ số vĩ mô; mọi giá trị đến từ quan sát đã lưu
        hoặc từ nến chỉ số KBS. Chênh lệch phần trăm không đổi khi thiếu số liệu (null → “--”).
        {market.data?.regime?.confidence !== undefined && (
          <> Độ tin cậy chế độ hiện tại: {formatPercent(market.data.regime.confidence, false)}.</>
        )}
      </div>
    </div>
  );
};
