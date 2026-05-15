/**
 * Investment Simulator DB helpers — 2026-05-15.
 *
 * 가상 자금 $200,000 USD 로 모의 거래. 실제 자본 영향 X.
 *
 * 핵심 함수:
 *   - getOrCreateAccount(userId) — 첫 호출 시 $200k 입금 + transaction 기록
 *   - listOpenPositions(userId) — 보유 포지션
 *   - openPosition(...) — 포지션 진입 (cash → margin lock)
 *   - closePosition(positionId, exitPrice) — 청산 + P&L 정산
 *   - listTransactions(userId, limit) — 거래 내역
 *   - resetAccount(userId) — 초기화 ($200k 재입금)
 *
 * 모든 *cash 변동* 은 transactions 테이블에 audit trail 로 기록.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  simAccounts,
  simPositions,
  simTransactions,
  type InsertSimPositionRow,
  type InsertSimTransactionRow,
  type SimAccountRow,
  type SimPositionRow,
  type SimTransactionRow,
} from "../../drizzle/schema";

export const SIMULATOR_INITIAL_CASH = 200000;
export const SIMULATOR_COMMISSION_RATE = 0.0001; // 0.01% per side

/**
 * 계정 조회 or 신규 생성 ($200k 입금).
 * @returns null = DB 미사용 환경 (Supabase 미설정)
 */
export async function getOrCreateAccount(
  userId: string,
): Promise<SimAccountRow | null> {
  const db = await getDb();
  if (!db) return null;

  const existing = await db
    .select()
    .from(simAccounts)
    .where(eq(simAccounts.userId, userId))
    .limit(1);
  if (existing.length > 0) return existing[0];

  // 신규 — $200k 입금 + transaction 기록
  const [created] = await db
    .insert(simAccounts)
    .values({
      userId,
      cash: SIMULATOR_INITIAL_CASH,
      realizedPnl: 0,
      totalCommission: 0,
      totalFunding: 0,
      liquidationCount: 0,
    })
    .returning();

  await db.insert(simTransactions).values({
    userId,
    positionId: null,
    type: "deposit",
    symbol: null,
    amount: SIMULATOR_INITIAL_CASH,
    price: null,
    note: "초기 가상 자금 $200,000 USD 입금",
  });

  return created;
}

/** 보유 포지션 (open status) */
export async function listOpenPositions(
  userId: string,
): Promise<SimPositionRow[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(simPositions)
    .where(and(eq(simPositions.userId, userId), eq(simPositions.status, "open")))
    .orderBy(desc(simPositions.openedAt));
}

/** 전체 포지션 (open + closed + liquidated) */
export async function listAllPositions(
  userId: string,
  limit = 100,
): Promise<SimPositionRow[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(simPositions)
    .where(eq(simPositions.userId, userId))
    .orderBy(desc(simPositions.openedAt))
    .limit(limit);
}

export interface OpenPositionInput {
  userId: string;
  symbol: string;
  productType: "spot" | "perp";
  side: "long" | "short";
  leverage: number; // 1 (spot) ~ 125 (perp max)
  entryPrice: number;
  quantity: number; // 계약 수량 (코인 단위)
}

export interface OpenPositionResult {
  position: SimPositionRow;
  commission: number;
  marginLocked: number;
  newCash: number;
}

/**
 * 포지션 진입.
 *
 * 정산:
 *   positionValue = entryPrice × quantity
 *   margin = positionValue / leverage   (spot leverage=1 → margin = positionValue)
 *   commission = positionValue × 0.0001 × leverage  (0.01% × leverage)
 *   cash 차감 = margin + commission
 *   liquidationPrice = entryPrice × (1 - 0.95/leverage)  (long, 5% maintenance margin)
 *                    = entryPrice × (1 + 0.95/leverage)  (short)
 */
