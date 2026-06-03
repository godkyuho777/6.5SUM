/**
 * Additional Strategies modifiers — 통합 export.
 *
 * BBDX 코어 시그널의 multiplier 로 통합 (헌장 규칙 3, modifier-only).
 *
 * 7차원 매핑:
 *   1 momentum   → MACD Divergence  (rule1Exempt: RSI 와 다른 각도)
 *   5 structure  → Order Block      (Fib/Trendline 과 다른 각도)
 *   6 macro      → Market Breadth, Funding Extreme
 */
export * from "./types";
export type { MacdDivergenceType, MacdDivergenceResult, } from "./macd-divergence";
export type { FundingRegime, FundingExtremeResult, } from "./funding-extreme";
export type { MarketBreadthSentiment, MarketBreadthResult, } from "./market-breadth";
export type { OrderBlockZoneType, OrderBlockResult, } from "./order-block";
export { detectMacdDivergence } from "./macd-divergence";
export { computeFundingExtreme } from "./funding-extreme";
export { computeMarketBreadth } from "./market-breadth";
export { detectOrderBlock } from "./order-block";
export { computeCRS } from "./crs";
/**
 * 모든 추가 modifier 의 multiplier 를 합산 (단순 product).
 *
 * NOTE — BBDX 코어 final_confidence 곱셈 체인:
 *   final_confidence = base
 *                    × confluence
 *                    × wave
 *                    × macro
 *                    × onchain
 *                    × vwapMult
 *                    × combineAdditionalModifiers(...)   ← 본 함수
 */
export declare function combineAdditionalModifiers(decision: {
    marketBreadthMult?: number;
    macdDivergenceMult?: number;
    fundingExtremeMult?: number;
    orderBlockMult?: number;
    /** CRS-lite (6차원: 청산 반전) — 1.00~1.10. 게이트 미통과 시 1.0 (불변). */
    crsMult?: number;
}): number;
