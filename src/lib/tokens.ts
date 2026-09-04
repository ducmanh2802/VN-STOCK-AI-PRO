/**
 * VN STOCK AI - Design Tokens
 * Institutional Dark Financial Terminal System
 */

export const tokens = {
  colors: {
    // Primary Backgrounds
    background: {
      default: '#0B0E14',
      subtle: '#080A0F',
      overlay: 'rgba(11, 14, 20, 0.85)',
    },
    // Surface Containers
    surface: {
      default: '#111622',
      hover: '#171E2E',
      active: '#1C2538',
      subtle: '#0E131D',
      elevated: '#161D2C',
    },
    // Borders & Dividers
    border: {
      default: '#1E293B',
      subtle: '#151D2A',
      bright: '#334155',
      focus: '#3B82F6',
    },
    // Typography & Content
    text: {
      primary: '#F8FAFC',
      secondary: '#94A3B8',
      muted: '#64748B',
      subtle: '#475569',
      inverse: '#0B0E14',
    },
    // Financial Market Status & Direction Colors
    market: {
      up: '#10B981',        // Green (Tăng giá)
      upSubtle: 'rgba(16, 185, 129, 0.12)',
      upBorder: 'rgba(16, 185, 129, 0.25)',
      
      down: '#EF4444',      // Red (Giảm giá)
      downSubtle: 'rgba(239, 68, 68, 0.12)',
      downBorder: 'rgba(239, 68, 68, 0.25)',
      
      ref: '#EAB308',       // Yellow (Tham chiếu)
      refSubtle: 'rgba(234, 179, 8, 0.12)',
      refBorder: 'rgba(234, 179, 8, 0.25)',
      
      ceiling: '#C084FC',   // Purple/Magenta (Giá trần)
      ceilingSubtle: 'rgba(192, 132, 252, 0.12)',
      ceilingBorder: 'rgba(192, 132, 252, 0.25)',
      
      floor: '#22D3EE',     // Cyan (Giá sàn)
      floorSubtle: 'rgba(34, 211, 238, 0.12)',
      floorBorder: 'rgba(34, 211, 238, 0.25)',
    },
    // Technical Brand & Functional Accents
    brand: {
      primary: '#2563EB',   // Technical Blue
      primaryHover: '#1D4ED8',
      primarySubtle: 'rgba(37, 99, 235, 0.15)',
      primaryBorder: 'rgba(59, 130, 246, 0.35)',
    },
  },
  typography: {
    fontSans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontMono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
  },
  radii: {
    xs: '4px',
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    full: '9999px',
  },
  shadows: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.25)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.35)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.45)',
  },
} as const;

export type DesignTokens = typeof tokens;
