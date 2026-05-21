/**
 * Simulator Leaderboard — 단위 테스트 (2026-05-21).
 *
 * 검증 범위:
 *   - optIn: 신규 row 생성 / 재호출 upsert / opt-out 사용자 재활성화
 *   - optOut: opted_out_at 설정 + fetch 결과 제외
 *   - sync: rate limit (5분), opt-out 사용자 reject, 미가입 reject, 성공 시 stats 갱신
 *   - fetch: pnlPct DESC 정렬 + yourRank + isYou + 익명화 hash id
 *   - anonymize: 안정성 + 짧은 길이
 *
 * Production DB 의존성 없는 InMemoryStore 로 격리.  헌장 R3 (modifier-only)
 * 와 무관 — 본 시스템은 시그널 시스템과 완전 분리.
 */

import { describe, expect, test, beforeEach } from "vitest";
import {
  anonymizeClientToken,
  isRateLimited,
  optInLeaderboardWithStore,
  optOutLeaderboardWithStore,
  syncLeaderboardStatsWithStore,
  fetchLeaderboardWithStore,
  SYNC_RATE_LIMIT_MS,
  LEADERBOARD_INITIAL_CAPITAL,
  type LeaderboardStore,
  type SyncStatsInput,
} from "../leaderboard";
import type { SimulatorLeaderboardUserRow } from "../../../drizzle/schema";

// ─── In-memory store (DB mock) ───────────────────────────────────

class InMemoryStore implements LeaderboardStore {
  rows: SimulatorLeaderboardUserRow[] = [];
  snapshots: Array<{
    userId: string;
    snapshotAt: Date;
    currentCapital: number;
    pnlPct: number;
    totalTrades: number;
  }> = [];
  private idSeq = 0;

  reset(): void {
    this.rows = [];
    this.snapshots = [];
    this.idSeq = 0;
  }

  private nextId(): string {
    this.idSeq += 1;
    return `00000000-0000-0000-0000-${String(this.idSeq).padStart(12, "0")}`;
  }

  async findUserByToken(
    clientToken: string,
  ): Promise<SimulatorLeaderboardUserRow | null> {
    return this.rows.find((r) => r.clientToken === clientToken) ?? null;
  }

  async upsertUser({
    clientToken,
    nickname,
    now,
  }: {
    clientToken: string;
    nickname: string;
    now: Date;
  }): Promise<{ row: SimulatorLeaderboardUserRow; reactivated: boolean }> {
    const existing = this.rows.find((r) => r.clientToken === clientToken);
    if (existing) {
      const reactivated = existing.optedOutAt !== null;
      existing.nickname = nickname;
      existing.optedOutAt = null;
      if (reactivated) existing.optedInAt = now;
      return { row: existing, reactivated };
    }

    const row: SimulatorLeaderboardUserRow = {
      id: this.nextId(),
      clientToken,
      nickname,
      optedInAt: now,
      optedOutAt: null,
      lastSyncedAt: null,
      currentCapital: LEADERBOARD_INITIAL_CAPITAL,
      initialCapital: LEADERBOARD_INITIAL_CAPITAL,
      totalPnl: 0,
      pnlPct: 0,
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      maxDrawdownPct: 0,
      createdAt: now,
    };
    this.rows.push(row);
    return { row, reactivated: false };
  }

  async markOptOut(userId: string, now: Date): Promise<void> {
    const r = this.rows.find((x) => x.id === userId);
    if (r) r.optedOutAt = now;
  }

  async updateStatsAndLog({
    userId,
    stats,
    now,
  }: {
    userId: string;
    stats: Omit<SyncStatsInput, "clientToken">;
    now: Date;
  }): Promise<void> {
    const r = this.rows.find((x) => x.id === userId);
    if (!r) return;
    r.currentCapital = stats.currentCapital;
    r.totalPnl = stats.totalPnl;
    r.pnlPct = stats.pnlPct;
    r.totalTrades = stats.totalTrades;
    r.wins = stats.wins;
    r.losses = stats.losses;
    r.winRate = stats.winRate;
    r.maxDrawdownPct = stats.maxDrawdownPct;
    r.lastSyncedAt = now;
    this.snapshots.push({
      userId,
      snapshotAt: now,
      currentCapital: stats.currentCapital,
      pnlPct: stats.pnlPct,
      totalTrades: stats.totalTrades,
    });
  }

  async listActiveUsers(limit: number): Promise<SimulatorLeaderboardUserRow[]> {
    return this.rows
      .filter((r) => r.optedOutAt === null)
      .sort((a, b) => {
        if (b.pnlPct !== a.pnlPct) return b.pnlPct - a.pnlPct;
        return b.currentCapital - a.currentCapital;
      })
      .slice(0, limit);
  }

