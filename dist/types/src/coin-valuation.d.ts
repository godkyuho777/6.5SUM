/**
 * Coin Valuation — 코인별 밸류에이션 지표 (where possible).
 *
 * 목적: "이 코인을 어떻게/얼마로 평가할 수 있나?" 를 CoinDetail "밸류에이션" 탭에
 * 보여준다. 핵심은 *모든 코인을 같은 잣대로 보지 않는 것* — 현금흐름이 있는
 * 프로토콜은 P/F·TVL 배수로, BTC 는 가치저장 관점으로, 밈은 "밸류에이션 부적합"
 * 으로 정직하게 분류한다.
 *
 * 데이터:
 *   - 신뢰 코어 = CoinGecko (getCoinInfo 재사용): 시총·FDV·공급·거래량.
 *     → FDV/MC, 유통비율, NVT 근사(시총/24h거래량) 항상 계산 가능(23-coin).
 *   - 펀더멘털 enrichment = DefiLlama 무료 API (best-effort, 실패 시 null):
 *     체인 TVL(/v2/chains, gecko_id 매칭) · 프로토콜 TVL(/tvl/{slug}) ·
 *     수수료(/overview/fees, geckoId 매칭) → MC/TVL, P/F.
 *
 * 헌장:
 *   - 외부 API 키 필수화 금지 (CoinGecko·DefiLlama 모두 무료·키 없음).
 *   - 모든 외부 호출 try/catch, throw 금지 → 실패 지표는 null, status 로 신호.
 *   - 밸류에이션은 *리서치/교육* 표시용. BBDX 시그널과 무관, 단독 매매 신호 X.
 */
export type ValuationKind = "fundamental" | "store-of-value" | "not-applicable" | "limited";
export interface CoinValuation {
    symbol: string;
    baseSymbol: string;
    name: string;
    /** "ok" = 코어 데이터 있음, "stub" = 화이트리스트 외, "error" = 호출 실패 */
    status: "ok" | "stub" | "error";
    kind: ValuationKind;
    kindLabel: string;
    kindNote: string;
    priceUsd: number | null;
    marketCapUsd: number | null;
    fdvUsd: number | null;
    volume24hUsd: number | null;
    circulatingSupply: number | null;
    totalSupply: number | null;
    maxSupply: number | null;
    /** FDV / 시총 — 미래 희석 배수 (1=완전유통, ↑일수록 언락 부담) */
    fdvMcRatio: number | null;
    /** 유통 공급 / (max 또는 total) — 유통 비율 0~1 */
    circulatingPct: number | null;
    /** 시총 / 24h 거래량 — NVT 근사(거래소 거래량 기반, 참고용) */
    nvtApprox: number | null;
    /** 온체인 TVL (DeFi 프로토콜/체인) */
    tvlUsd: number | null;
    /** 시총 / TVL — P/TVL (낮을수록 TVL 대비 저평가) */
    mcTvlRatio: number | null;
    /** 연환산 프로토콜 수수료 */
    annualizedFeesUsd: number | null;
    /** 시총 / 연환산 수수료 — P/F (전통 P/S 의 크립토판) */
    priceToFees: number | null;
    /** 데이터 가용성/주의 노트 (UI 에 그대로 노출) */
    notes: string[];
    asOf: number;
    errorDetail?: string;
}
/**
 * 단일 코인의 밸류에이션 패키지 반환. 외부 호출 실패해도 throw 하지 않고
 * 가능한 지표만 채워 반환한다(나머지는 null).
 */
export declare function getCoinValuation(symbol: string): Promise<CoinValuation>;
