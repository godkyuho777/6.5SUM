/**
 * Order Block / Liquidity Pool Modifier — 명세서 §4 (베타).
 *
 * ICT/SMC (Smart Money Concepts) 학파 기반. 정량화 합의가 없어 단순 휴리스틱
 * 으로 시작하고 multiplier 영향력을 작게 (max ±0.05) 제한.
 *
 * 휴리스틱:
 *   1. 직전 N(20) 캔들에서 swing low / swing high 탐지 (5-bar fractal).
 *   2. 현재 캔들이 swing low 를 살짝 깬 후 회복 (close > swing low) →
 *      "sell-side liquidity grab" → LONG 약가산 (1.05).
 *   3. 현재 캔들이 swing high 위로 wick 후 회복 실패 (close < swing high) →
 *      "buy-side liquidity grab" → LONG 약차감 (0.95).
 *   4. 그 외 → neutral (1.00).
 *
 * 차원 5 (structure). Fibonacci/Trendline 과 같은 차원이지만 측정 각도 다름
 * (확정 레벨 vs 유동성 sweep). dimension-mapping 에 등록 시 rule1Exempt.
 *
 * 룩어헤드 안전: 현재 캔들 (= 최신 닫힌 캔들) 과 직전 swing 만 사용.
 */
import type { Candle } from "@shared/types";
import type { ModifierResult } from "./types";
export type OrderBlockZoneType = "sell_side_liq" | "buy_side_liq" | null;
export interface OrderBlockResult extends ModifierResult {
    zoneType: OrderBlockZoneType;
    /** 어떤 swing 가격을 기준으로 판정했는지 (디버깅/UI 용) */
    pivotPrice: number | null;
    /** 명세서 §4.3 — 베타 라벨 */
    betaStub: false;
}
/**
 * Order Block 탐지.
 *
 * @param candles 시간순 정렬, 최소 25 캔들 권장.
 */
export declare function detectOrderBlock(candles: Candle[]): OrderBlockResult;
