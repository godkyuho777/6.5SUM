/**
 * Glassnode API 클라이언트 — Free tier 호환.
 *
 * 무료 등록: https://glassnode.com/ → Sign up → Free tier
 * 환경변수: GLASSNODE_API_KEY
 * Rate limit: 무료 tier 분 단위 제한 (관대함, BTC/ETH 한정 metric).
 *
 * 사용 metric:
 *   - 'supply/lth_sum' (Long-Term Holder Supply, 누적 코인 수)
 *   - 'supply/lth_net_change' (LTH 30d 변화, 비교용)
 *
 * 응답 shape (Glassnode 공식 — 안정적):
 *   [{ t: 1716163200, v: 14523456.78 }, ...]
 *   - t = Unix seconds
 *   - v = metric value (float)
 *
 * Graceful error:
 *   - 키 미설정 → status: "stub", data: []
 *   - 네트워크/HTTP/파싱 실패 → status: "error", data: []
 */
export interface GlassnodeDataPoint {
    /** Unix timestamp (seconds). */
    t: number;
    /** Metric value. */
    v: number;
}
export type GlassnodeMetric = "supply/lth_sum" | "supply/lth_net_change";
export type GlassnodeAsset = "BTC" | "ETH";
export interface GlassnodeFetchResult {
    status: "ok" | "stub" | "error";
    data: GlassnodeDataPoint[];
    detail?: string;
}
/**
 * Glassnode Free API 호출 — 24h cadence metric 시계열.
 *
 * @param metric  metric 경로 (e.g., "supply/lth_sum")
 * @param asset   "BTC" 또는 "ETH" (Free tier 대응 자산)
 * @param windowDays  최근 며칠치 데이터 (기본 30)
 *
 * 키 미설정 시 graceful stub. 네트워크/파싱 실패도 graceful (throw X).
 */
export declare function fetchGlassnode(metric: GlassnodeMetric, asset?: GlassnodeAsset, windowDays?: number): Promise<GlassnodeFetchResult>;
/**
 * 한 행을 best-effort 파싱. Glassnode 표준 shape `{ t, v }`.
 *
 * @internal — 테스트용 export.
 */
export declare function parseRow(row: unknown): GlassnodeDataPoint | null;
export declare const __testing: {
    GLASSNODE_API_BASE: string;
    REQUEST_TIMEOUT_MS: number;
    parseRow: typeof parseRow;
};
