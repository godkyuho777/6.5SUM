/**
 * Coin Meta — CoinGecko Free 기반 시총/거래량/도미넌스/SSR 메타 데이터
 *
 * 헌장 규칙: 외부 API 실패는 항상 graceful → status: "stub"/"error" 반환,
 * 절대 throw 로 라우터 체인을 깨지 않는다.
 *
 * 데이터 소스:
 *   - CoinGecko Free: /coins/markets?ids={...}  (키 불필요, ~30 req/min)
 *   - In-memory 5분 캐시 (rate limit 회피)
 *
 * SSR z-score 는 onchain/ssr.ts 의 90일 rolling buffer 와 별도 — 여기서는
 * 가장 최근 SSR 만 노출 (UI 표시 용). z-score 가 필요한 modifier 합산은
 * 그대로 onchain/ssr.ts 가 담당.
 */
export interface CoinMeta {
    symbol: string;
    base: string;
    /** "real" = CoinGecko 응답, "stub" = 화이트리스트 외 / 응답 없음, "error" = 호출 실패 */
    status: "real" | "stub" | "error";
    detail?: string;
    /** USD 시가총액 */
    mcap: number;
    /** 24h USD 거래량 */
    volume24h: number;
    /** 유통 공급량 (코인 갯수). 알 수 없으면 0 */
    circulatingSupply: number;
    totalSupply: number | null;
    maxSupply: number | null;
    marketCapRank: number | null;
    /** BTC 도미넌스 비율 (0~1). 본 코인이 BTC 일 때만 의미. 그 외 코인은 BTC 시총 / 전체 시총 추정 X. */
    dominance: number | null;
    /** 최신 SSR (BTC 시총 / 스테이블 시총). 모든 코인에서 같은 값. */
    ssr: number | null;
    /** SSR 90일 rolling buffer 가 충분히 누적된 경우의 z-score. 없으면 null. */
    ssrZScore: number | null;
    /** ISO timestamp */
    computedAt: string;
}
export declare function getCoinMeta(rawSymbol: string): Promise<CoinMeta>;
