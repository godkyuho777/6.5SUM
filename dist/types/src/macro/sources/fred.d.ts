/**
 * FRED API client — dual-mode (realtime + ALFRED for backtest).
 *
 * MACRO_LIQUIDITY_TRACKER_v2 §2.1-2.2:
 *   - `mode="realtime"` → 일반 FRED endpoint, 현재 시점 데이터.
 *   - `mode="backtest"` → ALFRED 강제. `realtime_start/end` 파라미터로
 *     "그 시점에 알려졌던 값" (vintage) 만 조회. Look-ahead bias 차단의
 *     근거. realtimeStart 누락 시 throw.
 *
 * Stub-first 정책 (CLAUDE.md):
 *   - `FRED_API_KEY` 미설정 → `{ status: "stub", observations: [] }` 반환.
 *     절대 throw 하지 않음 — 호출자 (liquidity, timeline-builder) 가
 *     graceful fallback 으로 처리.
 *
 * 캐시:
 *   - 디스크: `.macro-cache/{seriesId}-{mode}-{start}-{end}.json`
 *   - TTL 차등: realtime 12h, backtest 영구 (vintage 는 변하지 않음)
 *
 * Rate limit: 분당 100 (FRED 무료 tier 한도) — 본 모듈은 호출 횟수만
 * 카운트, 외부 limiter 와 결합 가능.
 */
export type FredMode = "realtime" | "backtest";
export interface FredObservation {
    /** Observation date (ISO YYYY-MM-DD). */
    date: string;
    /** Observed value (NaN if FRED returns "."). */
    value: number;
    /**
     * Realtime period start (ALFRED 만 채워짐). 백테스트 모드에서
     * release_ts 계산에 사용.
     */
    realtimeStart?: string;
    /** Realtime period end (ALFRED 만 채워짐). */
    realtimeEnd?: string;
}
export interface FredFetchOpts {
    seriesId: string;
    mode: FredMode;
    /** ALFRED 필수. "YYYY-MM-DD". */
    realtimeStart?: string;
    /** ALFRED 필수. "YYYY-MM-DD". */
    realtimeEnd?: string;
    /** observation 범위 (옵션). */
    observationStart?: string;
    observationEnd?: string;
    /** 캐시 비활성화 (테스트용). */
    disableCache?: boolean;
}
export type FredFetchStatus = "ok" | "stub" | "error";
export interface FredFetchResult {
    status: FredFetchStatus;
    /** ok 시 채워짐. stub/error 시 빈 배열. */
    observations: FredObservation[];
    /** error 시 메시지. */
    detail?: string;
    /** 캐시 hit 여부 (관측용). */
    cacheHit?: boolean;
}
export interface FredSeriesSnapshot {
    seriesId: string;
    value: number;
    date: string;
}
/**
 * FRED / ALFRED observations 호출.
 *
 * @throws ALFRED 모드에서 `realtimeStart` 누락 시 → look-ahead 차단 강제.
 * @returns graceful `FredFetchResult` (API key 없거나 네트워크 실패해도 throw X).
 */
export declare function fetchFred(opts: FredFetchOpts): Promise<FredFetchResult>;
/**
 * @deprecated Use `fetchFred({ seriesId, mode: "realtime" })` directly.
 * 본 wrapper 는 기존 (sources/fred.ts → liquidity.ts) 호출 시그니처를 위해 유지.
 */
export declare function fetchFredSeries(seriesId: string): Promise<FredSeriesSnapshot | null>;