  async countActiveUsers(): Promise<number> {
    return this.rows.filter((r) => r.optedOutAt === null).length;
  }
}

// ─── Test fixtures ───────────────────────────────────────────────

const TOKEN_A = "11111111-1111-1111-1111-111111111111";
const TOKEN_B = "22222222-2222-2222-2222-222222222222";
const TOKEN_C = "33333333-3333-3333-3333-333333333333";

const T0 = new Date("2026-05-21T00:00:00Z");
const T_PLUS_1MIN = new Date(T0.getTime() + 60_000);
const T_PLUS_6MIN = new Date(T0.getTime() + 6 * 60_000);

const validStats: Omit<SyncStatsInput, "clientToken"> = {
  currentCapital: 250_000,
  totalPnl: 50_000,
  pnlPct: 25,
  totalTrades: 10,
  wins: 7,
  losses: 3,
  winRate: 0.7,
  maxDrawdownPct: -0.05,
};

// ─── Tests ───────────────────────────────────────────────────────

describe("anonymizeClientToken", () => {
  test("같은 token 은 항상 동일 hash", () => {
    expect(anonymizeClientToken(TOKEN_A)).toBe(anonymizeClientToken(TOKEN_A));
  });

  test("다른 token 은 다른 hash", () => {
    expect(anonymizeClientToken(TOKEN_A)).not.toBe(
      anonymizeClientToken(TOKEN_B),
    );
  });

  test("형식: anon_<8자 hex>", () => {
    const hash = anonymizeClientToken(TOKEN_A);
    expect(hash).toMatch(/^anon_[0-9a-f]{8}$/);
  });

  test("response 에 원본 clientToken 절대 노출 X", () => {
    const hash = anonymizeClientToken(TOKEN_A);
    expect(hash).not.toContain(TOKEN_A);
    expect(hash).not.toContain(TOKEN_A.slice(0, 8));
  });
});

describe("isRateLimited", () => {
  test("lastSyncedAt 없으면 false", () => {
    expect(isRateLimited(null)).toBe(false);
    expect(isRateLimited(undefined)).toBe(false);
  });

  test("5분 이내면 true", () => {
    const last = new Date(Date.now() - 60_000); // 1분 전
    expect(isRateLimited(last)).toBe(true);
  });

  test("5분 정확히 후 — false (경계)", () => {
    const now = Date.now();
    const last = new Date(now - SYNC_RATE_LIMIT_MS);
    expect(isRateLimited(last, now)).toBe(false);
  });

  test("6분 후 — false", () => {
    const last = new Date(Date.now() - 6 * 60_000);
    expect(isRateLimited(last)).toBe(false);
  });
});

describe("optInLeaderboardWithStore", () => {
  let store: InMemoryStore;
  beforeEach(() => {
    store = new InMemoryStore();
  });

  test("신규 clientToken → row 생성, reactivated=false", async () => {
    const result = await optInLeaderboardWithStore(
      store,
      { clientToken: TOKEN_A, nickname: "Alice" },
      T0,
    );
    expect(result.ok).toBe(true);
    expect(result.nickname).toBe("Alice");
    expect(result.reactivated).toBe(false);
    expect(result.id).toMatch(/^anon_[0-9a-f]{8}$/);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].clientToken).toBe(TOKEN_A);
    expect(store.rows[0].nickname).toBe("Alice");
    expect(store.rows[0].optedOutAt).toBeNull();
    expect(store.rows[0].currentCapital).toBe(LEADERBOARD_INITIAL_CAPITAL);
  });

  test("같은 clientToken 재호출 → nickname 갱신, reactivated=false (opt-out 아님)", async () => {
    await optInLeaderboardWithStore(
      store,
      { clientToken: TOKEN_A, nickname: "Alice" },
      T0,
    );
    const result = await optInLeaderboardWithStore(
      store,
      { clientToken: TOKEN_A, nickname: "Alice2" },
      T_PLUS_1MIN,
    );
    expect(result.ok).toBe(true);
    expect(result.nickname).toBe("Alice2");
    expect(result.reactivated).toBe(false);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].nickname).toBe("Alice2");
  });

  test("opt-out 후 재호출 → reactivated=true, opted_out_at=null 재활성화", async () => {
    await optInLeaderboardWithStore(
      store,
      { clientToken: TOKEN_A, nickname: "Alice" },
      T0,
    );
    await optOutLeaderboardWithStore(store, { clientToken: TOKEN_A }, T0);
    expect(store.rows[0].optedOutAt).not.toBeNull();

    const result = await optInLeaderboardWithStore(
      store,
      { clientToken: TOKEN_A, nickname: "AliceReturns" },
      T_PLUS_6MIN,
    );
    expect(result.ok).toBe(true);
    expect(result.reactivated).toBe(true);
    expect(store.rows[0].optedOutAt).toBeNull();
    expect(store.rows[0].nickname).toBe("AliceReturns");
  });
});

