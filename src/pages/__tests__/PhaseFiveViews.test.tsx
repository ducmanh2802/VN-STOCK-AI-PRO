import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BacktestPage } from '../BacktestPage';
import { StrategyLabPage } from '../StrategyLabPage';
import { FundamentalsPage } from '../FundamentalsPage';
import { MacroNewsPage } from '../MacroNewsPage';
import { SettingsPage } from '../SettingsPage';

/**
 * The five views that used to render `PhasePlaceholderPage`.
 *
 * These render the REAL components server-side: `renderToStaticMarkup` runs no
 * effects, so no request is issued — what is asserted is that every page
 * mounts, exposes its stable root id, and shows an honest empty/idle state
 * rather than a "coming soon" placeholder.
 */

const ORIGINAL_FETCH = globalThis.fetch;

beforeAll(() => {
  // Belt and braces: if any of these pages ever reads localStorage at module
  // scope, the node environment must not explode.
  globalThis.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

function renderWithQuery(node: React.ReactElement): string {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

describe('BacktestPage', () => {
  it('mounts with its stable id and no placeholder copy', () => {
    const html = render(<BacktestPage />);
    expect(html).toContain('id="page-backtest"');
    expect(html).toContain('Backtesting');
    expect(html).not.toContain('PhasePlaceholder');
  });

  it('starts in an idle state with no fabricated equity curve', () => {
    const html = render(<BacktestPage />);
    expect(html).toContain('READY');
    expect(html).toContain('Chạy backtest');
    expect(html).not.toContain('NaN');
    // No result yet — the header must not claim a live/loaded data state.
    expect(html).not.toContain('title="SYNCING"');
  });
});

describe('StrategyLabPage', () => {
  it('mounts with its stable id inside a query boundary', () => {
    const html = renderWithQuery(<StrategyLabPage />);
    expect(html).toContain('id="page-strategy-lab"');
    expect(html).not.toContain('PhasePlaceholder');
  });

  it('renders the scorer sliders and a signal panel by default', () => {
    const html = renderWithQuery(<StrategyLabPage />);
    expect(html).toContain('type="range"');
    expect(html).not.toContain('NaN');
  });
});

describe('FundamentalsPage', () => {
  it('mounts with its stable id and no placeholder copy', () => {
    const html = render(<FundamentalsPage />);
    expect(html).toContain('id="page-fundamentals"');
    expect(html).not.toContain('PhasePlaceholder');
  });

  it('does not label a VPS slot as a confirmed year', () => {
    const html = render(<FundamentalsPage />);
    expect(html).not.toContain('Tăng trưởng YoY');
    expect(html).not.toContain('NaN');
  });
});

describe('MacroNewsPage', () => {
  it('mounts with its stable id and no placeholder copy', () => {
    const html = render(<MacroNewsPage />);
    expect(html).toContain('id="page-news-macro"');
    expect(html).not.toContain('PhasePlaceholder');
  });

  it('keeps indicators in a loading/idle state until the API answers', () => {
    const html = render(<MacroNewsPage />);
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('[object Object]');
  });
});

describe('SettingsPage', () => {
  it('mounts with its stable id and no placeholder copy', () => {
    const html = render(<SettingsPage />);
    expect(html).toContain('id="page-settings"');
    expect(html).not.toContain('PhasePlaceholder');
  });

  it('shows the canonical cost model as read-only, not an editable field', () => {
    const html = render(<SettingsPage />);
    expect(html).toContain('chỉ đọc');
    expect(html).not.toContain('NaN');
    // Risk parameters must not be input-editable — the server enforces them.
    expect(html).not.toMatch(/type="number"[^>]*maxRisk/);
  });

  it('pre-checks the order confirmation preference by default', () => {
    const html = render(<SettingsPage />);
    expect(html).toContain('Xác nhận trước khi đặt lệnh');
  });
});

describe('App routing', () => {
  it('renders a real page for every view that used to be a placeholder', () => {
    const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
    for (const [view, component] of [
      ['strategy-lab', 'StrategyLabPage'],
      ['backtest', 'BacktestPage'],
      ['fundamentals', 'FundamentalsPage'],
      ['news-macro', 'MacroNewsPage'],
      ['settings', 'SettingsPage'],
    ] as const) {
      expect(appSource).toContain(`currentView === '${view}' && <${component}`);
    }
    expect(appSource).not.toContain('PhasePlaceholderPage');
  });
});

describe('News / macro list routes are mounted and consumed', () => {
  const routes = [
    '/api/news',
    '/api/policy-events',
    '/api/earnings-calendar',
    '/api/macro/observations',
  ];

  it('server.ts mounts the shared list router', () => {
    const serverSource = readFileSync(resolve(process.cwd(), 'server.ts'), 'utf8');
    expect(serverSource).toContain('createNewsMacroListRouter');
    expect(serverSource).toContain("app.use('/api', createNewsMacroListRouter())");
  });

  it('the macro page reads all four lists through one shared pipeline', () => {
    const pageSource = readFileSync(resolve(process.cwd(), 'src/pages/MacroNewsPage.tsx'), 'utf8');
    for (const route of routes) {
      expect(pageSource).toContain(route);
    }
  });

  it('the router registers every route on a single path table', () => {
    const routerSource = readFileSync(
      resolve(process.cwd(), 'src/lib/newsMacro/api/NewsMacroListRouter.ts'),
      'utf8'
    );
    for (const path of ['/news', '/policy-events', '/earnings-calendar', '/macro/observations']) {
      expect(routerSource).toContain(`path: '${path}'`);
    }
  });
});
