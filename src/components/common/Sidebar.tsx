import React from 'react';
import {
  LayoutDashboard,
  TrendingUp,
  Bookmark,
  Sparkles,
  SlidersHorizontal,
  FileText,
  Globe,
  FlaskConical,
  PlayCircle,
  Activity,
  Briefcase,
  ShieldAlert,
  BookOpen,
  Database,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sparkle,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export type ActiveNavView = string;

export interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeVariant?: 'accent' | 'success' | 'warning' | 'muted';
}


export interface NavGroup {
  groupName: string;
  items: NavItem[];
}

interface SidebarProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
  isOpen: boolean;
  onClose?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenCopilot?: () => void;
}

export const navigationStructure: NavGroup[] = [
  {
    groupName: 'OVERVIEW',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'market', label: 'Market Overview', icon: TrendingUp },
      { id: 'watchlist', label: 'Watchlist', icon: Bookmark },
    ],
  },
  {
    groupName: 'RESEARCH',
    items: [
      { id: 'ai-analyst', label: 'AI Research', icon: Sparkles, badge: 'PRO', badgeVariant: 'accent' },
      { id: 'screener', label: 'Stock Screener', icon: SlidersHorizontal },
      { id: 'fundamentals', label: 'Fundamentals', icon: FileText },
      { id: 'news-macro', label: 'News & Macro', icon: Globe },
    ],
  },
  {
    groupName: 'QUANT LAB',
    items: [
      { id: 'strategy-lab', label: 'Strategy Lab', icon: FlaskConical },
      { id: 'backtest', label: 'Backtesting', icon: PlayCircle },
      { id: 'paper-trading', label: 'Paper Trading', icon: Activity, badge: 'DEMO', badgeVariant: 'warning' },
    ],
  },
  {
    groupName: 'PORTFOLIO',
    items: [
      { id: 'portfolio', label: 'Portfolio', icon: Briefcase },
      { id: 'risk-center', label: 'Risk Center', icon: ShieldAlert, badge: 'SECURE', badgeVariant: 'success' },
      { id: 'journal', label: 'Trade Journal', icon: BookOpen },
    ],
  },
  {
    groupName: 'SYSTEM',
    items: [
      { id: 'data-status', label: 'Data Status', icon: Database },
      { id: 'settings', label: 'Settings', icon: Settings },
    ],
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  isOpen,
  onClose,
  isCollapsed = false,
  onToggleCollapse,
  onOpenCopilot,
}) => {
  const watchlistCount = useAppStore((state) => state.watchlistSymbols.length);


  const getBadgeStyle = (variant?: string) => {
    switch (variant) {
      case 'accent':
        return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
      case 'success':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'warning':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden animate-in fade-in"
          onClick={onClose}
        />
      )}

      <aside
        id="main-app-sidebar"
        className={`fixed lg:sticky top-0 left-0 z-40 h-screen bg-[#0E1522] border-r border-[#263244] flex flex-col justify-between transition-all duration-200 select-none ${
          isCollapsed ? 'w-16' : 'w-64'
        } ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Top Branding Section */}
        <div>
          <div className="h-16 flex items-center justify-between px-4 border-b border-[#263244] bg-[#111827]">
            {!isCollapsed ? (
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-600/30">
                  <TrendingUp className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-sm text-slate-100 font-mono tracking-tight">
                      VN AI <span className="text-indigo-400">PRO</span>
                    </span>
                    <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-semibold border border-indigo-500/30">
                      v2.5
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-mono truncate">
                    VIETNAM QUANT INTEL
                  </p>
                </div>
              </div>
            ) : (
              <div className="mx-auto w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-600/30">
                <TrendingUp className="w-4 h-4 text-white" />
              </div>
            )}

            {/* Desktop Collapse Button */}
            {onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                className="hidden lg:flex p-1.5 text-slate-400 hover:text-slate-200 hover:bg-[#182231] rounded-lg transition-colors"
                title={isCollapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
              >
                {isCollapsed ? (
                  <ChevronRight className="w-4 h-4" />
                ) : (
                  <ChevronLeft className="w-4 h-4" />
                )}
              </button>
            )}
          </div>

          {/* Navigation Groups */}
          <div className="p-3 space-y-6 overflow-y-auto max-h-[calc(100vh-140px)] scrollbar-none">
            {navigationStructure.map((group) => (
              <div key={group.groupName} className="space-y-1">
                {!isCollapsed && (
                  <div className="px-2 pb-1 text-[10px] font-semibold font-mono text-slate-500 tracking-wider">
                    {group.groupName}
                  </div>
                )}

                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  const badgeText = item.id === 'watchlist' && watchlistCount > 0 ? `${watchlistCount}` : item.badge;

                  return (
                    <button
                      key={item.id}
                      id={`nav-item-${item.id}`}
                      onClick={() => {
                        onTabChange(item.id);
                        if (onClose) onClose();
                      }}
                      title={isCollapsed ? item.label : undefined}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 relative group ${
                        isActive
                          ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30 font-semibold shadow-sm'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-[#182231] border border-transparent'
                      } ${isCollapsed ? 'justify-center px-0' : ''}`}
                    >
                      <Icon
                        className={`w-4 h-4 shrink-0 transition-colors ${
                          isActive
                            ? 'text-indigo-400'
                            : 'text-slate-400 group-hover:text-slate-200'
                        }`}
                      />

                      {!isCollapsed && (
                        <div className="flex-1 flex items-center justify-between text-left">
                          <span className="truncate">{item.label}</span>
                          {badgeText && (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${getBadgeStyle(
                                item.badgeVariant
                              )}`}
                            >
                              {badgeText}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Tooltip for collapsed view */}
                      {isCollapsed && (
                        <div className="absolute left-full ml-2 px-2.5 py-1 bg-[#182231] border border-[#263244] text-slate-200 text-xs rounded-md shadow-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
                          {item.label}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom AI Assistant CTA Banner */}
        <div className="p-3 border-t border-[#263244] bg-[#111827]">
          {!isCollapsed ? (
            <button
              onClick={onOpenCopilot}
              className="w-full flex items-center justify-between p-2.5 rounded-xl bg-gradient-to-r from-indigo-900/30 to-violet-900/30 border border-indigo-500/30 hover:border-indigo-500/60 transition-all group"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-indigo-600/30 flex items-center justify-center text-indigo-300">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div className="text-left">
                  <div className="text-xs font-semibold text-slate-200 group-hover:text-indigo-300">
                    AI Copilot
                  </div>
                  <div className="text-[10px] text-slate-400">Contextual Agent</div>
                </div>
              </div>
              <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/20 px-1.5 py-0.5 rounded">
                Ctrl+K
              </span>
            </button>
          ) : (
            <button
              onClick={onOpenCopilot}
              className="w-full flex items-center justify-center p-2 rounded-lg text-indigo-400 hover:bg-indigo-600/20 transition-colors"
              title="Mở AI Copilot"
            >
              <Sparkles className="w-5 h-5" />
            </button>
          )}
        </div>
      </aside>
    </>
  );
};
