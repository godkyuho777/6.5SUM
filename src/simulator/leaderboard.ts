/**
 * Simulator Leaderboard — 2026-05-21.
 *
 * INVESTMENT_SIMULATOR_AUDIT.md §5 Phase 2 — Backend wiring.
 *
 * 시뮬레이터는 로그인 없는 익명 모드. opt-in 한 사용자만 ranking 에 참여.
 * Frontend localStorage 의 `simUser.id` (crypto.randomUUID) = `clientToken`
 * 으로 단순 ownership 검증 (Supabase Auth 미통합).
 *
 * 핵심 함수:
 *   - optInLeaderboard(input)   — 신규 등록 or nickname 갱신 (upsert by clientToken)
 *   - optOutLeaderboard(input)  — opted_out_at 설정 → fetch 제외
 *   - syncLeaderboardStats(input) — 본인 stats 갱신 + snapshot 저장 (5분 rate limit)
 *   - fetchLeaderboard(input)   — pnlPct DESC 정렬 + 익명화 응답
 *
 * 보안:
 *   - clientToken 은 response 에 절대 노출 X. 익명 hash id 만 (`anon_<8-hex>`).
 *   - Rate limit 5분 (last_synced_at 비교).
 *   - opt-out 후 sync 시도 → throw "OPTED_OUT".
 *
 * 헌장:
 *   - 본 모듈은 시뮬레이션 전용 ranking. BBDX 시그널 / 진입 결정 / 백테스트 시스템과 완전 분리.
 *   - 헌장 R3 (modifier-only) 와 무관 — 거래 결정에 영향 주지 않음.
 */

import { createHash } from "node:crypto";
import { desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  simulatorLeaderboardUsers,
  simulatorLeaderboardSnapshots,
  type SimulatorLeaderboardUserRow,
  type InsertSimulatorLeaderboardUserRow,
} from "../../drizzle/schema";

/** Sync rate limit window. 같은 clientToken 은 5분 이내 재 sync 거부. */
export const SYNC_RATE_LIMIT_MS = 5 * 60 * 1000;

/** Default initial capital — frontend INITIAL_CASH 와 일치 ($200,000). */
export const LEADERBOARD_INITIAL_CAPITAL = 200_000;

// ─── Error codes (router 가 trpc error 로 변환하기 쉽도록 string code) ─

export type LeaderboardErrorCode =
  | "DB_UNAVAILABLE"
  | "USER_NOT_FOUND"
  | "OPTED_OUT"
  | "RATE_LIMITED";

export interface LeaderboardError {
  ok: false;
  code: LeaderboardErrorCode;
  message: string;
}

// ─── Input / Output types ────────────────────────────────────────

export interface OptInInput {
  clientToken: string;
  nickname: string;
}

export interface OptInResult {
  ok: true;
  id: string;          // 익명화된 hash id (response 노출용)
  nickname: string;
  optedInAt: Date;
  reactivated: boolean; // 기존 opt-out 상태에서 재 활성화된 경우 true
}

export interface OptOutInput {
  clientToken: string;
}

export interface OptOutResult {
  ok: true;
  optedOutAt: Date;
}

export interface SyncStatsInput {
  clientToken: string;
  currentCapital: number;
  totalPnl: number;
  pnlPct: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  maxDrawdownPct: number;
}

export interface SyncStatsResult {
  ok: true;
  syncedAt: Date;
}

export type LeaderboardPeriod = "all" | "30d" | "7d" | "24h";

export interface FetchLeaderboardInput {
  clientToken?: string;
  period: LeaderboardPeriod;
  limit: number;
}

export interface LeaderboardEntryDto {
  /** 익명 hash id — clientToken 노출 방지. */
  id: string;
  nickname: string;
  currentCapital: number;
  initialCapital: number;
  totalPnl: number;
  pnlPct: number;
  totalTrades: number;
  winRate: number;
  rank: number;
  isYou: boolean;
}

export interface FetchLeaderboardResult {
  ok: true;
  entries: LeaderboardEntryDto[];
  totalUsers: number;
  yourRank: number | null;
}

// ─── Helpers ────────────────────────────────────────────────────

/**
 * 익명 hash id — sha256(clientToken)[0:8] 형식 (앞 8자, 짧지만 충돌율 매우 낮음).
 * response 에 노출되어도 reverse 불가능 (단방향).
 */
export function anonymizeClientToken(clientToken: string): string {
  const hash = createHash("sha256").update(clientToken).digest("hex");
  return `anon_${hash.slice(0, 8)}`;
}

/** Rate limit check — last sync 가 SYNC_RATE_LIMIT_MS 이내면 reject. */
export function isRateLimited(
  lastSyncedAt: Date | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!lastSyncedAt) return false;
  return now - lastSyncedAt.getTime() < SYNC_RATE_LIMIT_MS;
}

// ─── Store interface — 테스트 + production 분리 ───────────────────

/**
 * Leaderboard 영속 저장소 인터페이스.
 * Production: DrizzleLeaderboardStore (DB).
 * Tests: InMemoryLeaderboardStore.
 */
