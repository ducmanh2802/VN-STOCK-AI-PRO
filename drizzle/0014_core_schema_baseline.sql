-- 0014 — CORE SCHEMA BASELINE
-- ============================================================================
-- The 20 original tables of src/db/schema.ts were only ever created with
-- `drizzle-kit push`; no committed migration created them, so a fresh database
-- could not be built from drizzle/*.sql. This file closes that gap.
--
-- Generated with the installed drizzle-kit (`drizzle-kit generate` against
-- src/db/schema.ts), restricted to those 20 tables, then made idempotent:
--   CREATE TABLE / INDEX -> IF NOT EXISTS
--   FOREIGN KEY          -> DO block ignoring duplicate_object
-- Object names are drizzle-kit's own, so on a database that was built with
-- `drizzle-kit push` every statement here is a no-op. Additive only: nothing is
-- dropped, renamed or altered.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "ai_analysis" (
	"id" serial PRIMARY KEY NOT NULL,
	"stock_id" integer NOT NULL,
	"ai_score" integer NOT NULL,
	"confidence" numeric(5, 2) NOT NULL,
	"sentiment" text NOT NULL,
	"core_thesis" text NOT NULL,
	"technical_insight" text,
	"fundamental_insight" text,
	"catalysts" text,
	"risk_warnings" text,
	"model_version" text DEFAULT 'gemini-2.5-flash' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"stock_id" integer NOT NULL,
	"alert_type" text NOT NULL,
	"target_value" numeric(15, 2),
	"is_triggered" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"message" text,
	"triggered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "analysis_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"stock_id" integer NOT NULL,
	"analysis_type" text NOT NULL,
	"summary" text NOT NULL,
	"score" numeric(5, 2) NOT NULL,
	"metrics" text,
	"bullish_factors" text,
	"bearish_factors" text,
	"analyzed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "financial_ratios" (
	"id" serial PRIMARY KEY NOT NULL,
	"stock_id" integer NOT NULL,
	"year" integer NOT NULL,
	"quarter" integer,
	"pe" numeric(8, 2),
	"pb" numeric(8, 2),
	"ps" numeric(8, 2),
	"roe" numeric(6, 2),
	"roa" numeric(6, 2),
	"roic" numeric(6, 2),
	"eps" numeric(15, 2),
	"bvps" numeric(15, 2),
	"debt_to_equity" numeric(6, 2),
	"current_ratio" numeric(6, 2),
	"quick_ratio" numeric(6, 2),
	"gross_margin" numeric(6, 2),
	"net_margin" numeric(6, 2),
	"dividend_yield" numeric(6, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "financial_statements" (
	"id" serial PRIMARY KEY NOT NULL,
	"stock_id" integer NOT NULL,
	"year" integer NOT NULL,
	"quarter" integer,
	"statement_type" text NOT NULL,
	"revenue" numeric(18, 2),
	"gross_profit" numeric(18, 2),
	"operating_profit" numeric(18, 2),
	"net_profit" numeric(18, 2),
	"total_assets" numeric(18, 2),
	"total_liabilities" numeric(18, 2),
	"total_equity" numeric(18, 2),
	"operating_cash_flow" numeric(18, 2),
	"investing_cash_flow" numeric(18, 2),
	"financing_cash_flow" numeric(18, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "foreign_trading" (
	"id" serial PRIMARY KEY NOT NULL,
	"stock_id" integer NOT NULL,
	"date" date NOT NULL,
	"buy_volume" bigint DEFAULT 0 NOT NULL,
	"sell_volume" bigint DEFAULT 0 NOT NULL,
	"net_volume" bigint DEFAULT 0 NOT NULL,
	"buy_value" numeric(18, 2) DEFAULT '0' NOT NULL,
	"sell_value" numeric(18, 2) DEFAULT '0' NOT NULL,
	"net_value" numeric(18, 2) DEFAULT '0' NOT NULL,
	"room_remaining" bigint,
	"ownership_percent" numeric(5, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "money_flows" (
	"id" serial PRIMARY KEY NOT NULL,
	"stock_id" integer NOT NULL,
	"date" date NOT NULL,
	"large_orders_buy" numeric(18, 2) DEFAULT '0' NOT NULL,
	"large_orders_sell" numeric(18, 2) DEFAULT '0' NOT NULL,
	"medium_orders_buy" numeric(18, 2) DEFAULT '0' NOT NULL,
	"medium_orders_sell" numeric(18, 2) DEFAULT '0' NOT NULL,
	"small_orders_buy" numeric(18, 2) DEFAULT '0' NOT NULL,
	"small_orders_sell" numeric(18, 2) DEFAULT '0' NOT NULL,
	"net_big_money" numeric(18, 2) DEFAULT '0' NOT NULL,
	"net_retail_money" numeric(18, 2) DEFAULT '0' NOT NULL,
	"active_buy_pressure_percent" numeric(5, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "news" (
	"id" serial PRIMARY KEY NOT NULL,
	"stock_id" integer,
	"title" text NOT NULL,
	"source" text NOT NULL,
	"url" text,
	"summary" text,
	"sentiment" text DEFAULT 'NEUTRAL' NOT NULL,
	"sentiment_score" numeric(5, 2),
	"published_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "portfolio_positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"portfolio_id" integer NOT NULL,
	"stock_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"average_cost" numeric(15, 2) NOT NULL,
	"current_price" numeric(15, 2),
	"market_value" numeric(18, 2),
	"unrealized_pnl" numeric(18, 2),
	"unrealized_pnl_percent" numeric(7, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "portfolio_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"portfolio_id" integer NOT NULL,
	"stock_id" integer NOT NULL,
	"type" text NOT NULL,
	"quantity" integer NOT NULL,
	"price" numeric(15, 2) NOT NULL,
	"fee" numeric(15, 2) DEFAULT '0' NOT NULL,
	"tax" numeric(15, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(18, 2) NOT NULL,
	"transaction_date" timestamp NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "portfolios" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"currency" text DEFAULT 'VND' NOT NULL,
	"initial_cash" numeric(18, 2) DEFAULT '0' NOT NULL,
	"available_cash" numeric(18, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "signals" (
	"id" serial PRIMARY KEY NOT NULL,
	"stock_id" integer NOT NULL,
	"signal_type" text NOT NULL,
	"timeframe" text DEFAULT 'SHORT_TERM' NOT NULL,
	"trigger_price" numeric(15, 2) NOT NULL,
	"target_price" numeric(15, 2) NOT NULL,
	"stop_loss" numeric(15, 2) NOT NULL,
	"risk_reward_ratio" numeric(6, 2),
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"confidence" numeric(5, 2),
	"source" text DEFAULT 'SYSTEM' NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "stock_daily" (
	"id" serial PRIMARY KEY NOT NULL,
	"stock_id" integer NOT NULL,
	"date" date NOT NULL,
	"open" numeric(15, 2) NOT NULL,
	"high" numeric(15, 2) NOT NULL,
	"low" numeric(15, 2) NOT NULL,
	"close" numeric(15, 2) NOT NULL,
	"ref_price" numeric(15, 2),
	"ceiling_price" numeric(15, 2),
	"floor_price" numeric(15, 2),
	"change" numeric(15, 2),
	"change_percent" numeric(7, 4),
	"volume" bigint NOT NULL,
	"value" numeric(18, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "stock_intraday" (
	"id" serial PRIMARY KEY NOT NULL,
	"stock_id" integer NOT NULL,
	"timestamp" timestamp NOT NULL,
	"price" numeric(15, 2) NOT NULL,
	"change" numeric(15, 2),
	"volume" bigint NOT NULL,
	"accumulated_volume" bigint,
	"accumulated_value" numeric(18, 2),
	"order_side" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "stocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"company_name" text NOT NULL,
	"exchange" text NOT NULL,
	"sector" text NOT NULL,
	"industry" text,
	"isin" text,
	"listed_shares" bigint,
	"outstanding_shares" bigint,
	"foreign_limit_percent" numeric(5, 2),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stocks_symbol_unique" UNIQUE("symbol")
);

CREATE TABLE IF NOT EXISTS "technical_indicators" (
	"id" serial PRIMARY KEY NOT NULL,
	"stock_id" integer NOT NULL,
	"date" date NOT NULL,
	"timeframe" text DEFAULT '1D' NOT NULL,
	"ma20" numeric(15, 2),
	"ma50" numeric(15, 2),
	"ma200" numeric(15, 2),
	"ema12" numeric(15, 2),
	"ema26" numeric(15, 2),
	"rsi14" numeric(6, 2),
	"macd" numeric(12, 4),
	"macd_signal" numeric(12, 4),
	"macd_histogram" numeric(12, 4),
	"bollinger_upper" numeric(15, 2),
	"bollinger_middle" numeric(15, 2),
	"bollinger_lower" numeric(15, 2),
	"volume_ma20" bigint,
	"atr14" numeric(15, 2),
	"signal_summary" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"uid" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_uid_unique" UNIQUE("uid")
);

CREATE TABLE IF NOT EXISTS "valuation_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"stock_id" integer NOT NULL,
	"model_name" text NOT NULL,
	"target_price" numeric(15, 2) NOT NULL,
	"current_price" numeric(15, 2) NOT NULL,
	"upside_percent" numeric(7, 2) NOT NULL,
	"rating" text NOT NULL,
	"margin_of_safety" numeric(6, 2),
	"assumptions" text,
	"evaluated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "watchlist_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"watchlist_id" integer NOT NULL,
	"stock_id" integer NOT NULL,
	"notes" text,
	"target_price" numeric(15, 2),
	"added_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "watchlists" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "ai_analysis" ADD CONSTRAINT "ai_analysis_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "alerts" ADD CONSTRAINT "alerts_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "analysis_results" ADD CONSTRAINT "analysis_results_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "financial_ratios" ADD CONSTRAINT "financial_ratios_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "financial_statements" ADD CONSTRAINT "financial_statements_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "foreign_trading" ADD CONSTRAINT "foreign_trading_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "money_flows" ADD CONSTRAINT "money_flows_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "news" ADD CONSTRAINT "news_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "portfolio_positions" ADD CONSTRAINT "portfolio_positions_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "portfolio_positions" ADD CONSTRAINT "portfolio_positions_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "portfolio_transactions" ADD CONSTRAINT "portfolio_transactions_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "portfolio_transactions" ADD CONSTRAINT "portfolio_transactions_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "signals" ADD CONSTRAINT "signals_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "stock_daily" ADD CONSTRAINT "stock_daily_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "stock_intraday" ADD CONSTRAINT "stock_intraday_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "technical_indicators" ADD CONSTRAINT "technical_indicators_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "valuation_results" ADD CONSTRAINT "valuation_results_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_watchlist_id_watchlists_id_fk" FOREIGN KEY ("watchlist_id") REFERENCES "public"."watchlists"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "ai_analysis_stock_id_idx" ON "ai_analysis" USING btree ("stock_id");

CREATE INDEX IF NOT EXISTS "alerts_user_active_idx" ON "alerts" USING btree ("user_id","is_active");

CREATE INDEX IF NOT EXISTS "alerts_stock_id_idx" ON "alerts" USING btree ("stock_id");

CREATE INDEX IF NOT EXISTS "analysis_results_stock_type_idx" ON "analysis_results" USING btree ("stock_id","analysis_type");

CREATE INDEX IF NOT EXISTS "analysis_results_stock_id_idx" ON "analysis_results" USING btree ("stock_id");

CREATE UNIQUE INDEX IF NOT EXISTS "fin_ratios_stock_period_idx" ON "financial_ratios" USING btree ("stock_id","year","quarter");

CREATE INDEX IF NOT EXISTS "fin_ratios_stock_id_idx" ON "financial_ratios" USING btree ("stock_id");

CREATE UNIQUE INDEX IF NOT EXISTS "fin_stmt_stock_period_idx" ON "financial_statements" USING btree ("stock_id","year","quarter","statement_type");

CREATE INDEX IF NOT EXISTS "fin_stmt_stock_id_idx" ON "financial_statements" USING btree ("stock_id");

CREATE UNIQUE INDEX IF NOT EXISTS "foreign_trading_stock_date_idx" ON "foreign_trading" USING btree ("stock_id","date");

CREATE INDEX IF NOT EXISTS "foreign_trading_stock_id_idx" ON "foreign_trading" USING btree ("stock_id");

CREATE UNIQUE INDEX IF NOT EXISTS "money_flows_stock_date_idx" ON "money_flows" USING btree ("stock_id","date");

CREATE INDEX IF NOT EXISTS "money_flows_stock_id_idx" ON "money_flows" USING btree ("stock_id");

CREATE INDEX IF NOT EXISTS "news_stock_pub_idx" ON "news" USING btree ("stock_id","published_at");

CREATE INDEX IF NOT EXISTS "news_published_at_idx" ON "news" USING btree ("published_at");

CREATE UNIQUE INDEX IF NOT EXISTS "portfolio_pos_port_stock_idx" ON "portfolio_positions" USING btree ("portfolio_id","stock_id");

CREATE INDEX IF NOT EXISTS "portfolio_pos_port_id_idx" ON "portfolio_positions" USING btree ("portfolio_id");

CREATE INDEX IF NOT EXISTS "portfolio_tx_port_date_idx" ON "portfolio_transactions" USING btree ("portfolio_id","transaction_date");

CREATE INDEX IF NOT EXISTS "portfolio_tx_stock_id_idx" ON "portfolio_transactions" USING btree ("stock_id");

CREATE INDEX IF NOT EXISTS "portfolios_user_id_idx" ON "portfolios" USING btree ("user_id");

CREATE INDEX IF NOT EXISTS "signals_stock_status_idx" ON "signals" USING btree ("stock_id","status");

CREATE INDEX IF NOT EXISTS "signals_generated_at_idx" ON "signals" USING btree ("generated_at");

CREATE UNIQUE INDEX IF NOT EXISTS "stock_daily_stock_date_idx" ON "stock_daily" USING btree ("stock_id","date");

CREATE INDEX IF NOT EXISTS "stock_daily_date_idx" ON "stock_daily" USING btree ("date");

CREATE INDEX IF NOT EXISTS "stock_daily_stock_id_idx" ON "stock_daily" USING btree ("stock_id");

CREATE UNIQUE INDEX IF NOT EXISTS "stock_intraday_stock_time_idx" ON "stock_intraday" USING btree ("stock_id","timestamp");

CREATE INDEX IF NOT EXISTS "stock_intraday_timestamp_idx" ON "stock_intraday" USING btree ("timestamp");

CREATE UNIQUE INDEX IF NOT EXISTS "stocks_symbol_idx" ON "stocks" USING btree ("symbol");

CREATE INDEX IF NOT EXISTS "stocks_exchange_idx" ON "stocks" USING btree ("exchange");

CREATE INDEX IF NOT EXISTS "stocks_sector_idx" ON "stocks" USING btree ("sector");

CREATE UNIQUE INDEX IF NOT EXISTS "tech_indicators_stock_date_tf_idx" ON "technical_indicators" USING btree ("stock_id","date","timeframe");

CREATE INDEX IF NOT EXISTS "tech_indicators_stock_id_idx" ON "technical_indicators" USING btree ("stock_id");

CREATE UNIQUE INDEX IF NOT EXISTS "users_uid_idx" ON "users" USING btree ("uid");

CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users" USING btree ("email");

CREATE INDEX IF NOT EXISTS "valuation_stock_model_idx" ON "valuation_results" USING btree ("stock_id","model_name");

CREATE INDEX IF NOT EXISTS "valuation_stock_id_idx" ON "valuation_results" USING btree ("stock_id");

CREATE UNIQUE INDEX IF NOT EXISTS "watchlist_items_wl_stock_idx" ON "watchlist_items" USING btree ("watchlist_id","stock_id");

CREATE INDEX IF NOT EXISTS "watchlist_items_wl_id_idx" ON "watchlist_items" USING btree ("watchlist_id");

CREATE INDEX IF NOT EXISTS "watchlists_user_id_idx" ON "watchlists" USING btree ("user_id");
