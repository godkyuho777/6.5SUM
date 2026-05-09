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
import { clampMultiplier } from "./types";

export type OrderBlockZoneType = "sell_side_liq" | "buy_side_liq" | null;

export interface OrderBlockResult extends ModifierResult {
  zoneType: OrderBlockZoneType;
  /** 어떤 swing 가격을 기준으로 판정했는지 (디버깅/UI 용) */
  pivotPrice: number | null;
  /** 명세서 §4.3 — 베타 라벨 */
  betaStub: false;
}

function findRecentSwingLow(
  lows: number[],
  upToIdx: number,
  lookback: number = 20
): { idx: number; price: number } | null {
  // 5-bar fractal: i 의 low 가 i±2 보다 작음. lookback 내 가장 최근.
  const start = Math.max(2, upToIdx - lookback);
  for (let i = upToIdx - 2; i >= start; i--) {
    if (
      lows[i] < lows[i - 1] &&
      lows[i] < lows[i - 2] &&
      lows[i] < lows[i + 1] &&
      lows[i] < lows[i + 2]
    ) {
      return { idx: i, price: lows[i] };
    }
  }
  return null;
}

function findRecentSwingHigh(
  highs: number[],
  upToIdx: number,
  lookback: number = 20
): { idx: number; price: number } | null {
  const start = Math.max(2, upToIdx - lookback);
  for (let i = upToIdx - 2; i >= start; i--) {
    if (
      highs[i] > highs[i - 1] &&
      highs[i] > highs[i - 2] &&
      highs[i] > highs[i + 1] &&
      highs[i] > highs[i + 2]
    ) {
      return { idx: i, price: highs[i] };
    }
  }
  return null;
}

/**
 * Order Block 탐지.
 *
 * @param candles 시간순 정렬, 최소 25 캔들 권장.
 */
export function detectOrderBlock(candles: Candle[]): OrderBlockResult {
  if (!candles || candles.length < 25) {
    return {
      multiplier: 1.0,
      rawScore: 0,
      reason: `Order Block — 데이터 부족 (${candles?.length ?? 0} < 25)`,
      dimension: 5,
      status: "stub",
      zoneType: null,
      pivotPrice: null,
      betaStub: false,
    };
  }

  const lows = candles.map((c) => c.low);
  const highs = candles.map((c) => c.high);
  const last = candles[candles.length - 1];
  const lastIdx = candles.length - 1;

  const recentSwingLow = findRecentSwingLow(lows, lastIdx, 20);
  const recentSwingHigh = findRecentSwingHigh(highs, lastIdx, 20);

  // ── Sell-side liquidity grab: 현재 캔들이 swing low 를 살짝 깬 후 회복
  if (recentSwingLow) {
    const piercedAndRecovered =
      last.low < recentSwingLow.price && last.close > recentSwingLow.price;
    if (piercedAndRecovered) {
      // 침투 정도 (작을수록 정밀한 grab) — 0~5% 사이를 score 0~100 로
      const piercePct =
        ((recentSwingLow.price - last.low) / recentSwingLow.price) * 100;
      const rawScore = Math.max(0, Math.min(100, 100 - piercePct * 20));
      return {
        multiplier: clampMultiplier(1.05, 0.90, 1.10),
        rawScore,
        reason: `Order Block sell-side liquidity grab (swing low ${recentSwingLow.price.toFixed(2)} pierced & recovered)`,
        dimension: 5,
        status: "real",
        zoneType: "sell_side_liq",
        pivotPrice: recentSwingLow.price,
        betaStub: false,
      };
    }
  }

  // ── Buy-side liquidity grab: 현재 캔들이 swing high 위로 wick 후 회복 실패
  if (recentSwingHigh) {
    const wickedAndRejected =
      last.high > recentSwingHigh.price && last.close < recentSwingHigh.price;
    if (wickedAndRejected) {
      const piercePct =
        ((last.high - recentSwingHigh.price) / recentSwingHigh.price) * 100;
      const rawScore = Math.max(0, Math.min(100, 100 - piercePct * 20));
      return {
        multiplier: clampMultiplier(0.95, 0.90, 1.10),
        rawScore,
        reason: `Order Block buy-side liquidity grab (swing high ${recentSwingHigh.price.toFixed(2)} wicked & rejected)`,
        dimension: 5,
        status: "real",
        zoneType: "buy_side_liq",
        pivotPrice: recentSwingHigh.price,
        betaStub: false,
      };
    }
  }

  return {
    multiplier: 1.0,
    rawScore: 0,
    reason: "Order Block — neutral (no liquidity grab detected)",
    dimension: 5,
    status: "real",
    zoneType: null,
    pivotPrice: null,
    betaStub: false,
  };
}