export interface LeaderboardStore {
  findUserByToken(clientToken: string): Promise<SimulatorLeaderboardUserRow | null>;
  /**
   * Upsert by clientToken. 기존 row 있으면 nickname + opted_out_at=null 갱신.
   * 신규면 새 row insert. 반환: { row, reactivated }.
   */
  upsertUser(input: {
    clientToken: string;
    nickname: string;
    now: Date;
  }): Promise<{ row: SimulatorLeaderboardUserRow; reactivated: boolean }>;
  markOptOut(userId: string, now: Date): Promise<void>;
  updateStatsAndLog(input: {
    userId: string;
    stats: Omit<SyncStatsInput, "clientToken">;
    now: Date;
  }): Promise<void>;
  /** opted_out_at IS NULL 만, pnlPct DESC 정렬, limit 적용. */
  listActiveUsers(limit: number): Promise<SimulatorLeaderboardUserRow[]>;
  countActiveUsers(): Promise<number>;
}

// ─── Drizzle store (production) ──────────────────────────────────

function makeDrizzleStore(db: NonNullable<Awaited<ReturnType<typeof getDb>>>): LeaderboardStore {
  return {
    async findUserByToken(clientToken) {
      const rows = await db
        .select()
        .from(simulatorLeaderboardUsers)
        .where(eq(simulatorLeaderboardUsers.clientToken, clientToken))
        .limit(1);
      return rows[0] ?? null;
    },

    async upsertUser({ clientToken, nickname, now }) {
      const existing = await db
        .select()
        .from(simulatorLeaderboardUsers)
        .where(eq(simulatorLeaderboardUsers.clientToken, clientToken))
        .limit(1);

      if (existing.length > 0) {
        const prev = existing[0];
        const reactivated = prev.optedOutAt !== null;
        const [updated] = await db
          .update(simulatorLeaderboardUsers)
          .set({
            nickname,
            optedOutAt: null,
            // reactivated 인 경우 optedInAt 도 갱신
            ...(reactivated ? { optedInAt: now } : {}),
          })
          .where(eq(simulatorLeaderboardUsers.id, prev.id))
          .returning();
        return { row: updated, reactivated };
      }

      const insertValues: InsertSimulatorLeaderboardUserRow = {
        clientToken,
        nickname,
        optedInAt: now,
        currentCapital: LEADERBOARD_INITIAL_CAPITAL,
        initialCapital: LEADERBOARD_INITIAL_CAPITAL,
        totalPnl: 0,
        pnlPct: 0,
        totalTrades: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        maxDrawdownPct: 0,
      };
      const [created] = await db
        .insert(simulatorLeaderboardUsers)
        .values(insertValues)
        .returning();
      return { row: created, reactivated: false };
    },

    async markOptOut(userId, now) {
      await db
        .update(simulatorLeaderboardUsers)
        .set({ optedOutAt: now })
        .where(eq(simulatorLeaderboardUsers.id, userId));
    },

    async updateStatsAndLog({ userId, stats, now }) {
      await db
        .update(simulatorLeaderboardUsers)
        .set({
          currentCapital: stats.currentCapital,
          totalPnl: stats.totalPnl,
          pnlPct: stats.pnlPct,
          totalTrades: stats.totalTrades,
          wins: stats.wins,
          losses: stats.losses,
          winRate: stats.winRate,
          maxDrawdownPct: stats.maxDrawdownPct,
          lastSyncedAt: now,
        })
        .where(eq(simulatorLeaderboardUsers.id, userId));

      // Snapshot 기록 (period query 용 — Phase 2)
      await db.insert(simulatorLeaderboardSnapshots).values({
        userId,
        snapshotAt: now,
        currentCapital: stats.currentCapital,
        pnlPct: stats.pnlPct,
        totalTrades: stats.totalTrades,
      });
    },

    async listActiveUsers(limit) {
      return db
        .select()
        .from(simulatorLeaderboardUsers)
        .where(isNull(simulatorLeaderboardUsers.optedOutAt))
        .orderBy(
          desc(simulatorLeaderboardUsers.pnlPct),
          desc(simulatorLeaderboardUsers.currentCapital),
        )
        .limit(limit);
    },

    async countActiveUsers() {
      const rows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(simulatorLeaderboardUsers)
        .where(isNull(simulatorLeaderboardUsers.optedOutAt));
      return rows[0]?.count ?? 0;
    },
  };
}

/** DB 미설정 환경(stub) — 모든 함수 graceful fallback. */
const DB_UNAVAILABLE_ERR: LeaderboardError = {
  ok: false,
  code: "DB_UNAVAILABLE",
  message: "DB 미설정 — Supabase 연결 필요",
};

async function getStore(): Promise<LeaderboardStore | null> {
  const db = await getDb();
  if (!db) return null;
  return makeDrizzleStore(db);
}

// ─── Public API (router 에서 호출) ──────────────────────────────

/**
 * Opt-in — 신규 가입 or 기존 row 재활성화.
 * 같은 clientToken 으로 재호출 시 nickname 갱신.
 * opt-out 했던 사용자가 재 호출 시 reactivated=true.
 */
