/**
 * EMA Ribbon Modifier — 명세서 03_ADDITIONAL_STRATEGIES.md §2.
 *
 * EMA(9, 21, 50, 100, 200) 정렬 + ribbon expansion 으로 추세 건강도 측정.
 * BBDX ADX/DI 와 같은 3차원 (trend) 이지만 측정 각도가 다르다 (강도 vs 정렬).
 * 헌장 규칙 3 준수: standalone 시그널 X, BBDX confidence multiplier 로만 사용.
 *
 * 룩어헤드 안전: 마지막 캔들까지의 EMA 만 사용, i+N 미래 참조 X.
 */

import type { Candle } from "@shared/types";
import { calculateEMA } from "../indicators";
import type { ModifierResult } from "./types";
import { clampMultiplier } from "./types";

export type EmaRibbonAlignment =
  | "strong_bull"
  | "weak_bull"
  | "neutral"
  | "weak_bear"
  | "strong_bear";

export interface EmaRibbonResult extends ModifierResult {
  alignment: EmaRibbonAlignment;
  emas: {
    ema9: number;
    ema21: number;
    ema50: number;
    ema100: number;
    ema200: number;
  };
  /**
   * Ribbon expansion = (width_now - width_5_candles_ago) / |width_5_ago|.
   * 양수 = ribbon 이 벌어짐 (추세 강화), 음수 = 좁아짐 (추세 약화).
   */
  expansion: number;
}

/** alignment score → 5단계 라벨. */
function scoreToAlignment(score: number): EmaRibbonAlignment {
  if (score >= 60) return "strong_bull";
  if (score >= 30) return "weak_bull";
  if (score > -30) return "neutral";
  if (score > -60) return "weak_bear";
  return "strong_bear";
}

/**
 * 부분 정렬 점수 (-60 ~ +60). pair-wise 검증으로 점진 산출.
 * 4개 페어 (9>21, 21>50, 50>100, 100>200) 각 +15, 역정렬 -15.
 */
function computePartialScore(
  ema9: number,
  ema21: number,
  ema50: number,
  ema100: number,
  ema200: number
): number {
  let s = 0;
  s += ema9 > ema21 ? 15 : ema9 < ema21 ? -15 : 0;
  s += ema21 > ema50 ? 15 : ema21 < ema50 ? -15 : 0;
  s += ema50 > ema100 ? 15 : ema50 < ema100 ? -15 : 0;
  s += ema100 > ema200 ? 15 : ema100 < ema200 ? -15 : 0;
  return s;
}

/**
 * alignment score → multiplier (명세서 §2.3 + 본 작업 spec).
 *   score >  +30 → 1.15  (강한 정렬)
 *   +0 ~ +30      → 1.05
 *   -30 ~ 0       → 1.00  (neutral)
 *   -60 ~ -30     → 0.80  (역정렬)
 *   <  -60        → 0.30  (Falling Knife — LONG 거의 차단)
 */
function scoreToMultiplier(score: number): number {
  if (score > 30) return 1.15;
  if (score >= 0) return 1.05;
  if (score > -30) return 1.0;
  if (score > -60) return 0.80;
  return 0.30;
}

/**
 * 캔들 i 까지의 모든 EMA 시리즈 산출 — calculateEMA 가 전체 시리즈를 리턴
 * 안 하므로, 각 i 에 대해 호출. 5 candle 이전 width 비교를 위해 전체 시리즈
 * 가 필요하다.
 *
 * 비용: O(N × period) 한 번만. N = 250 기준 ~50ms 미만.
 */
function emaSeries(values: number[], period: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    out.push(calculateEMA(values.slice(0, i + 1), period));
  }
  return out;
}

/**
 * EMA Ribbon 산출.
 *
 * @param candles 시간순 정렬 (오래된 것 → 최신). 최소 200 권장.
 * @returns ModifierResult + alignment + emas + expansion.
 *
 * 데이터 부족 (< 50 캔들) 시 status="stub", multiplier=1.0 반환.
 */
export function computeEmaRibbon(candles: Candle[]): EmaRibbonResult {
  if (!candles || candles.length < 50) {
    return {
      multiplier: 1.0,
      rawScore: 0,
      reason: `EMA Ribbon — 데이터 부족 (${candles?.length ?? 0} 캔들, 50+ 필요)`,
      dimension: 3,
      status: "stub",
      alignment: "neutral",
      emas: { ema9: 0, ema21: 0, ema50: 0, ema100: 0, ema200: 0 },
      expansion: 0,
    };
  }

  const closes = candles.map((c) => c.close);
  const e9s = emaSeries(closes, 9);
  const e21s = emaSeries(closes, 21);
  const e50s = emaSeries(closes, 50);
  const e100s = emaSeries(closes, 100);
  const e200s = emaSeries(closes, 200);

  const i = closes.length - 1;
  const ema9 = e9s[i];
  const ema21 = e21s[i];
  const ema50 = e50s[i];
  const ema100 = e100s[i];
  const ema200 = e200s[i];

  const perfectBull =
    ema9 > ema21 && ema21 > ema50 && ema50 > ema100 && ema100 > ema200;
  const perfectBear =
    ema9 < ema21 && ema21 < ema50 && ema50 < ema100 && ema100 < ema200;

  // expansion: 5 candle 이전 vs 현재 ribbon 폭 비교
  const prevIdx = Math.max(0, i - 5);
  const widthNow = ema9 - ema200;
  const widthBefore = e9s[prevIdx] - e200s[prevIdx];
  const expansion =
    Math.abs(widthBefore) > 1e-9
      ? (widthNow - widthBefore) / Math.abs(widthBefore)
      : 0;

  let score: number;
  if (perfectBull) score = expansion > 0 ? 90 : 60;
  else if (perfectBear) score = expansion > 0 ? -90 : -60;
  else score = computePartialScore(ema9, ema21, ema50, ema100, ema200);

  const alignment = scoreToAlignment(score);
  const multiplier = clampMultiplier(scoreToMultiplier(score));

  let reason = `EMA Ribbon ${alignment} (score=${score.toFixed(0)})`;
  if (perfectBull) reason += " — perfect bull alignment";
  else if (perfectBear) reason += " — perfect bear alignment";
  if (Math.abs(expansion) > 0.05) {
    reason += `, expansion ${expansion > 0 ? "+" : ""}${(expansion * 100).toFixed(1)}%`;
  }

  return {
    multiplier,
    rawScore: score,
    reason,
    dimension: 3,
    status: "real",
    alignment,
    emas: { ema9, ema21, ema50, ema100, ema200 },
    expansion,
  };
}
