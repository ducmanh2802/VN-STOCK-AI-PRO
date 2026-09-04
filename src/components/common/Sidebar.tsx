import { LayoutDashboard, TrendingUp, BarChart3, LineChart, PieChart, Calculator, Scale, Bookmark, Brain, ChevronRight } from 'lucide-react';

export type ActiveNavView =
  | 'dashboard'
  | 'market'
  | 'stocks'
  | 'watchlist'
  | 'technical'
  | 'fundamentals'
  | 'valuation'
  | 'compare'
  | 'ai-analyst'
  | 'stock-detail';

interface SidebarProps {
  currentView: ActiveNavView;
  onSelectView: (view: ActiveNavView) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  watchlistCount: number;
}

interface NavItem {
  id: ActiveNavView;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: string;
  phase: number;
  isPhase1: boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard Tổng quan',
    icon: LayoutDashboard,
    phase: 1,
    isPhase1: true,
  },
  {
    id: 'market',
    label: 'Thị trường & Ngành',
    icon: TrendingUp,
    phase: 1,
    isPhase1: true,
  },
  {
    id: 'stocks',
    label: 'Mã Cổ phiếu (Stocks)',
    icon: BarChart3,
    phase: 1,
    isPhase1: true,
  },
  {
    id: 'watchlist',
    label: 'Danh mục Theo dõi',
    icon: Bookmark,
    phase: 1,
    isPhase1: true,
  },
  {
    id: 'technical',
    label: 'Phân tích Kỹ thuật',
    icon: LineChart,
    badge: 'Phase 3',
    phase: 3,
    isPhase1: false,
  },
  {
    id: 'fundamentals',
    label: 'Báo cáo Tài chính',
    icon: PieChart,
    badge: 'Phase 4',
    phase: 4,
    isPhase1: false,
  },
  {
    id: 'valuation',
    label: 'Mô hình Định giá',
    icon: Calculator,
    badge: 'Phase 5',
    phase: 5,
    isPhase1: false,
  },
  {
    id: 'compare',
    label: 'So sánh Ngành/Peers',
    icon: Scale,
    badge: 'Phase 8',
    phase: 8,
    isPhase1: false,
  },
  {
    id: 'ai-analyst',
    label: 'AI Market Analyst',
    icon: Brain,
    badge: 'AI DEMO',
    phase: 1,
    isPhase1: true,
  },
];

export function Sidebar({
  currentView,
  onSelectView,
  isOpenMobile,
  onCloseMobile,
  watchlistCount,
}: SidebarProps) {
  const handleItemClick = (id: ActiveNavView) => {
    onSelectView(id);
    onCloseMobile();
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          id="sidebar-mobile-backdrop"
          className="fixed inset-0 bg-terminal-bg/70 backdrop-blur-xs z-40 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar Container */}
      <aside
        id="main-app-sidebar"
        className={`fixed top-16 bottom-0 left-0 z-40 w-64 bg-terminal-bg border-r border-terminal-border flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Navigation Section */}
        <div className="flex-1 px-3 py-4 overflow-y-auto space-y-1">
          <div className="px-3 pb-2 text-[11px] font-mono font-semibold tracking-wider text-terminal-text-muted uppercase">
            Hệ thống phân tích
          </div>

          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;

            return (
              <button
                key={item.id}
                id={`nav-item-${item.id}`}
                onClick={() => handleItemClick(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all group ${
                  isActive
                    ? 'bg-terminal-accent/15 text-terminal-accent border border-terminal-accent/30 font-semibold'
                    : 'text-terminal-text-muted hover:text-terminal-text-primary hover:bg-terminal-surface border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 ${
                      isActive ? 'text-terminal-accent' : 'text-terminal-text-muted group-hover:text-terminal-text-secondary'
                    }`}
                  />
                  <span>{item.label}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  {item.id === 'watchlist' && watchlistCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-terminal-surface text-terminal-accent border border-terminal-border">
                      {watchlistCount}
                    </span>
                  )}

                  {item.badge && (
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        item.isPhase1
                          ? 'bg-terminal-accent/15 text-terminal-accent border border-terminal-accent/30'
                          : 'bg-terminal-surface-subtle text-terminal-text-muted border border-terminal-border'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                  {isActive && <ChevronRight className="w-3.5 h-3.5 text-terminal-accent" />}
                </div>
              </button>
            );
          })}
        </div>

        {/* Phase 1 Specification Note */}
        <div className="p-3 border-t border-terminal-border bg-terminal-surface-subtle/50">
          <div className="p-3 rounded-lg border border-terminal-border bg-terminal-bg text-xs">
            <div className="flex items-center justify-between font-mono mb-1">
              <span className="text-terminal-text-muted font-semibold">GIAI ĐOẠN 1</span>
              <span className="text-terminal-up font-bold">READY</span>
            </div>
            <p className="text-terminal-text-muted text-[11px] leading-relaxed">
              Kiến trúc Foundation hoàn chỉnh với TanStack Query, Zustand, Zod & Design Tokens.
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
