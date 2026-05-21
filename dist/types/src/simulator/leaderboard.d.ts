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
import { type SimulatorLeaderboardUserRow } from "../../drizzle/schema";
/** Sync rate limit window. 같은 clientToken 은 5분 이내 재 sync 거부. */
export declare const SYNC_RATE_LIMIT_MS: number;
/** Default initial capital — frontend INITIAL_CASH 와 일치 ($200,000). */
export declare const LEADERBOARD_INITIAL_CAPITAL = 200000;
export type LeaderboardErrorCode = "DB_UNAVAILABLE" | "USER_NOT_FOUND" | "OPTED_OUT" | "RATE_LIMITED";
export interface LeaderboardError {
    ok: false;
    code: LeaderboardErrorCode;
    message: string;
}
export interface OptInInput {
    clientToken: string;
    nickname: string;
}
export interface OptInResult {
    ok: true;
    id: string;
    nickname: string;
    optedInAt: Date;
    reactivated: boolean;
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
/**
 * 익명 hash id — sha256(clientToken)[0:8] 형식 (앞 8자, 짧지만 충돌율 매우 낮음).
 * response 에 노출되어도 reverse 불가능 (단방향).
 */
export declare function anonymizeClientToken(clientToken: string): string;
/** Rate limit check — last sync 가 SYNC_RATE_LIMIT_MS 이내면 reject. */
export declare function isRateLimited(lastSyncedAt: Date | null | undefined, now?: number): boolean;
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
    }): Promise<{
        row: SimulatorLeaderboardUserRow;
        reactivated: boolean;
    }>;
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
/**
 * Opt-in — 신규 가입 or 기존 row 재활성화.
 * 같은 clientToken 으로 재호출 시 nickname 갱신.
 * opt-out 했던 사용자가 재 호출 시 reactivated=true.
 */
export declare function optInLeaderboard(input: OptInInput): Promise<OptInResult | LeaderboardError>;
export declare function optInLeaderboardWithStore(store: LeaderboardStore, input: OptInInput, now: Date): Promise<OptInResult>;
/** Opt-out — clientToken ownership 검증 후 opted_out_at 설정. */
export declare function optOutLeaderboard(input: OptOutInput): Promise<OptOutResult | LeaderboardError>;
export declare function optOutLeaderboardWithStore(store: LeaderboardStore, input: OptOutInput, now: Date): Promise<OptOutResult | LeaderboardError>;
/**
 * Sync stats — clientToken 으로 본인 row 찾아 갱신.
 * Rate limit: 마지막 sync 가 5분 이내면 reject.
 * opt-out 사용자 sync 시도 → reject.
 */
export declare function syncLeaderboardStats(input: SyncStatsInput): Promise<SyncStatsResult | LeaderboardError>;
export declare function syncLeaderboardStatsWithStore(store: LeaderboardStore, input: SyncStatsInput, now: Date): Promise<SyncStatsResult | LeaderboardError>;
/**
 * Fetch — opted-out 제외 + pnlPct DESC 정렬 + 익명화.
 * clientToken 제공 시 본인 entry 에 isYou=true.
 *
 * Phase 2: period (24h/7d/30d) 필터는 향후 snapshot join 으로 구현.
 * 현재는 period 무시 — "all" 동일 결과 반환 (응답 shape 만 유지).
 */
export declare function fetchLeaderboard(input: FetchLeaderboardInput): Promise<FetchLeaderboardResult | LeaderboardError>;
export declare function fetchLeaderboardWithStore(store: LeaderboardStore, input: FetchLeaderboardInput): Promise<FetchLeaderboardResult>;
