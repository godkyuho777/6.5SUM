/**
 * Rolling Win-Rate — backtest 결과 기반 N일 윈도우 + Wilson 95% CI
 *
 * CoinDetail 워크스테이션의 우상단 패널 ("최근 30/90/365일 승률") 백엔드.
 *
 * 데이터 소스:
 *   - 첫 호출 시: 즉석 backtest 실행 (max(windows)일 만큼 과거 데이터)
 *   - 결과 1시간 in-memory 캐시 (lru-cache 미사용 — 단순 Map + ttl)
 *
 * Wilson 95% CI 공식:
 *   center = (p + z²/(2n)) / (1 + z²/n)
 *   margin = (z × sqrt(p(1-p)/n + z²/(4n²))) / (1 + z²/n)
 *   z      = 1.96
 *   low    = clamp(center - margin, 0, 1)
 *   high   = clamp(center + margin, 0, 1)
 */
import type { TimeframeValue } from "./shared/types";
import type { BacktestTrade } from "./backtest/types";
export interface WindowStat {
    days: number;
    trades: number;
    winRate: number;
    wilsonLow: number;
    wilsonHigh: number;
}
export interface RollingWinRateResult {
    symbol: string;
    tf: TimeframeValue;
    windows: WindowStat[];
    computedAt: string;
    /** "real" = backtest 결과 기반, "stub" = backtest 데이터 없음 */
    status: "real" | "stub" | "error";
    detail?: string;
}
/** Wilson 95% CI 양 끝값 반환. n=0 이면 [0, 1]. */
export declare function wilsonInterval(wins: number, n: number): {
    low: number;
    high: number;
};
declare function summarizeWindow(trades: BacktestTrade[], days: number, nowMs: number): WindowStat;
/**
 * 단일 symbol 의 rolling win-rate 계산.
 * 캐시 미스 시 즉석 backtest 실행 (max(windows)일 만큼 과거).
 *
 * 외부 데이터 의존이 있으므로 try/catch 격리. 실패 시 status="error" 반환.
 */
export declare function computeRollingWinRate(input: {
    symbol: string;
    tf: TimeframeValue;
    windows: number[];
}): Promise<RollingWinRateResult>;
/** 테스트용 — Wilson 공식 단독 검증. */
export declare const __testing: {
    wilsonInterval: typeof wilsonInterval;
    summarizeWindow: typeof summarizeWindow;
};
export {};
