import React from 'react';
import {
  LayoutDashboard,
  TrendingUp,
  Layers,
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
    groupName: 'MARKET',
    items: [
      { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
      { id: 'market', label: 'Market', icon: TrendingUp },
      { id: 'sector-intelligence', label: 'Market Map', icon: Layers },
      { id: 'watchlist', label: 'Watchlist', icon: Bookmark },
    ],
  },
  {
    groupName: 'RESEARCH',
    items: [
      { id: 'screener', label: 'Screener', icon: SlidersHorizontal },
      { id: 'ai-analyst', label: 'AI Analysis', icon: Sparkles, badge: 'PRO', badgeVariant: 'accent' },
      { id: 'fundamentals', label: 'Fundamentals', icon: FileText },
      { id: 'news-macro', label: 'Macro', icon: Globe },
    ],
  },
  {
    groupName: 'LEARN',
    items: [
      { id: 'learn', label: 'Learn', icon: BookOpen, badge: 'NEW', badgeVariant: 'success' },
      { id: 'learn-path', label: 'Paths', icon: Layers },
      { id: 'practice-lab', label: 'Practice Lab', icon: FlaskConical },
    ],
  },
  {
    groupName: 'TRADING',
    items: [
      { id: 'strategy-lab', label: 'Strategies', icon: FlaskConical },
      { id: 'backtest', label: 'Backtesting', icon: PlayCircle },
      { id: 'paper-trading', label: 'Paper Trading', icon: Activity, badge: 'DEMO', badgeVariant: 'warning' },
      { id: 'portfolio', label: 'Portfolio', icon: Briefcase },
      { id: 'risk-center', label: 'Risk', icon: ShieldAlert, badge: 'SECURE', badgeVariant: 'success' },
      { id: 'journal', label: 'Journal', icon: BookOpen },
    ],
  },
  {
    groupName: 'SYSTEM',
    items: [
      { id: 'data-status', label: 'Data Health', icon: Database },
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
        return 'bg-terminal-accent/10 text-terminal-accent border-terminal-accent/25';
      case 'success':
        return 'bg-terminal-up/10 text-terminal-up border-terminal-up/25';
      case 'warning':
        return 'bg-terminal-ref/10 text-terminal-ref border-terminal-ref/25';
      default:
        return 'bg-terminal-surface-elevated text-terminal-text-muted border-terminal-border';
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
        className={`fixed lg:sticky top-0 left-0 z-40 h-screen bg-terminal-surface border-r border-terminal-border flex flex-col transition-all duration-150 select-none ${
          isCollapsed ? 'w-14' : 'w-52'
        } ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Top Branding Section */}
        <div>
          <div className="h-11 flex items-center justify-between px-3 border-b border-terminal-border">
            {!isCollapsed ? (
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-sm bg-terminal-accent/15 border border-terminal-accent/30 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-3.5 h-3.5 text-terminal-accent" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px] font-semibold text-terminal-text-primary font-mono tracking-tight truncate">
                      VN-STOCK-AI-PRO
                    </span>
                    <span className="text-[9px] font-mono px-1 rounded-sm bg-terminal-surface-elevated text-terminal-text-muted border border-terminal-border shrink-0">
                      v2.5
                    </span>
                  </div>
                  <p className="text-[9px] font-mono text-terminal-text-muted truncate">
                    VIETNAM QUANT TERMINAL
                  </p>
                </div>
              </div>
            ) : (
              <div className="mx-auto w-6 h-6 rounded-sm bg-terminal-accent/15 border border-terminal-accent/30 flex items-center justify-center">
                <TrendingUp className="w-3.5 h-3.5 text-terminal-accent" />
              </div>
            )}

            {onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                className="hidden lg:flex p-1 rounded text-terminal-text-muted hover:text-terminal-text-primary hover:bg-terminal-surface-hover"
                title={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
                aria-label={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
              >
                {isCollapsed ? (
                  <ChevronRight className="w-3.5 h-3.5" />
                ) : (
                  <ChevronLeft className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>

          {/* Navigation Groups */}
          <div className="p-2 space-y-4 overflow-y-auto max-h-[calc(100vh-120px)]">
            {navigationStructure.map((group) => (
              <div key={group.groupName} className="space-y-0.5">
                {!isCollapsed && (
                  <div className="px-2 py-1 text-[9px] font-semibold font-mono text-terminal-text-disabled uppercase tracking-[0.16em]">
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
                      aria-current={isActive ? 'page' : undefined}
                      className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded text-[12px] transition-colors duration-100 relative group ${
                        isActive
                          ? 'bg-terminal-accent/10 text-terminal-text-primary border-l-2 border-terminal-accent pl-[6px]'
                          : 'text-terminal-text-secondary hover:text-terminal-text-primary hover:bg-terminal-surface-elevated border-l-2 border-transparent pl-[6px]'
                      } ${isCollapsed ? 'justify-center px-0' : ''}`}
                    >
                      <Icon
                        className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                          isActive
                            ? 'text-terminal-accent'
                            : 'text-terminal-text-muted group-hover:text-terminal-text-secondary'
                        }`}
                      />

                      {!isCollapsed && (
                        <div className="flex-1 flex items-center justify-between text-left min-w-0">
                          <span className="truncate">{item.label}</span>
                          {badgeText && (
                            <span
                              className={`px-1 py-0.5 rounded-sm text-[9px] font-mono border shrink-0 ${getBadgeStyle(
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
                        <div className="absolute left-full ml-2 px-2 py-1 bg-terminal-surface-elevated border border-terminal-border text-terminal-text-secondary text-[11px] rounded-sm shadow-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
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

        {/* Bottom AI Assistant entry — flat, no gradient */}
        <div className="p-2 border-t border-terminal-border">
          {!isCollapsed ? (
            <button
              onClick={onOpenCopilot}
              className="w-full flex items-center justify-between px-2 py-1.5 rounded-sm border border-terminal-border bg-terminal-surface-elevated hover:border-terminal-border-bright transition-colors group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles className="w-3.5 h-3.5 text-terminal-accent shrink-0" />
                <span className="text-[11px] text-terminal-text-secondary group-hover:text-terminal-text-primary">
                  Research Assistant
                </span>
              </div>
              <span className="text-[9px] font-mono text-terminal-text-muted">Ctrl+K</span>
            </button>
          ) : (
            <button
              onClick={onOpenCopilot}
              className="w-full flex items-center justify-center p-1.5 rounded-sm text-terminal-accent hover:bg-terminal-surface-elevated transition-colors"
              title="Open research assistant"
              aria-label="Open research assistant"
            >
              <Sparkles className="w-4 h-4" />
            </button>
          )}
        </div>
      </aside>
    </>
  );
};