export async function openPosition(
  input: OpenPositionInput,
): Promise<OpenPositionResult | { error: string }> {
  const db = await getDb();
  if (!db) return { error: "DB unavailable" };

  const account = await getOrCreateAccount(input.userId);
  if (!account) return { error: "Account creation failed" };

  const positionValue = input.entryPrice * input.quantity;
  const margin = positionValue / Math.max(1, input.leverage);
  const commission = positionValue * SIMULATOR_COMMISSION_RATE * input.leverage;
  const totalCost = margin + commission;

  if (account.cash < totalCost) {
    return {
      error: `잔액 부족: 필요 $${totalCost.toFixed(2)} > 현재 $${account.cash.toFixed(2)}`,
    };
  }

  // Liquidation price (5% maintenance margin)
  const liqDistance = 0.95 / Math.max(1, input.leverage);
  const liquidationPrice =
    input.side === "long"
      ? input.entryPrice * (1 - liqDistance)
      : input.entryPrice * (1 + liqDistance);

  // Insert position
  const [position] = await db
    .insert(simPositions)
    .values({
      userId: input.userId,
      symbol: input.symbol,
      productType: input.productType,
      side: input.side,
      leverage: input.leverage,
      entryPrice: input.entryPrice,
      quantity: input.quantity,
      margin,
      currentPrice: input.entryPrice,
      liquidationPrice,
      accruedCommission: commission,
      status: "open",
    } satisfies InsertSimPositionRow)
    .returning();

  // Deduct cash + record transactions
  const newCash = account.cash - totalCost;
  await db
    .update(simAccounts)
    .set({
      cash: newCash,
      totalCommission: account.totalCommission + commission,
      updatedAt: new Date(),
    })
    .where(eq(simAccounts.userId, input.userId));

  await db.insert(simTransactions).values([
    {
      userId: input.userId,
      positionId: position.id,
      type: "open",
      symbol: input.symbol,
      amount: -margin,
      price: input.entryPrice,
      note: `${input.side.toUpperCase()} ${input.symbol} ${input.quantity} @ $${input.entryPrice.toFixed(2)} (${input.leverage}x ${input.productType})`,
    },
    {
      userId: input.userId,
      positionId: position.id,
      type: "commission",
      symbol: input.symbol,
      amount: -commission,
      price: input.entryPrice,
      note: `Open commission (0.01% × ${input.leverage}x)`,
    },
  ] satisfies InsertSimTransactionRow[]);

  return { position, commission, marginLocked: margin, newCash };
}

export interface ClosePositionInput {
  userId: string;
  positionId: number;
  exitPrice: number;
  reason?: string; // "manual" | "stop_loss" | "liquidation" 등
}

export interface ClosePositionResult {
  position: SimPositionRow;
  pnl: number;
  exitCommission: number;
  netCashReturn: number;
  newCash: number;
}

/**
 * 포지션 청산.
 *
 * 정산:
 *   pnl_raw = (exit - entry) × qty × leverage           (long)
 *           = (entry - exit) × qty × leverage           (short)
 *   exit_commission = positionValue(@exit) × 0.0001 × leverage
 *   net_return = margin + pnl_raw - exit_commission - accruedFunding
 *   cash 증가 = net_return
 */
