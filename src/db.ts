import { eq, desc, and, asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  signals,
  positions,
  alertSettings,
  backtestRuns,
  backtestTrades,
  type InsertSignal,
  type InsertPosition,
  type InsertAlertSetting,
} from "../drizzle/schema";

let _client: ReturnType<typeof postgres> | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (_db) return _db;
  if (!process.env.DATABASE_URL) return null;

  try {
    _client = postgres(process.env.DATABASE_URL, {
      // Supabase pooler runs in transaction mode — disable prepared statements.
      prepare: false,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    });
    _db = drizzle(_client);
  } catch (error) {
    console.warn("[Database] Failed to connect:", error);
    _db = null;
  }
  return _db;
}

// ─── Signals ───────────────────────────────────────────────

export async function createSignal(signal: InsertSignal) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .insert(signals)
    .values(signal)
    .returning({ id: signals.id });
  return row?.id ?? null;
}

export async function getActiveSignals() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(signals)
    .where(eq(signals.status, "active"))
    .orderBy(desc(signals.detectedAt));
}

export async function getSignalHistory(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(signals)
    .orderBy(desc(signals.detectedAt))
    .limit(limit);
}

export async function updateSignalStatus(
  id: number,
  status: "active" | "target_hit" | "expired" | "closed",
  extra?: {
    currentPrice?: number;
    targetHitAt?: Date;
    closedAt?: Date;
    exitReason?: string;
  }
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(signals)
    .set({ status, ...extra })
    .where(eq(signals.id, id));
}

// ─── Positions ─────────────────────────────────────────────

export async function createPosition(position: InsertPosition) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .insert(positions)
    .values(position)
    .returning({ id: positions.id });
  return row?.id ?? null;
}

export async function getUserPositions(
  userId: string,
  status?: "open" | "closed" | "liquidated"
) {
  const db = await getDb();
  if (!db) return [];
  const conditions = status
    ? and(eq(positions.userId, userId), eq(positions.status, status))
    : eq(positions.userId, userId);
  return db
    .select()
    .from(positions)
    .where(conditions)
    .orderBy(desc(positions.openedAt));
}

export async function updatePosition(
  id: number,
  data: Partial<{
    currentPrice: number;
    pnlPercent: number;
    pnlAmount: number;
    status: "open" | "closed" | "liquidated";
    closedAt: Date;
    closePrice: number;
  }>
) {
  const db = await getDb();
  if (!db) return;
  await db.update(positions).set(data).where(eq(positions.id, id));
}

export async function closePosition(id: number, closePrice: number) {
  const db = await getDb();
  if (!db) return;

  const [pos] = await db
    .select()
    .from(positions)
    .where(eq(positions.id, id))
    .limit(1);
  if (!pos) return;

  const pnlPercent =
    ((closePrice - pos.entryPrice) / pos.entryPrice) * 100 * pos.leverage;
  const pnlAmount =
    (closePrice - pos.entryPrice) * pos.quantity * pos.leverage;

  await db
    .update(positions)
    .set({
      status: "closed",
      closePrice,
      closedAt: new Date(),
      pnlPercent,
      pnlAmount,
      currentPrice: closePrice,
    })
    .where(eq(positions.id, id));
}

// ─── Alert Settings ────────────────────────────────────────

export async function getUserAlertSettings(userId: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(alertSettings)
    .where(eq(alertSettings.userId, userId));
}

export async function upsertAlertSetting(setting: InsertAlertSetting) {
  const db = await getDb();
  if (!db) return null;

  if (setting.id) {
    await db
      .update(alertSettings)
      .set(setting)
      .where(eq(alertSettings.id, setting.id));
    return setting.id;
  }

  const [row] = await db
    .insert(alertSettings)
    .values(setting)
    .returning({ id: alertSettings.id });
  return row?.id ?? null;
}

export async function deleteAlertSetting(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(alertSettings).where(eq(alertSettings.id, id));
}

// ─── Backtest ──────────────────────────────────────────────

/**
 * 백테스트 실행 목록 조회 (최신순)
 */
export async function getBacktestRuns(limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(backtestRuns)
    .orderBy(desc(backtestRuns.createdAt))
    .limit(limit);
}

/**
 * 특정 백테스트 run 상세 조회
 */
export async function getBacktestRunDetail(runId: number) {
  const db = await getDb();
  if (!db) return null;
  const [run] = await db
    .select()
    .from(backtestRuns)
    .where(eq(backtestRuns.id, runId))
    .limit(1);
  return run ?? null;
}

/**
 * 특정 run의 개별 트레이드 목록 조회
 */
export async function getBacktestRunTrades(input: {
  runId: number;
  symbol?: string;
  win?: boolean;
  limit: number;
  offset: number;
}) {
  const db = await getDb();
  if (!db) return { trades: [], total: 0 };

  const conditions = [eq(backtestTrades.runId, input.runId)];
  if (input.symbol) conditions.push(eq(backtestTrades.symbol, input.symbol));
  if (input.win !== undefined) conditions.push(eq(backtestTrades.win, input.win));

  const rows = await db
    .select()
    .from(backtestTrades)
    .where(and(...conditions))
    .orderBy(asc(backtestTrades.signalTs))
    .limit(input.limit)
    .offset(input.offset);

  return { trades: rows, total: rows.length };
}

// schema tables re-exported so runner.ts can dynamically import from "../../drizzle/schema"
// (no additional exports needed here)
