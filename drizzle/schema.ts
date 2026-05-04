import {
  boolean,
  doublePrecision,
  integer,
  pgEnum,
  pgTable,
  serial,
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
  exitReason: varchar("exit_reason", { length: 100 }),
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
