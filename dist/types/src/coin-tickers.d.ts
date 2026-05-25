/**
 * Coin Tickers — CoinGecko Free 기반 거래소 상장 정보 (tickers) 모듈
 *
 * CoinDetail 페이지의 "코인 정보" 탭에서 사용자가 "이 코인 어디서 사지?"
 * 를 즉시 알 수 있도록 거래소 + 거래 쌍 + 24h 거래량 + 신뢰도 (trust score)
 * 를 제공한다.
 *
 * 데이터 소스:
 *   - CoinGecko Free: /coins/{id}/tickers?include_exchange_logo=false
 *   - 키 불필요, ~10-30 req/min
 *
 * 헌장 규칙:
 *   - 외부 API 키 필수화 금지 (CoinGecko Free, 키 없음)
 *   - 호출 실패는 ok: false + code 반환, throw 금지
 *   - 화이트리스트 (23 coin) 외 → NOT_FOUND
 *   - modifier-only: 정보 표시만, 단독 시그널 발행 X
 *
 * 캐시:
 *   - in-memory 1h TTL (거래소 분포는 빠르게 변하지 않음)
 *   - 429 rate limit 응답 시 RATE_LIMITED code 반환 (호출측 재시도 책임)
 *
 * 정렬:
 *   - trust_score: green (3) > yellow (2) > red (1) > unknown (0)
 *   - 동일 trust 안에서는 converted_volume.usd DESC
 *
 * 호환성:
 *   - coin-meta.ts / coin-info.ts 의 23-coin 화이트리스트와 동일
 *   - Bybit 심볼 (BTCUSDT 등) 입력 → 내부에서 base symbol (BTC) 추출
 */
export type TrustScore = "green" | "yellow" | "red" | "unknown";
export interface CoinTickerExchange {
    /** 거래소 표시 이름 — "Binance", "Coinbase Exchange", "Bybit" 등. */
    name: string;
    /** CoinGecko 표준 식별자 — 소문자, "binance" / "gdax" / "bybit_spot". */
    identifier: string;
    /** CoinGecko 의 거래소 신뢰도. green=A, yellow=B, red=C, unknown=정보없음. */
    trustScore: TrustScore;
}
export interface CoinTicker {
    /** 베이스 심볼 (예: "BTC"). CoinGecko 응답을 그대로 전달. */
    base: string;
    /** 타깃 심볼 (예: "USDT", "USDC", "USD", "KRW"). */
    target: string;
    /** 상장 거래소 정보. */
    exchange: CoinTickerExchange;
    /** 현재가 (USD 환산). converted_last.usd 가 없으면 raw last 사용. */
    price: number;
    /** 24h 거래대금 (USD 환산). converted_volume.usd 가 기준. */
    volume24hUsd: number;
    /** 호가 스프레드 (%) — 작을수록 유동성 양호. CoinGecko 미제공 시 null. */
    bidAskSpreadPct: number | null;
    /** 거래소 외부 거래 페이지 deeplink. 사용자가 클릭해서 구매하러 갈 수 있음. */
    tradeUrl: string | null;
    /** 마지막 체결로부터 일정 시간 경과 시 true — UI 에서 회색 처리. */
    isStale: boolean;
    /** 마지막 체결 시각 (ISO). */
    lastTradedAt: string;
}
export type CoinTickersResult = {
    ok: true;
    /** 입력으로 들어온 베이스 심볼 (예: "BTC"). */
    symbol: string;
    /** CoinGecko id (예: "bitcoin"). */
    coinGeckoId: string;
    /** 정렬 + limit 적용된 ticker 목록. */
    tickers: CoinTicker[];
    /** limit 적용 전 전체 ticker 개수 (= "총 N개 거래소에 상장" 표시용). */
    totalCount: number;
    /** 캐시에서 가져왔는지 여부 (디버그/UI 표시용). */
    cached: boolean;
    /** 계산 시각 (ISO). */
    computedAt: string;
} | {
    ok: false;
    code: "NOT_FOUND" | "STUB" | "RATE_LIMITED" | "INTERNAL";
    message: string;
};
export declare function clearCoinTickersCache(): void;
export declare function normalizeBaseSymbol(symbol: string): string;
export declare function fetchCoinTickers(input: {
    symbol: string;
    limit: number;
}): Promise<CoinTickersResult>;
