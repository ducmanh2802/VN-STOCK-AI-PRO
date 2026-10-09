import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Settings,
  RefreshCw,
  ShieldCheck,
  Database,
  Bookmark,
  Plus,
  X,
  Server,
  Copy,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { MetricCard } from '../components/ui/MetricCard';
import { DataStatusBadge } from '../components/ui/DataStatusBadge';
import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { useAppStore } from '../store/useAppStore';
import { DEFAULT_RISK_CONFIG } from '../lib/trading/types/risk';
import { DEFAULT_TRADING_COST_CONFIG } from '../lib/trading/types/trading';
import { formatNumber, formatPercent, formatVND } from '../utils/formatters';

const inputCls =
  'w-full text-xs font-mono bg-terminal-surface-elevated border border-terminal-border rounded px-2 py-1.5 text-terminal-text-primary focus:outline-none focus:border-terminal-accent';
const labelCls = 'block text-[10px] font-mono uppercase text-terminal-text-muted mb-1';

const DEFAULT_WATCHLIST = ['HPG', 'FPT', 'SSI', 'MWG', 'TCB', 'VNM'];

interface HealthPayload {
  readonly status?: string;
  readonly process?: string;
  readonly ready?: boolean;
  readonly timestamp?: string;
  readonly providers?: { readonly kbs?: string; readonly vps?: string };
  readonly dependencies?: {
    readonly database?: string;
    readonly auth?: string;
    readonly gemini?: string;
  };
}

/** Display-only preferences persisted per browser. Nothing here moves money. */
interface LocalPreferences {
  readonly confirmBeforeOrder: boolean;
  readonly compactTables: boolean;
  readonly showProvenanceBadges: boolean;
}

const PREF_STORAGE_KEY = 'vn_stock_ai_prefs_v1';
const DEFAULT_PREFS: LocalPreferences = {
  confirmBeforeOrder: true,
  compactTables: true,
  showProvenanceBadges: true,
};

