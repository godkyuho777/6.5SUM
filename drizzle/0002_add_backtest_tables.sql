-- Tradelab: Backtesting Engine Tables
-- Migration 0002 — backtest_runs + backtest_trades

CREATE TABLE IF NOT EXISTS "backtest_runs" (
  "id"            serial PRIMARY KEY,
  "run_name"      varchar(100),
  "symbols"       varchar(3000) NOT NULL,
  "tf"            varchar(10) NOT NULL,
  "start_date"    timestamp with time zone NOT NULL,
  "end_date"      timestamp with time zone NOT NULL,
  "total_trades"  integer NOT NULL DEFAULT 0,
  "win_rate"      double precision,
  "avg_return"    double precision,
  "sharpe"        double precision,
  "max_drawdown"  double precision,
  "profit_factor" double precision,
  "status"        varchar(20) NOT NULL DEFAULT 'running',
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "completed_at"  timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "backtest_trades" (
  "id"              serial PRIMARY KEY,
  "run_id"          integer NOT NULL,
  "symbol"          varchar(20) NOT NULL,
  "tf"              varchar(10) NOT NULL,
  "signal_ts"       double precision NOT NULL,
  "entry_price"     double precision NOT NULL,
  "exit_price"      double precision NOT NULL,
  "stop_loss"       double precision NOT NULL,
  "target"          double precision NOT NULL,
  "rsi"             double precision NOT NULL,
  "bb_lower"        double precision NOT NULL,
  "bb_middle"       double precision NOT NULL,
  "bb_upper"        double precision NOT NULL,
  "adx"             double precision NOT NULL,
  "plus_di"         double precision NOT NULL,
  "minus_di"        double precision NOT NULL,
  "signal_strength" double precision NOT NULL,
  "exit_reason"     varchar(30) NOT NULL,
  "return_pct"      double precision NOT NULL,
  "max_favorable"   double precision NOT NULL,
  "max_adverse"     double precision NOT NULL,
  "win"             boolean NOT NULL,
  "holding_candles" integer NOT NULL,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT "backtest_trades_run_id_fk"
    FOREIGN KEY ("run_id") REFERENCES "backtest_runs" ("id") ON DELETE CASCADE
);

-- 조회 성능 인덱스
CREATE INDEX IF NOT EXISTS "backtest_runs_status_idx"
  ON "backtest_runs" ("status");

CREATE INDEX IF NOT EXISTS "backtest_runs_created_at_idx"
  ON "backtest_runs" ("created_at" DESC);

CREATE INDEX IF NOT EXISTS "backtest_trades_run_id_idx"
  ON "backtest_trades" ("run_id");

CREATE INDEX IF NOT EXISTS "backtest_trades_symbol_idx"
  ON "backtest_trades" ("symbol");

CREATE INDEX IF NOT EXISTS "backtest_trades_win_idx"
  ON "backtest_trades" ("win");
