import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const signalStatus = pgEnum("signal_status", [
  "active",
  "target_hit",
  "expired",
  "closed",
]);

export const positionStatus = pgEnum("position_status", [
  "open",
  "closed",
  "liquidated",
]);

/**
 * Trading signals detected by the bot.
 */
export const signals = pgTable("signals", {
  id: serial("id").primaryKey(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  entryPrice: doublePrecision("entry_price").notNull(),
  currentPrice: doublePrecision("current_price"),
  targetPrice: doublePrecision("target_price"),
  rsiValue: doublePrecision("rsi_value").notNull(),
  bbLower: doublePrecision("bb_lower").notNull(),
  bbMiddle: doublePrecision("bb_middle").notNull(),
  bbUpper: doublePrecision("bb_upper").notNull(),
  adxValue: doublePrecision("adx_value").notNull(),
  plusDi: doublePrecision("plus_di").notNull(),
  minusDi: doublePrecision("minus_di").notNull(),
  status: signalStatus("status").default("active").notNull(),
  detectedAt: timestamp("detected_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  targetHitAt: timestamp("target_hit_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  // v6.3 EXIT category (Part II.1): A=profit, B=reversal, C=protection, D=time, STOP=stop loss.
  exitCategory: varchar("exit_category", { length: 1 }),
  exitAction: varchar("exit_action", { length: 20 }),
  exitRatio: doublePrecision("exit_ratio"),
  exitReversalScore: doublePrecision("exit_reversal_score"),
  exitReason: varchar("exit_reason", { length: 200 }),
  // v6.5 multiplier breakdown — every emitted signal stores its
  // confidence pipeline so the FE can render the `base × confluence ×
  // wave × macro × onchain → final` chain on detail pages.
  macroScore: doublePrecision("macro_score"),
  macroRegime: varchar("macro_regime", { length: 20 }),
  macroMult: doublePrecision("macro_mult"),
  onchainScore: doublePrecision("onchain_score"),
  onchainRegime: varchar("onchain_regime", { length: 30 }),
  onchainMult: doublePrecision("onchain_mult"),
  confluenceMult: doublePrecision("confluence_mult"),
  waveMult: doublePrecision("wave_mult"),
  finalConfidence: doublePrecision("final_confidence"),
  sizeFactor: varchar("size_factor", { length: 10 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type Signal = typeof signals.$inferSelect;
export type InsertSignal = typeof signals.$inferInsert;

/**
 * User positions tracked from signals.
 * userId references Supabase auth.users(id) — no FK declared at the Drizzle
 * level because that schema lives outside this codebase. Integrity is enforced
 * by the application layer, which always derives userId from the verified JWT.
 */
export const positions = pgTable("positions", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").notNull(),
  signalId: integer("signal_id"),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  entryPrice: doublePrecision("entry_price").notNull(),
  targetPrice: doublePrecision("target_price"),
  currentPrice: doublePrecision("current_price"),
  quantity: doublePrecision("quantity").notNull(),
  leverage: integer("leverage").default(1).notNull(),
  pnlPercent: doublePrecision("pnl_percent"),
  pnlAmount: doublePrecision("pnl_amount"),
  status: positionStatus("status").default("open").notNull(),
  openedAt: timestamp("opened_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closePrice: doublePrecision("close_price"),
  // v6.3 EXIT state (Part II.1): bar index of entry candle for EXIT-D
  // time stop, current stop price for EXIT-C trailing/breakeven, and
  // a list of partial exits taken so EXIT-A tier-1 doesn't re-fire.
  entryBarIndex: integer("entry_bar_index"),
  currentStop: doublePrecision("current_stop"),
  stopMovedToBreakeven: boolean("stop_moved_to_breakeven")
    .default(false)
    .notNull(),
  partialExitsTaken: jsonb("partial_exits_taken").default([]).notNull(),
  tier1PartialExitTaken: boolean("tier1_partial_exit_taken")
    .default(false)
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type Position = typeof positions.$inferSelect;
export type InsertPosition = typeof positions.$inferInsert;

/**
 * User alert settings for customized monitoring.
 */
export const alertSettings = pgTable("alert_settings", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").notNull(),
  symbol: varchar("symbol", { length: 20 }),
  rsiLow: doublePrecision("rsi_low").default(30),
  rsiHigh: doublePrecision("rsi_high").default(35),
  adxThreshold: doublePrecision("adx_threshold").default(30),
  targetRsi: doublePrecision("target_rsi").default(70),
  targetAdx: doublePrecision("target_adx").default(30),
  targetPlusDi: doublePrecision("target_plus_di").default(30),
  useBbLower: boolean("use_bb_lower").default(true),
  useBbMiddleTarget: boolean("use_bb_middle_target").default(true),
  enabled: boolean("enabled").default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type AlertSetting = typeof alertSettings.$inferSelect;
export type InsertAlertSetting = typeof alertSettings.$inferInsert;

/**
 * Strategy Charter audit log — Part II.2 §3 auto-validation.
 *
 * One row per validateAgainstCharter() invocation (CI on PRs, plus
 * runtime tagging on signal decisions). userId follows the existing
 * convention (no FK on auth.users; trust is at the app layer).
 */
export const charterAudits = pgTable("charter_audits", {
  id: serial("id").primaryKey(),
  strategyName: varchar("strategy_name", { length: 100 }).notNull(),
  charterVersion: varchar("charter_version", { length: 20 }).notNull(),
  prOrCommit: varchar("pr_or_commit", { length: 120 }),
  passed: boolean("passed").notNull(),
  coverageCount: integer("coverage_count").notNull(),
  coverageTotal: integer("coverage_total").default(7).notNull(),
  violations: jsonb("violations").default([]).notNull(),
  missingDimensions: text("missing_dimensions").array().default([]).notNull(),
  dimensionsCovered: jsonb("dimensions_covered").default({}).notNull(),
  userId: uuid("user_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type CharterAudit = typeof charterAudits.$inferSelect;
export type InsertCharterAudit = typeof charterAudits.$inferInsert;

/**
 * Macro Liquidity snapshot — v6.5 §2.
 *
 * Daily cadence. Latest row drives the `macro_mult` in the
 * confidence orchestrator. Older rows kept for backtest replay.
 */
export const macroSnapshots = pgTable("macro_snapshots", {
  id: serial("id").primaryKey(),
  ts: timestamp("ts", { withTimezone: true }).defaultNow().notNull(),
  sofr: doublePrecision("sofr"),
  iorb: doublePrecision("iorb"),
  rrpChange30d: doublePrecision("rrp_change_30d"),
  tgaChange30d: doublePrecision("tga_change_30d"),
  fedBalanceChange30d: doublePrecision("fed_balance_change_30d"),
  realFedFundsRate: doublePrecision("real_fed_funds_rate"),
  score: doublePrecision("score").notNull(),
  regime: varchar("regime", { length: 20 }).notNull(),
  breakdown: jsonb("breakdown").default({}).notNull(),
  koreaModifier: doublePrecision("korea_modifier").default(0),
  krwChange30d: doublePrecision("krw_change_30d"),
  bokRateChange90d: doublePrecision("bok_rate_change_90d"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type MacroSnapshot = typeof macroSnapshots.$inferSelect;
export type InsertMacroSnapshot = typeof macroSnapshots.$inferInsert;

/**
 * Onchain composite snapshot — v6.5 §3.
 *
 * 1h cadence per symbol. The latest row drives the `onchain_mult`
 * in the confidence orchestrator.
 */
export const onchainSnapshots = pgTable("onchain_snapshots", {
  id: serial("id").primaryKey(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  ts: timestamp("ts", { withTimezone: true }).defaultNow().notNull(),
  tier: varchar("tier", { length: 20 }).notNull(),
  score: doublePrecision("score").notNull(),
  regime: varchar("regime", { length: 30 }).notNull(),
  breakdown: jsonb("breakdown").default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type OnchainSnapshot = typeof onchainSnapshots.$inferSelect;
export type InsertOnchainSnapshot = typeof onchainSnapshots.$inferInsert;

// ─────────────────────────────────────────────────────────
// Backtesting Tables
// ─────────────────────────────────────────────────────────

/**
 * Each backtest run metadata and aggregate stats.
 */
export const backtestRuns = pgTable("backtest_runs", {
  id: serial("id").primaryKey(),
  runName: varchar("run_name", { length: 100 }),
  /** JSON array of symbol strings */
  symbols: varchar("symbols", { length: 3000 }).notNull(),
  tf: varchar("tf", { length: 10 }).notNull(),
  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
  endDate: timestamp("end_date", { withTimezone: true }).notNull(),
  totalTrades: integer("total_trades").default(0).notNull(),
  winRate: doublePrecision("win_rate"),
  avgReturn: doublePrecision("avg_return"),
  sharpe: doublePrecision("sharpe"),
  maxDrawdown: doublePrecision("max_drawdown"),
  profitFactor: doublePrecision("profit_factor"),
  /** running | complete | failed */
  status: varchar("status", { length: 20 }).default("running").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export type BacktestRun = typeof backtestRuns.$inferSelect;
export type InsertBacktestRun = typeof backtestRuns.$inferInsert;

/**
 * Individual trade results from a backtest run.
 * runId → backtest_runs.id
 */
export const backtestTrades = pgTable("backtest_trades", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  tf: varchar("tf", { length: 10 }).notNull(),
  /** Signal candle openTime in ms */
  signalTs: doublePrecision("signal_ts").notNull(),
  entryPrice: doublePrecision("entry_price").notNull(),
  exitPrice: doublePrecision("exit_price").notNull(),
  stopLoss: doublePrecision("stop_loss").notNull(),
  target: doublePrecision("target").notNull(),
  rsi: doublePrecision("rsi").notNull(),
  bbLower: doublePrecision("bb_lower").notNull(),
  bbMiddle: doublePrecision("bb_middle").notNull(),
  bbUpper: doublePrecision("bb_upper").notNull(),
  adx: doublePrecision("adx").notNull(),
  plusDi: doublePrecision("plus_di").notNull(),
  minusDi: doublePrecision("minus_di").notNull(),
  signalStrength: doublePrecision("signal_strength").notNull(),
  /** target_hit | stop_loss | window_expired */
  exitReason: varchar("exit_reason", { length: 30 }).notNull(),
  returnPct: doublePrecision("return_pct").notNull(),
  maxFavorable: doublePrecision("max_favorable").notNull(),
  maxAdverse: doublePrecision("max_adverse").notNull(),
  win: boolean("win").notNull(),
  holdingCandles: integer("holding_candles").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type BacktestTradeRow = typeof backtestTrades.$inferSelect;
export type InsertBacktestTradeRow = typeof backtestTrades.$inferInsert;

// ─────────────────────────────────────────────────────────
// Coin Detail Workstation — Calendar Events
// ─────────────────────────────────────────────────────────

/**
 * Per-symbol or global market events (macro releases, token unlocks, forks,
 * halvings, listings, custom user-added events). Powers the CoinDetail
 * calendar/timeline panel.
 *
 * symbol: 'BTCUSDT' (specific) or 'GLOBAL' (macro events visible to all coins).
 * event_type: macro | unlock | fork | halving | listing | custom
 *
 * createdBy is a Supabase auth.users(id) UUID — no FK because that schema lives
 * outside this codebase (same convention as positions.userId).
 */
export const coinEvents = pgTable("coin_events", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  eventType: text("event_type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  source: text("source"),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type CoinEvent = typeof coinEvents.$inferSelect;
export type InsertCoinEvent = typeof coinEvents.$inferInsert;
