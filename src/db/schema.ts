import { relations } from 'drizzle-orm';
import {
  pgTable,
  serial,
  integer,
  bigint,
  text,
  numeric,
  boolean,
  timestamp,
  date,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

// ==========================================
// 1. USERS TABLE (Linked with Firebase Auth)
// ==========================================
export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    uid: text('uid').notNull().unique(), // Firebase Auth UID
    email: text('email').notNull(),
    displayName: text('display_name'),
    role: text('role').default('user').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('users_uid_idx').on(table.uid),
    index('users_email_idx').on(table.email),
  ]
);

export const usersRelations = relations(users, ({ many }) => ({
  watchlists: many(watchlists),
  portfolios: many(portfolios),
  alerts: many(alerts),
}));

// ==========================================
// 2. STOCKS TABLE (Equities Master)
// ==========================================
export const stocks = pgTable(
  'stocks',
  {
    id: serial('id').primaryKey(),
    symbol: text('symbol').notNull().unique(),
    companyName: text('company_name').notNull(),
    exchange: text('exchange').notNull(), // HOSE, HNX, UPCOM
    sector: text('sector').notNull(),
    industry: text('industry'),
    isin: text('isin'),
    listedShares: bigint('listed_shares', { mode: 'number' }),
    outstandingShares: bigint('outstanding_shares', { mode: 'number' }),
    foreignLimitPercent: numeric('foreign_limit_percent', { precision: 5, scale: 2 }),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('stocks_symbol_idx').on(table.symbol),
    index('stocks_exchange_idx').on(table.exchange),
    index('stocks_sector_idx').on(table.sector),
  ]
);

export const stocksRelations = relations(stocks, ({ many }) => ({
  dailyPrices: many(stockDaily),
  intradayPrices: many(stockIntraday),
  technicalIndicators: many(technicalIndicators),
  financialStatements: many(financialStatements),
  financialRatios: many(financialRatios),
  valuationResults: many(valuationResults),
  moneyFlows: many(moneyFlows),
  foreignTradings: many(foreignTrading),
  news: many(news),
  signals: many(signals),
  analysisResults: many(analysisResults),
  aiAnalyses: many(aiAnalysis),
}));

// ==========================================
// 3. STOCK_DAILY (Daily OHLCV History)
// ==========================================
export const stockDaily = pgTable(
  'stock_daily',
  {
    id: serial('id').primaryKey(),
    stockId: integer('stock_id')
      .references(() => stocks.id, { onDelete: 'cascade' })
      .notNull(),
    date: date('date').notNull(),
    open: numeric('open', { precision: 15, scale: 2 }).notNull(),
    high: numeric('high', { precision: 15, scale: 2 }).notNull(),
    low: numeric('low', { precision: 15, scale: 2 }).notNull(),
    close: numeric('close', { precision: 15, scale: 2 }).notNull(),
    refPrice: numeric('ref_price', { precision: 15, scale: 2 }),
    ceilingPrice: numeric('ceiling_price', { precision: 15, scale: 2 }),
    floorPrice: numeric('floor_price', { precision: 15, scale: 2 }),
    change: numeric('change', { precision: 15, scale: 2 }),
    changePercent: numeric('change_percent', { precision: 7, scale: 4 }),
    volume: bigint('volume', { mode: 'number' }).notNull(),
    value: numeric('value', { precision: 18, scale: 2 }).notNull(), // Vietnamese Dong
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('stock_daily_stock_date_idx').on(table.stockId, table.date),
    index('stock_daily_date_idx').on(table.date),
    index('stock_daily_stock_id_idx').on(table.stockId),
  ]
);

export const stockDailyRelations = relations(stockDaily, ({ one }) => ({
  stock: one(stocks, {
    fields: [stockDaily.stockId],
    references: [stocks.id],
  }),
}));

// ==========================================
// 4. STOCK_INTRADAY (Ticks & Minute Bars)
// ==========================================
export const stockIntraday = pgTable(
  'stock_intraday',
  {
    id: serial('id').primaryKey(),
    stockId: integer('stock_id')
      .references(() => stocks.id, { onDelete: 'cascade' })
      .notNull(),
    timestamp: timestamp('timestamp').notNull(),
    price: numeric('price', { precision: 15, scale: 2 }).notNull(),
    change: numeric('change', { precision: 15, scale: 2 }),
    volume: bigint('volume', { mode: 'number' }).notNull(),
    accumulatedVolume: bigint('accumulated_volume', { mode: 'number' }),
    accumulatedValue: numeric('accumulated_value', { precision: 18, scale: 2 }),
    orderSide: text('order_side'), // BUY, SELL, UNKNOWN
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('stock_intraday_stock_time_idx').on(table.stockId, table.timestamp),
    index('stock_intraday_timestamp_idx').on(table.timestamp),
  ]
);