function readPrefs(): LocalPreferences {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return DEFAULT_PREFS;
  }
  try {
    const raw = localStorage.getItem(PREF_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<LocalPreferences>;
    return {
      confirmBeforeOrder: parsed.confirmBeforeOrder ?? DEFAULT_PREFS.confirmBeforeOrder,
      compactTables: parsed.compactTables ?? DEFAULT_PREFS.compactTables,
      showProvenanceBadges: parsed.showProvenanceBadges ?? DEFAULT_PREFS.showProvenanceBadges,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function writePrefs(prefs: LocalPreferences): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  try {
    localStorage.setItem(PREF_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* quota / private mode — preferences simply do not persist */
  }
}

const RISK_ROWS: ReadonlyArray<{ key: keyof typeof DEFAULT_RISK_CONFIG; label: string; kind: 'rate' | 'count' | 'ms' | 'score' }> = [
  { key: 'maxRiskPerTradeRate', label: 'Rủi ro tối đa mỗi lệnh', kind: 'rate' },
  { key: 'maxPortfolioExposureRate', label: 'Phơi bày tối đa danh mục', kind: 'rate' },
  { key: 'dailyLossLimitRate', label: 'Giới hạn lỗ ngày', kind: 'rate' },
  { key: 'maxOpenPositions', label: 'Số vị thế mở tối đa', kind: 'count' },
  { key: 'minimumRiskReward', label: 'Risk:Reward tối thiểu', kind: 'score' },
  { key: 'lotSize', label: 'Lot chuẩn (board lot)', kind: 'count' },
  { key: 'maxStaleTimeMs', label: 'Thời dữ liệu lỗi hạn (staleness)', kind: 'ms' },
];

/**
 * PHASE 19.5 / 26 — PLATFORM SETTINGS & PREFERENCES
 *
 * Three sections with deliberately different authority:
 *   1. Local preferences — persisted in THIS browser only.
 *   2. Canonical risk / cost constants — READ-ONLY; the server enforces them,
 *      so a UI editor would be a lie.
 *   3. Live platform health — probed, never asserted.
 */
export const SettingsPage: React.FC = () => {
  const watchlistSymbols = useAppStore((s) => s.watchlistSymbols);
  const addToWatchlist = useAppStore((s) => s.addToWatchlist);
  const removeFromWatchlist = useAppStore((s) => s.removeFromWatchlist);

  const [prefs, setPrefs] = useState<LocalPreferences>(DEFAULT_PREFS);
  const [health, setHealth] = useState<{ status: 'idle' | 'loading' | 'done' | 'error'; data: HealthPayload | null }>({
    status: 'idle',
    data: null,
  });
  const [newSymbol, setNewSymbol] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setPrefs(readPrefs());
  }, []);

  const loadHealth = useCallback(async () => {
    setHealth((prev) => ({ ...prev, status: 'loading' }));
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      const body = (await res.json()) as HealthPayload;
      setHealth({ status: 'done', data: body });
    } catch {
      setHealth({ status: 'error', data: null });
    }
  }, []);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  const updatePref = (key: keyof LocalPreferences, value: boolean) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      writePrefs(next);
      return next;
    });
  };

  const watchlistJson = useMemo(() => JSON.stringify(watchlistSymbols, null, 2), [watchlistSymbols]);

  const copyWatchlist = async () => {
    try {
      await navigator.clipboard?.writeText(watchlistJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const addSymbol = () => {
    const clean = newSymbol.trim().toUpperCase();
    if (!clean) return;
    addToWatchlist(clean);
    setNewSymbol('');
  };

  const healthStatus = health.data?.status;

  return (
    <div id="page-settings" className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-terminal-border">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-slate-600/20 border border-slate-500/30 flex items-center justify-center text-slate-300">
              <Settings className="w-4 h-4" />
            </div>
            <h1 className="page-title">Cài đặt nền tảng</h1>
            <DataStatusBadge
              status={
                health.status === 'error'
                  ? 'DATA_UNAVAILABLE'
                  : health.status === 'done'
                    ? healthStatus === 'ok'
                      ? 'LIVE'
                      : healthStatus === 'degraded'
                        ? 'DEGRADED'
                        : 'PARTIAL'
                    : 'LOADING'
              }
              compact
            />
          </div>
          <p className="text-xs text-terminal-text-muted mt-1">
            Tùy chọn lưu trong trình duyệt này, tham số rủi ro/chi phí chỉ đọc (máy chủ tự áp
            dụng) và trạng thái nền tảng được dò thật.
          </p>
        </div>
        <Button size="sm" variant="outline" leftIcon={RefreshCw} isLoading={health.status === 'loading'} onClick={loadHealth}>
          Dò lại sức khỏe
        </Button>
      </div>

      {/* Platform health */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="TRẠNG THÁI NỀN TẢNG"
          value={(healthStatus ?? '…').toUpperCase()}
          subValue={health.data?.ready === false ? 'Chưa sẵn sàng' : 'Process đang chạy'}
          badge={health.data?.process ?? '—'}
          badgeVariant={healthStatus === 'ok' ? 'success' : 'warning'}
          icon={Server}
          status={healthStatus === 'ok' ? 'LIVE' : 'PARTIAL'}
        />
        <MetricCard
          label="CƠ SỞ DỮ LIỆU"
          value={health.data?.dependencies?.database ?? '…'}
          subValue="Route DB trả lỗi fail-closed khi thiếu"
          badge="SQL"
          badgeVariant="neutral"
          status={health.data?.dependencies?.database === 'DATABASE_CONFIGURED' ? 'LIVE' : 'DATA_UNAVAILABLE'}
        />
        <MetricCard
          label="NGUỒN KBS / VPS"
          value={`${health.data?.providers?.kbs ?? '…'} / ${health.data?.providers?.vps ?? '…'}`}
          subValue="Chỉ AVAILABLE khi process đã fetch thật"
          badge="REAL FEEDS"
          badgeVariant="indigo"
          status={
            health.data?.providers?.kbs === 'AVAILABLE' || health.data?.providers?.vps === 'AVAILABLE'
              ? 'LIVE'
              : 'PARTIAL'
          }
        />
        <MetricCard
          label="AI COPILOT"
          value={health.data?.dependencies?.gemini ?? '…'}
          subValue="Chỉ tư vấn — không có quyền giao dịch"
          badge="ADVISORY"
          badgeVariant="neutral"
          status={health.data?.dependencies?.gemini === 'GEMINI_CONFIGURED' ? 'LIVE' : 'DATA_UNAVAILABLE'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Local preferences */}
        <Card density="spacious" className="space-y-3">
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase text-terminal-text-muted">
            <ShieldCheck className="w-3.5 h-3.5" /> Tùy chọn cục bộ (lưu trên trình duyệt)
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={prefs.confirmBeforeOrder}
              onChange={(e) => updatePref('confirmBeforeOrder', e.target.checked)}
              className="mt-0.5 accent-terminal-accent"
            />
            <span className="text-xs text-terminal-text-secondary">
              <span className="block text-terminal-text-primary">Xác nhận trước khi đặt lệnh</span>
              Yêu cầu bước xác nhận thêm ở luồng Paper Trading. Không bỏ qua RiskGuard.
            </span>
          </label>

          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={prefs.compactTables}
              onChange={(e) => updatePref('compactTables', e.target.checked)}
              className="mt-0.5 accent-terminal-accent"
            />
            <span className="text-xs text-terminal-text-secondary">
              <span className="block text-terminal-text-primary">Bảng dạng gọn</span>
              Giảm khoảng cách dòng ở các bảng dữ liệu lớn.
            </span>
          </label>

          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={prefs.showProvenanceBadges}
              onChange={(e) => updatePref('showProvenanceBadges', e.target.checked)}
              className="mt-0.5 accent-terminal-accent"
            />
            <span className="text-xs text-terminal-text-secondary">
              <span className="block text-terminal-text-primary">Hiện huy hiệu nguồn dữ liệu</span>
              Luôn hiển thị KBS/VPS/FAILOVER bên cạnh số liệu.
            </span>
          </label>

          <p className="text-[10px] font-mono text-terminal-text-muted border-t border-terminal-border pt-2">
            Các tùy chọn này chỉ ảnh hưởng giao diện của trình duyệt hiện tại; chúng không đổi cấu
            hình rủi ro phía máy chủ.
          </p>
        </Card>

        {/* Watchlist */}
        <Card density="spacious" className="space-y-3">
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase text-terminal-text-muted">
            <Bookmark className="w-3.5 h-3.5" /> Danh mục theo dõi ({watchlistSymbols.length})
          </div>

          <div className="flex gap-2">
            <input
              value={newSymbol}
              onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && addSymbol()}
              placeholder="Thêm mã (VD: VCB)"
              aria-label="Mã cần thêm vào danh mục theo dõi"
              className={labelCls ? inputCls : inputCls}
            />
            <Button size="sm" variant="secondary" leftIcon={Plus} onClick={addSymbol}>
              Thêm
            </Button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {watchlistSymbols.length === 0 && (
              <span className="text-[11px] font-mono text-terminal-text-muted">
                Danh mục trống.
              </span>
            )}
            {watchlistSymbols.map((symbol) => (
              <span
                key={symbol}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-terminal-border bg-terminal-surface-subtle text-[11px] font-mono text-terminal-text-primary"
              >
                {symbol}
                <button
                  type="button"
                  aria-label={`Xóa ${symbol} khỏi danh mục theo dõi`}
                  onClick={() => removeFromWatchlist(symbol)}
                  className="text-terminal-text-muted hover:text-rose-400"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => watchlistSymbols.forEach((s) => removeFromWatchlist(s))}>
              Xóa hết
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => DEFAULT_WATCHLIST.forEach((s) => addToWatchlist(s))}
            >
              Khôi phục mặc định
            </Button>
            <Button size="sm" variant="ghost" leftIcon={Copy} onClick={copyWatchlist}>
              {copied ? 'Đã sao chép' : 'Sao chép JSON'}
            </Button>
          </div>

          <textarea
            readOnly
            rows={4}
            value={watchlistJson}
            aria-label="Danh mục theo dõi dạng JSON"
            className="w-full text-[11px] font-mono bg-terminal-surface-elevated border border-terminal-border rounded p-2.5 text-terminal-text-secondary"
          />
        </Card>
      </div>

      {/* Canonical risk / cost — read only */}
      <div className="bg-terminal-surface border border-terminal-border rounded-md overflow-hidden">
        <div className="px-4 py-2.5 border-b border-terminal-border flex items-center justify-between">
          <span className="flex items-center gap-2 text-[11px] font-mono uppercase text-terminal-text-muted">
            <ShieldCheck className="w-3.5 h-3.5" /> Tham số rủi ro &amp; chi phí — chỉ đọc
          </span>
          <Badge variant="secondary" size="xs">SERVER-ENFORCED</Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-terminal-border">
          <div className="p-4">
            <div className="text-[10px] font-mono uppercase text-terminal-text-muted mb-2">
              RiskGuard / RiskManager
            </div>
            <div className="space-y-1.5">
              {RISK_ROWS.map((row) => {
                const value = DEFAULT_RISK_CONFIG[row.key];
                const display =
                  row.kind === 'rate'
                    ? formatPercent((value as number) * 100, false)
                    : row.kind === 'ms'
                      ? `${formatNumber((value as number) / 1000, 0)} giây`
                      : row.kind === 'score'
                        ? `${formatNumber(value as number, 1)} : 1`
                        : formatNumber(value as number, 0);
                return (
                  <div key={row.key} className="flex justify-between text-[11px] font-mono">
                    <span className="text-terminal-text-secondary">{row.label}</span>
                    <span className="text-terminal-text-primary">{display}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-4">
            <div className="text-[10px] font-mono uppercase text-terminal-text-muted mb-2">
              Chi phí giao dịch chuẩn (DEFAULT_TRADING_COST_CONFIG)
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] font-mono">
                <span className="text-terminal-text-secondary">Phí mua</span>
                <span className="text-terminal-text-primary">
                  {formatPercent(DEFAULT_TRADING_COST_CONFIG.buyFeeRate * 100, false)}
                </span>
              </div>
              <div className="flex justify-between text-[11px] font-mono">
                <span className="text-terminal-text-secondary">Phí bán</span>
                <span className="text-terminal-text-primary">
                  {formatPercent(DEFAULT_TRADING_COST_CONFIG.sellFeeRate * 100, false)}
                </span>
              </div>
              <div className="flex justify-between text-[11px] font-mono">
                <span className="text-terminal-text-secondary">Thuế bán</span>
                <span className="text-terminal-text-primary">
                  {formatPercent(DEFAULT_TRADING_COST_CONFIG.sellTaxRate * 100, false)}
                </span>
              </div>
              <div className="flex justify-between text-[11px] font-mono">
                <span className="text-terminal-text-secondary">Trượt giá</span>
                <span className="text-terminal-text-primary">
                  {formatPercent(DEFAULT_TRADING_COST_CONFIG.slippageRate * 100, false)}
                </span>
              </div>
            </div>

            <div className="text-[10px] font-mono uppercase text-terminal-text-muted mt-4 mb-2">
              TTL bộ nhớ đệm dữ liệu
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] font-mono">
                <span className="text-terminal-text-secondary">Báo giá realtime</span>
                <span className="text-terminal-text-primary">15 giây</span>
              </div>
              <div className="flex justify-between text-[11px] font-mono">
                <span className="text-terminal-text-secondary">Nến lịch sử</span>
                <span className="text-terminal-text-primary">60 giây</span>
              </div>
              <div className="flex justify-between text-[11px] font-mono">
                <span className="text-terminal-text-secondary">Báo cáo tài chính</span>
                <span className="text-terminal-text-primary">300 giây</span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 py-2 border-t border-terminal-border text-[10px] font-mono text-terminal-text-muted">
          Các hằng số này là truth dùng chung của RiskGuard, PositionSizer, PaperBroker và
          BacktestEngine — giao diện không thể sửa, mọi lệnh đều bị kiểm tra lại phía máy chủ.
        </div>
      </div>

      {/* Data sources reference */}
      <div className="bg-terminal-surface border border-terminal-border rounded-md overflow-hidden">
        <div className="px-4 py-2.5 border-b border-terminal-border flex items-center gap-2 text-[11px] font-mono uppercase text-terminal-text-muted">
          <Database className="w-3.5 h-3.5" /> Nguồn dữ liệu tham chiếu
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px] font-mono border-collapse">
            <thead>
              <tr className="bg-terminal-surface-subtle text-[10px] uppercase text-terminal-text-muted">
                <th className="px-4 py-2">Nguồn</th>
                <th className="px-4 py-2">Phạm vi</th>
                <th className="px-4 py-2">Chính sách khi lỗi</th>
                <th className="px-4 py-2">Điểm cuối</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-terminal-border">
              <tr>
                <td className="px-4 py-2 text-terminal-text-primary">KBS Securities</td>
                <td className="px-4 py-2 text-terminal-text-secondary">Nến ngày OHLCV</td>
                <td className="px-4 py-2 text-terminal-text-secondary">
                  DATA_UNAVAILABLE — không sinh nến giả
                </td>
                <td className="px-4 py-2 text-terminal-text-muted">/api/market-data/history/:symbol</td>
              </tr>
              <tr>
                <td className="px-4 py-2 text-terminal-text-primary">VPS Securities</td>
                <td className="px-4 py-2 text-terminal-text-secondary">Báo giá, BCTC</td>
                <td className="px-4 py-2 text-terminal-text-secondary">
                  Giữ nguyên null, không thay 0
                </td>
                <td className="px-4 py-2 text-terminal-text-muted">/api/market-data/quote/:symbol</td>
              </tr>
              <tr>
                <td className="px-4 py-2 text-terminal-text-primary">Macro Registry</td>
                <td className="px-4 py-2 text-terminal-text-secondary">
                  Chỉ số vĩ mô, chế độ thị trường
                </td>
                <td className="px-4 py-2 text-terminal-text-secondary">
                  NO_DATA / UNKNOWN (fail-closed)
                </td>
                <td className="px-4 py-2 text-terminal-text-muted">/api/macro/indicators</td>
              </tr>
              <tr>
                <td className="px-4 py-2 text-terminal-text-primary">Paper Trading</td>
                <td className="px-4 py-2 text-terminal-text-secondary">
                  Khớp lệnh giả lập, sổ lệnh
                </td>
                <td className="px-4 py-2 text-terminal-text-secondary">
                  Từ chối lệnh khi dữ liệu cũ/hỏng
                </td>
                <td className="px-4 py-2 text-terminal-text-muted">/api/trading/*</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <Card variant="subtle" className="text-[10px] font-mono text-terminal-text-muted leading-relaxed">
        Nền tảng chỉ chạy Paper Trading. Không có khóa API môi giới, không có đường ra lệnh thật,
        và mọi số hiển thị đều có nguồn truy vết KBS/VPS hoặc được tính tất định từ dữ liệu đó.
        {' '}Số dư tiền ảo hiện tại:{' '}
        <span className="text-terminal-text-secondary">{formatVND(100_000_000)} VND</span> là mặc
        định của ví paper, không phải số dư tài khoản thật.
      </Card>
    </div>
  );
};
