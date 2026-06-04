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

import { clampMultiplier } from "./types";

export * from "./types";
export type {
  MacdDivergenceType,
  MacdDivergenceResult,
} from "./macd-divergence";
export type {
  FundingRegime,
  FundingExtremeResult,
} from "./funding-extreme";
export type {
  MarketBreadthSentiment,
  MarketBreadthResult,
} from "./market-breadth";
export type {
  OrderBlockZoneType,
  OrderBlockResult,
} from "./order-block";
export type {
  RsMeanRevertRegime,
  RsMeanRevertResult,
} from "./rs-mean-revert";

export { detectMacdDivergence } from "./macd-divergence";
export { computeFundingExtreme } from "./funding-extreme";
export { computeMarketBreadth } from "./market-breadth";
export { detectOrderBlock } from "./order-block";
export { computeCRS } from "./crs";
export { computeRsMeanRevert } from "./rs-mean-revert";

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
export function combineAdditionalModifiers(decision: {
  marketBreadthMult?: number;
  macdDivergenceMult?: number;
  fundingExtremeMult?: number;
  orderBlockMult?: number;
  /** CRS-lite (6차원: 청산 반전) — 1.00~1.10. 게이트 미통과 시 1.0 (불변). */
  crsMult?: number;
  /**
   * RS-MeanRevert (1차원: BTC 대비 상대 평균회귀) — weak_laggard → 1.12, 그 외 1.00.
   * 게이트(weak_laggard)/벤치/데이터부족 미통과 시 1.0 (불변, 영향 없음).
   * regime-split 백테스트(UP/SIDEWAYS/DOWN 전부 baseline 상회 = ROBUST)로 wiring.
   */
  rsMeanRevertMult?: number;
}): number {
  const m = (v: number | undefined) =>
    v != null && Number.isFinite(v) ? v : 1.0;
  const product =
    m(decision.marketBreadthMult) *
    m(decision.macdDivergenceMult) *
    m(decision.fundingExtremeMult) *
    m(decision.orderBlockMult) *
    m(decision.crsMult) *
    m(decision.rsMeanRevertMult);
  // 회귀 가드: 곱셈 누적이 안전 상한(1.40)/하한(0.30)을 넘지 않도록 clamp.
  // RS-MeanRevert 1.12 단독은 cap 안쪽이나 다른 modifier 와 누적 시 가드.
  return clampMultiplier(product);
}
