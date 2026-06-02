/**
 * CryptoQuant API 클라이언트 — Free tier 호환.
 *
 * 무료 등록: https://www.cryptoquant.com/ → Sign up → Free plan
 * 환경변수: CRYPTOQUANT_API_KEY
 * Rate limit: 무료 tier 60 req/min (관대함)
 *
 * 사용 시리즈:
 *   - 'btc/exchange-flows/netflow' (Exchange Netflow)
 *   - 'btc/miner-flows/outflow' (Miner Outflow)
 *
 * 응답 shape 가정 (Free tier — 사용자가 키 발급 후 첫 호출 시 console.log
 * 로 검증 필요):
 *   { result: { data: [{ date: "2026-05-21", value: 1234.5 }, ...] } }
 * 또는 (대안):
 *   { result: { data: [{ timestamp: "2026-05-21T00:00:00Z",
 *                        net_flow: 1234.5 | outflow: 5678.9 }, ...] } }
 * → fetchCryptoQuant 가 두 형식 모두 best-effort 파싱.
 *
 * Graceful error:
 *   - 키 미설정 → status: "stub", data: []
 *   - 네트워크/HTTP/파싱 실패 → status: "error", data: []
 */
export interface CryptoQuantDataPoint {
    /** YYYY-MM-DD ISO date (UTC). */
    date: string;
    /** 시리즈별 raw value (BTC 단위 netflow/outflow). */
    value: number;
}
export type CryptoQuantSeries = "btc/exchange-flows/netflow" | "btc/miner-flows/outflow";
export interface CryptoQuantFetchResult {
    status: "ok" | "stub" | "error";
    data: CryptoQuantDataPoint[];
    detail?: string;
}
/**
 * CryptoQuant Free API 호출 — 지정된 시리즈의 day-cadence 데이터 반환.
 *
 * @param series  시리즈 식별자 (e.g., "btc/exchange-flows/netflow")
 * @param windowDays  최근 며칠치 데이터 (기본 30)
 *
 * 응답 파싱 전략 (Free tier shape 변동성 대응):
 *   - `res.data.result.data` 배열 우선
 *   - 각 행은 `date` (또는 `timestamp` 의 first 10 chars) 와
 *     `value` (또는 `net_flow` / `outflow`) 둘 다 탐색
 *   - 파싱 실패 행은 skip (예외 throw X)
 */
export declare function fetchCryptoQuant(series: CryptoQuantSeries, windowDays?: number): Promise<CryptoQuantFetchResult>;
/**
 * 한 행을 best-effort 파싱. 다양한 필드명 변형 모두 시도.
 *
 * @internal — 테스트용 export.
 */
export declare function parseRow(row: unknown, series: CryptoQuantSeries): CryptoQuantDataPoint | null;
export declare const __testing: {
    CQ_API_BASE: string;
    REQUEST_TIMEOUT_MS: number;
    parseRow: typeof parseRow;
};
