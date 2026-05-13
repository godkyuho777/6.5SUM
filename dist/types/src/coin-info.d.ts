/**
 * Coin Info — CoinGecko Free 기반 코인 상세 메타데이터 (한국어 큐레이션 포함)
 *
 * CoinDetail 페이지의 "코인 정보" 탭에서 사용. 시총/거래량 외에도
 * 설명/카테고리/공식 링크/공급량/ATH 등 CoinMarketCap-style 풀 패키지 제공.
 *
 * 헌장 규칙:
 *   - 외부 API 키 필수화 금지 (CoinGecko Free, 키 없음, ~10-30 req/min)
 *   - 호출 실패는 status: "error" 객체 반환, throw 금지
 *   - 화이트리스트 (23 coin) 외 → status: "stub" + 한국어 안내
 *
 * 캐시:
 *   - in-memory 1h TTL (메타에 비해 변동성 낮으므로 5분보다 길게 잡음)
 *   - 429 rate limit 응답 시 60초 backoff
 *
 * 참고:
 *   - coin-meta.ts 는 시총/거래량/도미넌스/SSR 중심으로 5분 캐시.
 *   - 본 모듈은 description/links/supply/ATH 중심으로 1h 캐시.
 *   - 두 모듈의 화이트리스트는 동일 (23 coin).
 */
export interface CoinInfo {
    /** "BTCUSDT" (Bybit 심볼) */
    symbol: string;
    /** "BTC" (USDT 접미사 제거) */
    baseSymbol: string;
    /** "Bitcoin" (CoinGecko name) */
    name: string;
    /** "bitcoin" (CoinGecko id) */
    coingeckoId: string;
    /** 한국어 큐레이션 description (자체 작성) */
    description: string;
    /** 카테고리 태그 (예: ["Cryptocurrency", "Layer 1", "Store of Value"]) */
    category: string[];
    /** 핵심 용도 한 줄 요약 */
    useCase: string;
    /** ISO date or year */
    launchDate?: string;
    /** "Proof of Work" | "Proof of Stake" | ... */
    consensus?: string;
    /** 시총 순위 (1 = BTC) */
    rank?: number;
    marketCapUsd?: number;
    /** Fully Diluted Valuation */
    fdvUsd?: number;
    volume24hUsd?: number;
    circulatingSupply?: number;
    totalSupply?: number;
    /** null = 무한 발행 (DOGE 등) */
    maxSupply?: number | null;
    currentPrice?: number;
    ath?: number;
    athDate?: string;
    /** ATH 대비 % 변화 (예: -50 = ATH에서 50% 하락) */
    athChangePct?: number;
    atl?: number;
    homepage?: string;
    whitepaper?: string;
    github?: string;
    twitter?: string;
    reddit?: string;
    /** "real" = CoinGecko 응답, "stub" = 화이트리스트 외, "error" = 호출 실패 */
    status: "real" | "stub" | "error";
    /** Date.now() 기준 캐시 시각 */
    cachedAt: number;
    errorDetail?: string;
}
/** 테스트 / 디버그용 — 캐시 초기화. */
export declare function clearCoinInfoCache(): void;
/**
 * 단일 코인의 상세 정보를 가져온다.
 *
 * 동작 순서:
 *   1. 캐시 hit → 즉시 반환
 *   2. 화이트리스트 외 → status: "stub"
 *   3. rate limit 백오프 중 → status: "error" (stale 캐시 있으면 그것 반환)
 *   4. CoinGecko 호출 → 성공 시 status: "real", 실패 시 status: "error"
 */
export declare function getCoinInfo(rawSymbol: string): Promise<CoinInfo>;