describe("optOutLeaderboardWithStore", () => {
  let store: InMemoryStore;
  beforeEach(() => {
    store = new InMemoryStore();
  });

  test("미가입 clientToken → USER_NOT_FOUND", async () => {
    const result = await optOutLeaderboardWithStore(
      store,
      { clientToken: TOKEN_A },
      T0,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("USER_NOT_FOUND");
  });

  test("성공 시 opted_out_at 설정 + fetch 에서 제외됨", async () => {
    await optInLeaderboardWithStore(
      store,
      { clientToken: TOKEN_A, nickname: "Alice" },
      T0,
    );
    await optInLeaderboardWithStore(
      store,
      { clientToken: TOKEN_B, nickname: "Bob" },
      T0,
    );

    const optOutRes = await optOutLeaderboardWithStore(
      store,
      { clientToken: TOKEN_A },
      T_PLUS_1MIN,
    );
    expect(optOutRes.ok).toBe(true);

    const fetched = await fetchLeaderboardWithStore(store, {
      period: "all",
      limit: 50,
    });
    expect(fetched.ok).toBe(true);
    if (!fetched.ok) return;
    // Alice 는 opt-out → entries 에 없어야 함
    expect(fetched.entries.map((e) => e.nickname)).toEqual(["Bob"]);
    expect(fetched.totalUsers).toBe(1);
  });
});

describe("syncLeaderboardStatsWithStore", () => {
  let store: InMemoryStore;
  beforeEach(() => {
    store = new InMemoryStore();
  });

  test("미가입 sync → USER_NOT_FOUND", async () => {
    const result = await syncLeaderboardStatsWithStore(
      store,
      { clientToken: TOKEN_A, ...validStats },
      T0,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("USER_NOT_FOUND");
  });

  test("opt-out 사용자 sync → OPTED_OUT", async () => {
    await optInLeaderboardWithStore(
      store,
      { clientToken: TOKEN_A, nickname: "Alice" },
      T0,
    );
    await optOutLeaderboardWithStore(store, { clientToken: TOKEN_A }, T0);

    const result = await syncLeaderboardStatsWithStore(
      store,
      { clientToken: TOKEN_A, ...validStats },
      T_PLUS_6MIN,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("OPTED_OUT");
  });

  test("첫 sync → 성공, stats 갱신", async () => {
    await optInLeaderboardWithStore(
      store,
      { clientToken: TOKEN_A, nickname: "Alice" },
      T0,
    );

    const result = await syncLeaderboardStatsWithStore(
      store,
      { clientToken: TOKEN_A, ...validStats },
      T_PLUS_1MIN,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.syncedAt).toEqual(T_PLUS_1MIN);
    expect(store.rows[0].currentCapital).toBe(validStats.currentCapital);
    expect(store.rows[0].pnlPct).toBe(validStats.pnlPct);
    expect(store.rows[0].totalTrades).toBe(validStats.totalTrades);
    expect(store.rows[0].lastSyncedAt).toEqual(T_PLUS_1MIN);
    // Snapshot 한 행 추가
    expect(store.snapshots).toHaveLength(1);
    expect(store.snapshots[0].pnlPct).toBe(validStats.pnlPct);
  });

  test("rate limit — 5분 이내 재 sync → RATE_LIMITED", async () => {
    await optInLeaderboardWithStore(
      store,
      { clientToken: TOKEN_A, nickname: "Alice" },
      T0,
    );
    const first = await syncLeaderboardStatsWithStore(
      store,
      { clientToken: TOKEN_A, ...validStats },
      T0,
    );
    expect(first.ok).toBe(true);

    // 1분 후 sync 시도
    const second = await syncLeaderboardStatsWithStore(
      store,
      { clientToken: TOKEN_A, ...validStats, pnlPct: 30 },
      T_PLUS_1MIN,
    );
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.code).toBe("RATE_LIMITED");
      expect(second.message).toContain("초");
    }
    // stats 변경 없어야 함
    expect(store.rows[0].pnlPct).toBe(validStats.pnlPct);
  });

  test("rate limit — 6분 후 재 sync → 성공", async () => {
    await optInLeaderboardWithStore(
      store,
      { clientToken: TOKEN_A, nickname: "Alice" },
      T0,
    );
    await syncLeaderboardStatsWithStore(
      store,
      { clientToken: TOKEN_A, ...validStats },
      T0,
    );

    const second = await syncLeaderboardStatsWithStore(
      store,
      { clientToken: TOKEN_A, ...validStats, pnlPct: 30 },
      T_PLUS_6MIN,
    );
    expect(second.ok).toBe(true);
    expect(store.rows[0].pnlPct).toBe(30);
    expect(store.snapshots).toHaveLength(2);
  });
});

describe("fetchLeaderboardWithStore", () => {
  let store: InMemoryStore;
  beforeEach(() => {
    store = new InMemoryStore();
  });

  test("빈 store → entries=[] totalUsers=0 yourRank=null", async () => {
    const result = await fetchLeaderboardWithStore(store, {
      period: "all",
      limit: 50,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toEqual([]);
    expect(result.totalUsers).toBe(0);
    expect(result.yourRank).toBeNull();
  });

  test("pnlPct DESC 정렬 + rank 1..N 부여", async () => {
    // 3명 등록 — Alice=10%, Bob=30%, Carol=-5%
    await optInLeaderboardWithStore(
      store,
      { clientToken: TOKEN_A, nickname: "Alice" },
      T0,
    );
    await optInLeaderboardWithStore(
      store,
      { clientToken: TOKEN_B, nickname: "Bob" },
      T0,
    );
    await optInLeaderboardWithStore(
      store,
      { clientToken: TOKEN_C, nickname: "Carol" },
      T0,
    );
    await syncLeaderboardStatsWithStore(
      store,
      { clientToken: TOKEN_A, ...validStats, pnlPct: 10 },
      T0,
    );
    await syncLeaderboardStatsWithStore(
      store,
      { clientToken: TOKEN_B, ...validStats, pnlPct: 30 },
      T0,
    );
    await syncLeaderboardStatsWithStore(
      store,
      { clientToken: TOKEN_C, ...validStats, pnlPct: -5 },
      T0,
    );

    const result = await fetchLeaderboardWithStore(store, {
      period: "all",
      limit: 50,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toHaveLength(3);
    expect(result.entries[0].nickname).toBe("Bob");
    expect(result.entries[0].rank).toBe(1);
    expect(result.entries[1].nickname).toBe("Alice");
    expect(result.entries[1].rank).toBe(2);
    expect(result.entries[2].nickname).toBe("Carol");
    expect(result.entries[2].rank).toBe(3);
    expect(result.totalUsers).toBe(3);
    expect(result.yourRank).toBeNull(); // clientToken 미제공
  });

  test("clientToken 제공 시 본인 entry isYou=true + yourRank", async () => {
    await optInLeaderboardWithStore(
      store,
      { clientToken: TOKEN_A, nickname: "Alice" },
      T0,
    );
    await optInLeaderboardWithStore(
      store,
      { clientToken: TOKEN_B, nickname: "Bob" },
      T0,
    );
    await syncLeaderboardStatsWithStore(
      store,
      { clientToken: TOKEN_A, ...validStats, pnlPct: 50 },
      T0,
    );
    await syncLeaderboardStatsWithStore(
      store,
      { clientToken: TOKEN_B, ...validStats, pnlPct: 10 },
      T0,
    );

    const result = await fetchLeaderboardWithStore(store, {
      clientToken: TOKEN_B,
      period: "all",
      limit: 50,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.yourRank).toBe(2);
    expect(result.entries.find((e) => e.nickname === "Bob")?.isYou).toBe(true);
    expect(result.entries.find((e) => e.nickname === "Alice")?.isYou).toBe(
      false,
    );
  });

  test("response 에 clientToken 평문 노출 X — id 는 익명 hash", async () => {
    await optInLeaderboardWithStore(
      store,
      { clientToken: TOKEN_A, nickname: "Alice" },
      T0,
    );

    const result = await fetchLeaderboardWithStore(store, {
      period: "all",
      limit: 50,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(TOKEN_A);
    expect(result.entries[0].id).toMatch(/^anon_[0-9a-f]{8}$/);
  });

  test("limit — 100 초과 entries 거르고 상위 N 만 반환", async () => {
    // 5명 등록
    for (let i = 0; i < 5; i++) {
      const token = `5${i.toString().padStart(7, "0")}-1111-1111-1111-111111111111`;
      await optInLeaderboardWithStore(
        store,
        { clientToken: token, nickname: `User${i}` },
        T0,
      );
      await syncLeaderboardStatsWithStore(
        store,
        { clientToken: token, ...validStats, pnlPct: i * 10 },
        T0,
      );
    }

    const result = await fetchLeaderboardWithStore(store, {
      period: "all",
      limit: 3,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toHaveLength(3);
    expect(result.totalUsers).toBe(5);
    // 정렬 — pnlPct DESC: 40, 30, 20
    expect(result.entries[0].pnlPct).toBe(40);
    expect(result.entries[1].pnlPct).toBe(30);
    expect(result.entries[2].pnlPct).toBe(20);
  });
});
