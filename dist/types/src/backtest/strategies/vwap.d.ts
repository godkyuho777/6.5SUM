/**
 * VWAP Strategy (Parker Brooks Style) — Signal Tracker / VWAP 페이지.
 *
 * 진입 게이트:
 *   1. price > VWAP (VWAP 위에서 매수만)
 *   2. price > EMA(9) (단기 모멘텀 확인)
 *   3. Pullback detected (VWAP/EMA9 터치 후 반등)
 *   4. 거래량 ≥ 50캔들 평균 × 1.0
 *
 * Tier 1/2:
 *   Tier 1: VWAP + 1σ → 50%
 *   Tier 2: VWAP + 2σ 또는 entry × 1.04 → 잔여 50%
 *   Stop: max(VWAP - 1σ, entry × 0.98)
 *
 * 헌장 차원: 4 volume (VWAP 는 volume-weighted), 3 trend (EMA 정렬)
 */
import type { BacktestStrategy } from "./types";
export declare const vwapStrategy: BacktestStrategy;