export async function closePosition(
  input: ClosePositionInput,
): Promise<ClosePositionResult | { error: string }> {
  const db = await getDb();
  if (!db) return { error: "DB unavailable" };

  const [pos] = await db
    .select()
    .from(simPositions)
    .where(
      and(eq(simPositions.id, input.positionId), eq(simPositions.userId, input.userId)),
    )
    .limit(1);
  if (!pos) return { error: "Position not found" };
  if (pos.status !== "open") return { error: `Already ${pos.status}` };

  const account = await getOrCreateAccount(input.userId);
  if (!account) return { error: "Account missing" };

  const positionValueExit = input.exitPrice * pos.quantity;
  const direction = pos.side === "long" ? 1 : -1;
  const pnlRaw = direction * (input.exitPrice - pos.entryPrice) * pos.quantity * pos.leverage;
  const exitCommission = positionValueExit * SIMULATOR_COMMISSION_RATE * pos.leverage;
  const netReturn = pos.margin + pnlRaw - exitCommission - pos.accruedFunding;
  const reason = input.reason ?? "manual";

  // Update position
  const [updated] = await db
    .update(simPositions)
    .set({
      status: reason === "liquidation" ? "liquidated" : "closed",
      closedAt: new Date(),
      closedPnl: pnlRaw - exitCommission - pos.accruedFunding,
      closedPrice: input.exitPrice,
      closedReason: reason,
      currentPrice: input.exitPrice,
      accruedCommission: pos.accruedCommission + exitCommission,
    })
    .where(eq(simPositions.id, input.positionId))
    .returning();

  // Update account
  const newCash = account.cash + netReturn;
  const liquidationDelta = reason === "liquidation" ? 1 : 0;
  await db
    .update(simAccounts)
    .set({
      cash: newCash,
      realizedPnl: account.realizedPnl + (pnlRaw - exitCommission - pos.accruedFunding),
      totalCommission: account.totalCommission + exitCommission,
      liquidationCount: account.liquidationCount + liquidationDelta,
      updatedAt: new Date(),
    })
    .where(eq(simAccounts.userId, input.userId));

  // Record transactions
  await db.insert(simTransactions).values([
    {
      userId: input.userId,
      positionId: pos.id,
      type: reason === "liquidation" ? "liquidation" : "close",
      symbol: pos.symbol,
      amount: pos.margin + pnlRaw,
      price: input.exitPrice,
      note: `Close ${pos.side} ${pos.symbol} @ $${input.exitPrice.toFixed(2)} — PnL ${(pnlRaw - exitCommission - pos.accruedFunding).toFixed(2)} (${reason})`,
    },
    {
      userId: input.userId,
      positionId: pos.id,
      type: "commission",
      symbol: pos.symbol,
      amount: -exitCommission,
      price: input.exitPrice,
      note: `Close commission (0.01% × ${pos.leverage}x)`,
    },
  ] satisfies InsertSimTransactionRow[]);

  return {
    position: updated,
    pnl: pnlRaw - exitCommission - pos.accruedFunding,
    exitCommission,
    netCashReturn: netReturn,
    newCash,
  };
}

/** 거래 내역 */
export async function listTransactions(
  userId: string,
  limit = 50,
): Promise<SimTransactionRow[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(simTransactions)
    .where(eq(simTransactions.userId, userId))
    .orderBy(desc(simTransactions.ts))
    .limit(limit);
}

/**
 * 계정 초기화 — 모든 open 포지션 강제 종료 + $200k 재입금.
 * 사용자가 "다시 시작" 클릭 시.
 */
export async function resetAccount(userId: string): Promise<{ reset: true }> {
  const db = await getDb();
  if (!db) return { reset: true };

  // 모든 open 포지션을 entry price 로 강제 close (0 P&L)
  const openPositions = await db
    .select()
    .from(simPositions)
    .where(
      and(eq(simPositions.userId, userId), eq(simPositions.status, "open")),
    );
  for (const p of openPositions) {
    await db
      .update(simPositions)
      .set({
        status: "closed",
        closedAt: new Date(),
        closedPnl: 0,
        closedPrice: p.entryPrice,
        closedReason: "reset",
      })
      .where(eq(simPositions.id, p.id));
  }

  // Account reset
  await db
    .update(simAccounts)
    .set({
      cash: SIMULATOR_INITIAL_CASH,
      realizedPnl: 0,
      totalCommission: 0,
      totalFunding: 0,
      liquidationCount: 0,
      updatedAt: new Date(),
    })
    .where(eq(simAccounts.userId, userId));

  await db.insert(simTransactions).values({
    userId,
    positionId: null,
    type: "deposit",
    symbol: null,
    amount: SIMULATOR_INITIAL_CASH,
    price: null,
    note: "계정 리셋 — $200,000 재입금",
  });

  return { reset: true };
}

/** 보유 포지션 currentPrice mark-to-market 갱신 */
export async function markToMarket(
  userId: string,
  prices: Map<string, number>,
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const positions = await listOpenPositions(userId);
  for (const p of positions) {
    const price = prices.get(p.symbol);
    if (price == null) continue;
    await db
      .update(simPositions)
      .set({ currentPrice: price })
      .where(eq(simPositions.id, p.id));
  }
}
