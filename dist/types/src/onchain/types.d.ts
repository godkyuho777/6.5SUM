/**
 * 온체인 데이터 통합 — 타입 정의 (Tradelab 7번 차원)
 *
 * 명세서 ONCHAIN_INTEGRATION.md 의 타입 표현. 7개 modifier가 BBDX 시그널의
 * 가중치(multiplier)로만 작동하며, 단독 시그널을 발행하지 않는다 (헌장 규칙 3).
 *
 * Modifier 임계값 요약 (각 -0.25 ~ +0.20 범위):
 *   - exchange_netflow: z<-2 → +0.20, z>+2 → -0.25
 *   - whale_alert:      net>+3 → +0.15, net<-3 → -0.20
 *   - ssr:              z<-1.5 → +0.15, z>+1.5 → -0.20
 *   - coinbase_premium: >+0.2% → +0.15, <-0.2% → -0.20
 *   - etf_flow:         3d>+$1.5B → +0.20, 3d<-$1B → -0.25
 *   - miner_outflow:    z>+2 → -0.15, z<-1.5 → +0.10
 *   - lth_supply:       30d>+2% → +0.10, 30d<-2% → -0.15
 */
export type OnchainModifierKey = "exchange_netflow" | "whale_alert" | "ssr" | "coinbase_premium" | "etf_flow" | "miner_outflow" | "lth_supply";
export type OnchainRegime = "strong_accumulation" | "accumulation" | "neutral" | "distribution" | "strong_distribution";
/** 단일 modifier 결과. value 는 -0.25 ~ +0.20, status 는 데이터 가용성. */
export interface OnchainModifierResult {
    key: OnchainModifierKey;
    /** -0.25 ~ +0.20 범위. 0 이면 데이터 없음 또는 영향 없음. */
    value: number;
    /**
     * "ok" = 진짜 데이터,
     * "stub" = API 키 없음 / 데이터 미가용 (value=0, BBDX 점수에 영향 없음),
     * "mock" = ONCHAIN_MOCK=1 결정론 시각화 mock (합산에 포함, 결정론적),
     * "error" = 호출 실패
     */
    status: "ok" | "stub" | "mock" | "error";
    /** 한 줄 설명 (UI breakdown 용). */
    detail: string;
    /** 원시 메트릭 (디버깅·UI 보조). 모듈마다 자유 형식. */
    raw?: Record<string, unknown>;
}
/** 7개 modifier 합산 결과 + regime 분류. */
export interface OnchainScore {
    symbol: string;
    /** -1.0 ~ +1.0 정규화 점수. */
    score: number;
    regime: OnchainRegime;
    /** 7개 modifier 의 raw 결과. */
    modifiers: OnchainModifierResult[];
    /** UTC ISO timestamp. */
    computedAt: string;
}
/** BBDX 진입 시그널이 온체인 가중치를 적용받은 결과. */
export interface OnchainAdjustedEntry {
    baseStrength: number;
    /** 1 + score × 0.30 (range 0.70 ~ 1.30). */
    multiplier: number;
    /** baseStrength × multiplier, 100 cap. */
    finalStrength: number;
    /** strong_distribution + 평균회귀 진입 시 true → 자본 보호 차단. */
    blocked: boolean;
    blockReason: string | null;
    regime: OnchainRegime;
    modifiers: OnchainModifierResult[];
}
/** Modifier 한도 (헌장 규칙 검증 + UI 가시화 용). */
export declare const MODIFIER_BOUNDS: {
    readonly min: -0.25;
    readonly max: 0.2;
    /**
     * 7개 합산 후 정규화 분모 (절대값 기준 ~1.4 범위 → -1.0 ~ +1.0).
     *
     * ⚠ P1-#4 audit (2026-05-10) — `score.ts:NORMALIZATION_DENOMINATOR=1.35`
     * 와 다른 값 (`score-fetch.ts` UI fetch 경로용). spec
     * `BBDX_v6.5_FULL_DIMENSION.md:237` 은 1.35 명시 — `score.ts` 가 spec
     * 우선. 본 1.40 은 `score-fetch.ts` (외부 API fetch + UI 메타) 경로의
     * raw modifier max abs 합 (1.40) 정확값. 두 경로가 *동일 score* 산출
     * 하도록 후속 spec 명확화 권고 (P2 작업, audit `02-ONCHAIN-AUDIT.md` §1).
     */
    readonly normalizationDenom: 1.4;
};
/** Regime 분류 임계값. */
export declare const REGIME_THRESHOLDS: {
    readonly strongAccumulation: 0.6;
    readonly accumulation: 0.2;
    readonly distribution: -0.2;
    readonly strongDistribution: -0.6;
};
