/**
 * BOK ECOS API client — MACRO_LIQUIDITY_TRACKER_v2 §2.3.
 *
 * Base URL: `https://ecos.bok.or.kr/api/`
 *
 * Supported series:
 *   - 722Y001: BOK 기준금리 (월별)
 *   - 731Y004: 원-달러 환율 (일별)
 *   - 901Y009: 한국 CPI (월별)
 *
 * Fallback policy (BOK_API_KEY 미설정 시):
 *   - 환율 (731Y004) → Yahoo Finance KRW=X (free, no key)
 *   - 나머지 (722Y001, 901Y009) → `{ status: "stub", values: [] }`
 *
 * Stub-first (CLAUDE.md):
 *   - 절대 throw X. 네트워크/API 실패 시 status="error" 반환.
 *   - 캐시: `.macro-cache/bok-{statCode}-{startDate}-{endDate}.json`, TTL 12h.
 */
export type BokStatCode = "722Y001" | "731Y004" | "901Y009";
export interface BokDataPoint {
    /** Observation date — ISO YYYY-MM-DD. */
    date: string;
    /** Observed value. NaN if BOK returned null/blank. */
    value: number;
}
export type BokFetchStatus = "ok" | "stub" | "fallback" | "error";
export interface BokFetchResult {
    status: BokFetchStatus;
    values: BokDataPoint[];
    /** "yahoo" | "bok" | undefined */
    source?: string;
    detail?: string;
    cacheHit?: boolean;
}
export interface BokFetchOpts {
    statCode: BokStatCode;
    /** ISO YYYY-MM-DD. */
    startDate: string;
    /** ISO YYYY-MM-DD. */
    endDate: string;
    disableCache?: boolean;
}
/**
 * BOK ECOS 통계 fetch. graceful — 절대 throw X.
 *
 * @returns
 *   - `{ status: "ok",     values: [...] }`           — BOK API 정상
 *   - `{ status: "fallback", source: "yahoo", values: [...] }` — KRW=X 대체
 *   - `{ status: "stub",   values: [] }`              — key 없고 fallback 도 없음
 *   - `{ status: "error",  values: [], detail }`      — 네트워크/파싱 실패
 */
export declare function fetchBOK(opts: BokFetchOpts): Promise<BokFetchResult>;
/**
 * Prompt 명세 호환 alias.
 * 호출자는 `fetchBOK` 또는 본 함수 둘 다 사용 가능.
 */
export declare function fetchBOKSeries(statCode: BokStatCode, startDate: string, endDate: string): Promise<BokDataPoint[]>;