export const stockIntradayRelations = relations(stockIntraday, ({ one }) => ({
  stock: one(stocks, {
    fields: [stockIntraday.stockId],
    references: [stocks.id],
  }),
}));

// ==========================================
// 5. TECHNICAL_INDICATORS (Deterministic Snapshot)
// ==========================================
export const technicalIndicators = pgTable(
  'technical_indicators',
  {
    id: serial('id').primaryKey(),
    stockId: integer('stock_id')
      .references(() => stocks.id, { onDelete: 'cascade' })
      .notNull(),
    date: date('date').notNull(),
    timeframe: text('timeframe').default('1D').notNull(),
    ma20: numeric('ma20', { precision: 15, scale: 2 }),
    ma50: numeric('ma50', { precision: 15, scale: 2 }),
    ma200: numeric('ma200', { precision: 15, scale: 2 }),
    ema12: numeric('ema12', { precision: 15, scale: 2 }),
    ema26: numeric('ema26', { precision: 15, scale: 2 }),
    rsi14: numeric('rsi14', { precision: 6, scale: 2 }),
    macd: numeric('macd', { precision: 12, scale: 4 }),
    macdSignal: numeric('macd_signal', { precision: 12, scale: 4 }),
    macdHistogram: numeric('macd_histogram', { precision: 12, scale: 4 }),
    bollingerUpper: numeric('bollinger_upper', { precision: 15, scale: 2 }),
    bollingerMiddle: numeric('bollinger_middle', { precision: 15, scale: 2 }),
    bollingerLower: numeric('bollinger_lower', { precision: 15, scale: 2 }),
    volumeMa20: bigint('volume_ma20', { mode: 'number' }),
    atr14: numeric('atr14', { precision: 15, scale: 2 }),
    signalSummary: text('signal_summary'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('tech_indicators_stock_date_tf_idx').on(
      table.stockId,
      table.date,
      table.timeframe
    ),
    index('tech_indicators_stock_id_idx').on(table.stockId),
  ]
);

export const technicalIndicatorsRelations = relations(technicalIndicators, ({ one }) => ({
  stock: one(stocks, {
    fields: [technicalIndicators.stockId],
    references: [stocks.id],
  }),
}));

// ==========================================
// 6. FINANCIAL_STATEMENTS (Báo cáo tài chính)
// ==========================================
export const financialStatements = pgTable(
  'financial_statements',
  {
    id: serial('id').primaryKey(),
    stockId: integer('stock_id')
      .references(() => stocks.id, { onDelete: 'cascade' })
      .notNull(),
    year: integer('year').notNull(),
    quarter: integer('quarter'), // 1-4, null for annual
    statementType: text('statement_type').notNull(), // IS (Income), BS (Balance), CF (Cash Flow)
    revenue: numeric('revenue', { precision: 18, scale: 2 }),
    grossProfit: numeric('gross_profit', { precision: 18, scale: 2 }),
    operatingProfit: numeric('operating_profit', { precision: 18, scale: 2 }),
    netProfit: numeric('net_profit', { precision: 18, scale: 2 }),
    totalAssets: numeric('total_assets', { precision: 18, scale: 2 }),
    totalLiabilities: numeric('total_liabilities', { precision: 18, scale: 2 }),
    totalEquity: numeric('total_equity', { precision: 18, scale: 2 }),
    operatingCashFlow: numeric('operating_cash_flow', { precision: 18, scale: 2 }),
    investingCashFlow: numeric('investing_cash_flow', { precision: 18, scale: 2 }),
    financingCashFlow: numeric('financing_cash_flow', { precision: 18, scale: 2 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('fin_stmt_stock_period_idx').on(
      table.stockId,
      table.year,
      table.quarter,
      table.statementType
    ),
    index('fin_stmt_stock_id_idx').on(table.stockId),
  ]
);

export const financialStatementsRelations = relations(financialStatements, ({ one }) => ({
  stock: one(stocks, {
    fields: [financialStatements.stockId],
    references: [stocks.id],
  }),
}));

// ==========================================
// 7. FINANCIAL_RATIOS (Chỉ số tài chính)
// ==========================================
export const financialRatios = pgTable(
  'financial_ratios',
  {
    id: serial('id').primaryKey(),
    stockId: integer('stock_id')
      .references(() => stocks.id, { onDelete: 'cascade' })
      .notNull(),
    year: integer('year').notNull(),
    quarter: integer('quarter'),
    pe: numeric('pe', { precision: 8, scale: 2 }),
    pb: numeric('pb', { precision: 8, scale: 2 }),
    ps: numeric('ps', { precision: 8, scale: 2 }),
    roe: numeric('roe', { precision: 6, scale: 2 }),
    roa: numeric('roa', { precision: 6, scale: 2 }),
    roic: numeric('roic', { precision: 6, scale: 2 }),
    eps: numeric('eps', { precision: 15, scale: 2 }),
    bvps: numeric('bvps', { precision: 15, scale: 2 }),
    debtToEquity: numeric('debt_to_equity', { precision: 6, scale: 2 }),
    currentRatio: numeric('current_ratio', { precision: 6, scale: 2 }),
    quickRatio: numeric('quick_ratio', { precision: 6, scale: 2 }),
    grossMargin: numeric('gross_margin', { precision: 6, scale: 2 }),
    netMargin: numeric('net_margin', { precision: 6, scale: 2 }),
    dividendYield: numeric('dividend_yield', { precision: 6, scale: 2 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('fin_ratios_stock_period_idx').on(table.stockId, table.year, table.quarter),
    index('fin_ratios_stock_id_idx').on(table.stockId),
  ]
);

export const financialRatiosRelations = relations(financialRatios, ({ one }) => ({
  stock: one(stocks, {
    fields: [financialRatios.stockId],
    references: [stocks.id],
  }),
}));

// ==========================================
// 8. VALUATION_RESULTS (Mô hình định giá)
// ==========================================
export const valuationResults = pgTable(
  'valuation_results',
  {
    id: serial('id').primaryKey(),
    stockId: integer('stock_id')
      .references(() => stocks.id, { onDelete: 'cascade' })
      .notNull(),
    modelName: text('model_name').notNull(), // DCF, PE_MULTIPLE, GRAHAM, CONSENSUS
    targetPrice: numeric('target_price', { precision: 15, scale: 2 }).notNull(),
    currentPrice: numeric('current_price', { precision: 15, scale: 2 }).notNull(),
    upsidePercent: numeric('upside_percent', { precision: 7, scale: 2 }).notNull(),
    rating: text('rating').notNull(), // UNDERVALUED, FAIR, OVERVALUED
    marginOfSafety: numeric('margin_of_safety', { precision: 6, scale: 2 }),
    assumptions: text('assumptions'),
    evaluatedAt: timestamp('evaluated_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('valuation_stock_model_idx').on(table.stockId, table.modelName),
    index('valuation_stock_id_idx').on(table.stockId),
  ]
);

export const valuationResultsRelations = relations(valuationResults, ({ one }) => ({
  stock: one(stocks, {
    fields: [valuationResults.stockId],
    references: [stocks.id],
  }),
}));

// ==========================================
// 9. MONEY_FLOWS (Dòng tiền thông minh)
// ==========================================
export const moneyFlows = pgTable(
  'money_flows',
  {
    id: serial('id').primaryKey(),
    stockId: integer('stock_id')
      .references(() => stocks.id, { onDelete: 'cascade' })
      .notNull(),
    date: date('date').notNull(),
    largeOrdersBuy: numeric('large_orders_buy', { precision: 18, scale: 2 }).default('0').notNull(), // Cá mập >1 tỷ
    largeOrdersSell: numeric('large_orders_sell', { precision: 18, scale: 2 }).default('0').notNull(),
    mediumOrdersBuy: numeric('medium_orders_buy', { precision: 18, scale: 2 }).default('0').notNull(), // Sói già 200tr-1 tỷ
    mediumOrdersSell: numeric('medium_orders_sell', { precision: 18, scale: 2 }).default('0').notNull(),
    smallOrdersBuy: numeric('small_orders_buy', { precision: 18, scale: 2 }).default('0').notNull(), // Nhỏ lẻ <200tr
    smallOrdersSell: numeric('small_orders_sell', { precision: 18, scale: 2 }).default('0').notNull(),
    netBigMoney: numeric('net_big_money', { precision: 18, scale: 2 }).default('0').notNull(),
    netRetailMoney: numeric('net_retail_money', { precision: 18, scale: 2 }).default('0').notNull(),
    activeBuyPressurePercent: numeric('active_buy_pressure_percent', { precision: 5, scale: 2 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('money_flows_stock_date_idx').on(table.stockId, table.date),
    index('money_flows_stock_id_idx').on(table.stockId),
  ]
);

export const moneyFlowsRelations = relations(moneyFlows, ({ one }) => ({
  stock: one(stocks, {
    fields: [moneyFlows.stockId],
    references: [stocks.id],
  }),
}));

// ==========================================
// 10. FOREIGN_TRADING (Giao dịch khối ngoại)
// ==========================================
export const foreignTrading = pgTable(
  'foreign_trading',
  {
    id: serial('id').primaryKey(),
    stockId: integer('stock_id')
      .references(() => stocks.id, { onDelete: 'cascade' })
      .notNull(),
    date: date('date').notNull(),
    buyVolume: bigint('buy_volume', { mode: 'number' }).default(0).notNull(),
    sellVolume: bigint('sell_volume', { mode: 'number' }).default(0).notNull(),
    netVolume: bigint('net_volume', { mode: 'number' }).default(0).notNull(),
    buyValue: numeric('buy_value', { precision: 18, scale: 2 }).default('0').notNull(),
    sellValue: numeric('sell_value', { precision: 18, scale: 2 }).default('0').notNull(),
    netValue: numeric('net_value', { precision: 18, scale: 2 }).default('0').notNull(),
    roomRemaining: bigint('room_remaining', { mode: 'number' }),
    ownershipPercent: numeric('ownership_percent', { precision: 5, scale: 2 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('foreign_trading_stock_date_idx').on(table.stockId, table.date),
    index('foreign_trading_stock_id_idx').on(table.stockId),
  ]
);

export const foreignTradingRelations = relations(foreignTrading, ({ one }) => ({
  stock: one(stocks, {
    fields: [foreignTrading.stockId],
    references: [stocks.id],
  }),
}));

// ==========================================
// 11. NEWS (Tin tức & Sự kiện tài chính)
// ==========================================
export const news = pgTable(
  'news',
  {
    id: serial('id').primaryKey(),
    stockId: integer('stock_id').references(() => stocks.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    source: text('source').notNull(),
    url: text('url'),
    summary: text('summary'),
    sentiment: text('sentiment').default('NEUTRAL').notNull(), // POSITIVE, NEGATIVE, NEUTRAL
    sentimentScore: numeric('sentiment_score', { precision: 5, scale: 2 }),
    publishedAt: timestamp('published_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('news_stock_pub_idx').on(table.stockId, table.publishedAt),
    index('news_published_at_idx').on(table.publishedAt),
  ]
);

export const newsRelations = relations(news, ({ one }) => ({
  stock: one(stocks, {
    fields: [news.stockId],
    references: [stocks.id],
  }),
}));

// ==========================================
// 12. WATCHLISTS (Danh mục theo dõi)
// ==========================================
export const watchlists = pgTable(
  'watchlists',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    description: text('description'),
    isDefault: boolean('is_default').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('watchlists_user_id_idx').on(table.userId)]
);

export const watchlistsRelations = relations(watchlists, ({ one, many }) => ({
  user: one(users, {
    fields: [watchlists.userId],
    references: [users.id],
  }),
  items: many(watchlistItems),
}));

// ==========================================
// 13. WATCHLIST_ITEMS (Cổ phiếu trong watchlist)
// ==========================================
export const watchlistItems = pgTable(
  'watchlist_items',
  {
    id: serial('id').primaryKey(),
    watchlistId: integer('watchlist_id')
      .references(() => watchlists.id, { onDelete: 'cascade' })
      .notNull(),
    stockId: integer('stock_id')
      .references(() => stocks.id, { onDelete: 'cascade' })
      .notNull(),
    notes: text('notes'),
    targetPrice: numeric('target_price', { precision: 15, scale: 2 }),
    addedAt: timestamp('added_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('watchlist_items_wl_stock_idx').on(table.watchlistId, table.stockId),
    index('watchlist_items_wl_id_idx').on(table.watchlistId),
  ]
);

export const watchlistItemsRelations = relations(watchlistItems, ({ one }) => ({
  watchlist: one(watchlists, {
    fields: [watchlistItems.watchlistId],
    references: [watchlists.id],
  }),
  stock: one(stocks, {
    fields: [watchlistItems.stockId],
    references: [stocks.id],
  }),
}));

// ==========================================
// 14. PORTFOLIOS (Danh mục đầu tư)
// ==========================================
export const portfolios = pgTable(
  'portfolios',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    currency: text('currency').default('VND').notNull(),
    initialCash: numeric('initial_cash', { precision: 18, scale: 2 }).default('0').notNull(),
    availableCash: numeric('available_cash', { precision: 18, scale: 2 }).default('0').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('portfolios_user_id_idx').on(table.userId)]
);

export const portfoliosRelations = relations(portfolios, ({ one, many }) => ({
  user: one(users, {
    fields: [portfolios.userId],
    references: [users.id],
  }),
  positions: many(portfolioPositions),
  transactions: many(portfolioTransactions),
}));

// ==========================================
// 15. PORTFOLIO_POSITIONS (Vị thế nắm giữ)
// ==========================================
export const portfolioPositions = pgTable(
  'portfolio_positions',
  {
    id: serial('id').primaryKey(),
    portfolioId: integer('portfolio_id')
      .references(() => portfolios.id, { onDelete: 'cascade' })
      .notNull(),
    stockId: integer('stock_id')
      .references(() => stocks.id, { onDelete: 'cascade' })
      .notNull(),
    quantity: integer('quantity').notNull(),
    averageCost: numeric('average_cost', { precision: 15, scale: 2 }).notNull(),
    currentPrice: numeric('current_price', { precision: 15, scale: 2 }),
    marketValue: numeric('market_value', { precision: 18, scale: 2 }),
    unrealizedPnl: numeric('unrealized_pnl', { precision: 18, scale: 2 }),
    unrealizedPnlPercent: numeric('unrealized_pnl_percent', { precision: 7, scale: 2 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('portfolio_pos_port_stock_idx').on(table.portfolioId, table.stockId),
    index('portfolio_pos_port_id_idx').on(table.portfolioId),
  ]
);

export const portfolioPositionsRelations = relations(portfolioPositions, ({ one }) => ({
  portfolio: one(portfolios, {
    fields: [portfolioPositions.portfolioId],
    references: [portfolios.id],
  }),
  stock: one(stocks, {
    fields: [portfolioPositions.stockId],
    references: [stocks.id],
  }),
}));

// ==========================================
// 16. PORTFOLIO_TRANSACTIONS (Lịch sử lệnh khớp)
// ==========================================
export const portfolioTransactions = pgTable(
  'portfolio_transactions',
  {
    id: serial('id').primaryKey(),
    portfolioId: integer('portfolio_id')
      .references(() => portfolios.id, { onDelete: 'cascade' })
      .notNull(),
    stockId: integer('stock_id')
      .references(() => stocks.id, { onDelete: 'cascade' })
      .notNull(),
    type: text('type').notNull(), // BUY, SELL, DIVIDEND_CASH, DIVIDEND_STOCK
    quantity: integer('quantity').notNull(),
    price: numeric('price', { precision: 15, scale: 2 }).notNull(),
    fee: numeric('fee', { precision: 15, scale: 2 }).default('0').notNull(),
    tax: numeric('tax', { precision: 15, scale: 2 }).default('0').notNull(),
    totalAmount: numeric('total_amount', { precision: 18, scale: 2 }).notNull(),
    transactionDate: timestamp('transaction_date').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('portfolio_tx_port_date_idx').on(table.portfolioId, table.transactionDate),
    index('portfolio_tx_stock_id_idx').on(table.stockId),
  ]
);

export const portfolioTransactionsRelations = relations(portfolioTransactions, ({ one }) => ({
  portfolio: one(portfolios, {
    fields: [portfolioTransactions.portfolioId],
    references: [portfolios.id],
  }),
  stock: one(stocks, {
    fields: [portfolioTransactions.stockId],
    references: [stocks.id],
  }),
}));

// ==========================================
// 17. SIGNALS (Khuyến nghị & Tín hiệu kỹ thuật)
// ==========================================
export const signals = pgTable(
  'signals',
  {
    id: serial('id').primaryKey(),
    stockId: integer('stock_id')
      .references(() => stocks.id, { onDelete: 'cascade' })
      .notNull(),
    signalType: text('signal_type').notNull(), // STRONG_BUY, BUY, ACCUMULATE, HOLD, SELL, TAKE_PROFIT
    timeframe: text('timeframe').default('SHORT_TERM').notNull(),
    triggerPrice: numeric('trigger_price', { precision: 15, scale: 2 }).notNull(),
    targetPrice: numeric('target_price', { precision: 15, scale: 2 }).notNull(),
    stopLoss: numeric('stop_loss', { precision: 15, scale: 2 }).notNull(),
    riskRewardRatio: numeric('risk_reward_ratio', { precision: 6, scale: 2 }),
    status: text('status').default('ACTIVE').notNull(), // ACTIVE, TRIGGERED, EXPIRED, STOPPED
    confidence: numeric('confidence', { precision: 5, scale: 2 }),
    source: text('source').default('SYSTEM').notNull(),
    generatedAt: timestamp('generated_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('signals_stock_status_idx').on(table.stockId, table.status),
    index('signals_generated_at_idx').on(table.generatedAt),
  ]
);

export const signalsRelations = relations(signals, ({ one }) => ({
  stock: one(stocks, {
    fields: [signals.stockId],
    references: [stocks.id],
  }),
}));

// ==========================================
// 18. ANALYSIS_RESULTS (Kết quả định lượng tổng hợp)
// ==========================================
export const analysisResults = pgTable(
  'analysis_results',
  {
    id: serial('id').primaryKey(),
    stockId: integer('stock_id')
      .references(() => stocks.id, { onDelete: 'cascade' })
      .notNull(),
    analysisType: text('analysis_type').notNull(), // TECHNICAL, FUNDAMENTAL, QUANT, SENTIMENT
    summary: text('summary').notNull(),
    score: numeric('score', { precision: 5, scale: 2 }).notNull(),
    metrics: text('metrics'), // JSON formatted quantitative metrics
    bullishFactors: text('bullish_factors'),
    bearishFactors: text('bearish_factors'),
    analyzedAt: timestamp('analyzed_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('analysis_results_stock_type_idx').on(table.stockId, table.analysisType),
    index('analysis_results_stock_id_idx').on(table.stockId),
  ]
);

export const analysisResultsRelations = relations(analysisResults, ({ one }) => ({
  stock: one(stocks, {
    fields: [analysisResults.stockId],
    references: [stocks.id],
  }),
}));

// ==========================================
// 19. AI_ANALYSIS (Gemini AI Investment Thesis)
// ==========================================
export const aiAnalysis = pgTable(
  'ai_analysis',
  {
    id: serial('id').primaryKey(),
    stockId: integer('stock_id')
      .references(() => stocks.id, { onDelete: 'cascade' })
      .notNull(),
    aiScore: integer('ai_score').notNull(), // 0 - 100
    confidence: numeric('confidence', { precision: 5, scale: 2 }).notNull(),
    sentiment: text('sentiment').notNull(),
    coreThesis: text('core_thesis').notNull(),
    technicalInsight: text('technical_insight'),
    fundamentalInsight: text('fundamental_insight'),
    catalysts: text('catalysts'),
    riskWarnings: text('risk_warnings'),
    modelVersion: text('model_version').default('gemini-2.5-flash').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('ai_analysis_stock_id_idx').on(table.stockId)]
);

export const aiAnalysisRelations = relations(aiAnalysis, ({ one }) => ({
  stock: one(stocks, {
    fields: [aiAnalysis.stockId],
    references: [stocks.id],
  }),
}));

// ==========================================
// 20. ALERTS (Cảnh báo biến động giá & kỹ thuật)
// ==========================================
export const alerts = pgTable(
  'alerts',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    stockId: integer('stock_id')
      .references(() => stocks.id, { onDelete: 'cascade' })
      .notNull(),
    alertType: text('alert_type').notNull(), // PRICE_ABOVE, PRICE_BELOW, VOLUME_SURGE, AI_SIGNAL, RSI_OVERBOUGHT, RSI_OVERSOLD
    targetValue: numeric('target_value', { precision: 15, scale: 2 }),
    isTriggered: boolean('is_triggered').default(false).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    message: text('message'),
    triggeredAt: timestamp('triggered_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('alerts_user_active_idx').on(table.userId, table.isActive),
    index('alerts_stock_id_idx').on(table.stockId),
  ]
);

export const alertsRelations = relations(alerts, ({ one }) => ({
  user: one(users, {
    fields: [alerts.userId],
    references: [users.id],
  }),
  stock: one(stocks, {
    fields: [alerts.stockId],
    references: [stocks.id],
  }),
}));