export async function optInLeaderboard(
  input: OptInInput,
): Promise<OptInResult | LeaderboardError> {
  const store = await getStore();
  if (!store) return DB_UNAVAILABLE_ERR;
  return optInLeaderboardWithStore(store, input, new Date());
}

export async function optInLeaderboardWithStore(
  store: LeaderboardStore,
  input: OptInInput,
  now: Date,
): Promise<OptInResult> {
  const { row, reactivated } = await store.upsertUser({
    clientToken: input.clientToken,
    nickname: input.nickname,
    now,
  });
  return {
    ok: true,
    id: anonymizeClientToken(input.clientToken),
    nickname: row.nickname,
    optedInAt: row.optedInAt,
    reactivated,
  };
}

/** Opt-out — clientToken ownership 검증 후 opted_out_at 설정. */
export async function optOutLeaderboard(
  input: OptOutInput,
): Promise<OptOutResult | LeaderboardError> {
  const store = await getStore();
  if (!store) return DB_UNAVAILABLE_ERR;
  return optOutLeaderboardWithStore(store, input, new Date());
}

export async function optOutLeaderboardWithStore(
  store: LeaderboardStore,
  input: OptOutInput,
  now: Date,
): Promise<OptOutResult | LeaderboardError> {
  const user = await store.findUserByToken(input.clientToken);
  if (!user) {
    return { ok: false, code: "USER_NOT_FOUND", message: "Not opted-in" };
  }
  await store.markOptOut(user.id, now);
  return { ok: true, optedOutAt: now };
}

/**
 * Sync stats — clientToken 으로 본인 row 찾아 갱신.
 * Rate limit: 마지막 sync 가 5분 이내면 reject.
 * opt-out 사용자 sync 시도 → reject.
 */
export async function syncLeaderboardStats(
  input: SyncStatsInput,
): Promise<SyncStatsResult | LeaderboardError> {
  const store = await getStore();
  if (!store) return DB_UNAVAILABLE_ERR;
  return syncLeaderboardStatsWithStore(store, input, new Date());
}

export async function syncLeaderboardStatsWithStore(
  store: LeaderboardStore,
  input: SyncStatsInput,
  now: Date,
): Promise<SyncStatsResult | LeaderboardError> {
  const user = await store.findUserByToken(input.clientToken);
  if (!user) {
    return {
      ok: false,
      code: "USER_NOT_FOUND",
      message: "먼저 optIn 호출 필요",
    };
  }
  if (user.optedOutAt !== null) {
    return {
      ok: false,
      code: "OPTED_OUT",
      message: "Opt-out 사용자는 sync 불가",
    };
  }
  if (isRateLimited(user.lastSyncedAt, now.getTime())) {
    return {
      ok: false,
      code: "RATE_LIMITED",
      message: `5분에 1회 sync 허용 (다음 sync 가능까지 ${Math.ceil(
        (SYNC_RATE_LIMIT_MS - (now.getTime() - (user.lastSyncedAt?.getTime() ?? 0))) / 1000,
      )}초)`,
    };
  }

  const { clientToken, ...stats } = input;
  void clientToken; // unused — DB lookup 에 이미 사용됨
  await store.updateStatsAndLog({ userId: user.id, stats, now });
  return { ok: true, syncedAt: now };
}

/**
 * Fetch — opted-out 제외 + pnlPct DESC 정렬 + 익명화.
 * clientToken 제공 시 본인 entry 에 isYou=true.
 *
 * Phase 2: period (24h/7d/30d) 필터는 향후 snapshot join 으로 구현.
 * 현재는 period 무시 — "all" 동일 결과 반환 (응답 shape 만 유지).
 */
export async function fetchLeaderboard(
  input: FetchLeaderboardInput,
): Promise<FetchLeaderboardResult | LeaderboardError> {
  const store = await getStore();
  if (!store) return DB_UNAVAILABLE_ERR;
  return fetchLeaderboardWithStore(store, input);
}

export async function fetchLeaderboardWithStore(
  store: LeaderboardStore,
  input: FetchLeaderboardInput,
): Promise<FetchLeaderboardResult> {
  const rows = await store.listActiveUsers(input.limit);
  const total = await store.countActiveUsers();

  const youAnonId = input.clientToken
    ? anonymizeClientToken(input.clientToken)
    : null;

  let yourRank: number | null = null;

  const entries: LeaderboardEntryDto[] = rows.map((r, i) => {
    const anonId = anonymizeClientToken(r.clientToken);
    const isYou = youAnonId !== null && anonId === youAnonId;
    const rank = i + 1;
    if (isYou) yourRank = rank;
    return {
      id: anonId,
      nickname: r.nickname,
      currentCapital: r.currentCapital,
      initialCapital: r.initialCapital,
      totalPnl: r.totalPnl,
      pnlPct: r.pnlPct,
      totalTrades: r.totalTrades,
      winRate: r.winRate,
      rank,
      isYou,
    };
  });

  return { ok: true, entries, totalUsers: total, yourRank };
}
