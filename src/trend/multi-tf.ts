/**
 * Multi-timeframe trend direction — server-side port.
 *
 * Computes a single direction (BULLISH / BEARISH / SIDEWAYS) per
 * timeframe by reusing the existing `calculateADX` and `calculateEMA`
 * helpers from `indicators.ts`. This is the minimal port needed to
 * feed `wave-alignment.ts`; the v2.0 spec's full ATR-dynamic +
 * weighted-regression engine (Part III.3) is bigger work and lives
 * in a future iteration. See plan B.3 / cross-cutting items.
 *
 * Pure: takes candle arrays per TF, returns labels. No I/O.
 */

import type { Candle } from "@shared/types";

import { calculateADX, calculateEMA } from "../indicators";

export type TrendDirection = "BULLISH" | "BEARISH" | "SIDEWAYS";

export interface TimeframeTrend {
  /** Identifier supplied by caller, e.g. "15m" / "1h" / "4h" / "1d". */
  tf: string;
  direction: TrendDirection;
  /** ADX value of the timeframe, used downstream for telemetry. */
  adx: number;
  plusDi: number;
  minusDi: number;
  /** EMA alignment label: bullish when 9>21>50, bearish when 9<21<50, mixed otherwise. */
  emaAlignment: "bullish" | "bearish" | "mixed";
}

/**
 * Classify a single timeframe's trend from candles.
 *
 * - ADX < 20 → SIDEWAYS regardless of EMA (low-strength regime).
 * - +DI > -DI AND EMA bullish-aligned → BULLISH.
 * - -DI > +DI AND EMA bearish-aligned → BEARISH.
 * - Anything else → SIDEWAYS.
 *
 * Returns `direction = SIDEWAYS` and zero ADX when given too-few
 * candles. Caller can decide how to handle that.
 */
export function classifyTimeframeTrend(
  candles: Candle[],
  tf: string
): TimeframeTrend {
  if (candles.length < 30) {
    return {
      tf,
      direction: "SIDEWAYS",
      adx: 0,
      plusDi: 0,
      minusDi: 0,
      emaAlignment: "mixed",
    };
  }

  const closes = candles.map((c) => c.close);
  const { adx, plusDi, minusDi } = calculateADX(candles);
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const ema50 = calculateEMA(closes, 50);

  const bullishAligned = ema9 > ema21 && ema21 > ema50;
  const bearishAligned = ema9 < ema21 && ema21 < ema50;
  const emaAlignment: "bullish" | "bearish" | "mixed" = bullishAligned
    ? "bullish"
    : bearishAligned
      ? "bearish"
      : "mixed";

  let direction: TrendDirection = "SIDEWAYS";
  if (adx >= 20) {
    if (plusDi > minusDi && bullishAligned) direction = "BULLISH";
    else if (minusDi > plusDi && bearishAligned) direction = "BEARISH";
  }

  return {
    tf,
    direction,
    adx,
    plusDi,
    minusDi,
    emaAlignment,
  };
}

/**
 * Run `classifyTimeframeTrend` over all provided timeframes. Caller
 * passes the candle array per TF in any order; result preserves order.
 */
export function classifyMultiTF(
  perTf: { tf: string; candles: Candle[] }[]
): TimeframeTrend[] {
  return perTf.map(({ tf, candles }) => classifyTimeframeTrend(candles, tf));
}

// ────────────────────────────────────────────────────────────────────────────
// Deep multi-TF trend (v2.0 명세서 §4.5~§4.10) — 4-tier confirmation.
//
// Legacy `classifyTimeframeTrend` 는 보존 (호환성). 본 deep 버전은:
//   1차 — Trendline slope (단순화: 직전 20 캔들 close linear regression)
//   2차 — EMA Array (5-state: BULLISH_ALIGNED / BEARISH_ALIGNED / GOLDEN / DEATH / MIXED)
//   3차 — ADX Strength (STRONG / WEAK / BORDERLINE)
//   4차 — HH/HL Structure (Williams 5-bar swing fractal, 마지막 2 swing 비교)
// + 거래량 보조 (INCREASING / FLAT / DECREASING)
// confidenceScore = side 부합 confirmations 갯수 × 25 (max 100).
// ────────────────────────────────────────────────────────────────────────────

export type EmaArrayState =
  | "GOLDEN"
  | "DEATH"
  | "BULLISH_ALIGNED"
  | "BEARISH_ALIGNED"
  | "MIXED";
export type AdxStrength = "STRONG" | "WEAK" | "BORDERLINE";
export type StructureState =
  | "HH_HL_x2"
  | "HH_HL_x1"
  | "MIXED"
  | "LH_LL_x1"
  | "LH_LL_x2";
export type VolumeConfirmation = "INCREASING" | "FLAT" | "DECREASING";

export interface DeepTimeframeTrend {
  tf: string;
  side: "BULLISH" | "BEARISH" | "SIDEWAYS";
  /** 4-tier confirmation: trendline + EMA + ADX + structure (+ volume aux). */
  confirmations: {
    trendline: boolean;
    emaArray: EmaArrayState;
    adxStrength: AdxStrength;
    hhHlStructure: StructureState;
    volumeConfirm: VolumeConfirmation;
  };
  /** 0~100, side 부합 confirmations 갯수 × 25. */
  confidenceScore: number;
  emas: { ema9: number; ema21: number; ema50: number };
  adx: number;
  diPlus: number;
  diMinus: number;
}

/** 직전 N close 값의 linear regression slope (간단 LSQ). */
function linearRegressionSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

/** EMA 배열 5-state 분류. last 5 캔들 안 cross 여부로 GOLDEN/DEATH 판정. */
function classifyEmaArray(closes: number[]): EmaArrayState {
  if (closes.length < 50) return "MIXED";
  const ema9Now = calculateEMA(closes, 9);
  const ema21Now = calculateEMA(closes, 21);
  const ema50Now = calculateEMA(closes, 50);

  // 직전 5 캔들 안 ema9 vs ema21 cross 검사 (GOLDEN/DEATH)
  // 5 캔들 전 시점의 EMA 와 현재 비교.
  const prevCloses = closes.slice(0, closes.length - 5);
  if (prevCloses.length >= 50) {
    const ema9Prev = calculateEMA(prevCloses, 9);
    const ema21Prev = calculateEMA(prevCloses, 21);
    if (ema9Prev <= ema21Prev && ema9Now > ema21Now) return "GOLDEN";
    if (ema9Prev >= ema21Prev && ema9Now < ema21Now) return "DEATH";
  }

  if (ema9Now > ema21Now && ema21Now > ema50Now) return "BULLISH_ALIGNED";
  if (ema9Now < ema21Now && ema21Now < ema50Now) return "BEARISH_ALIGNED";
  return "MIXED";
}

/** ADX 강도 3단계. */
function classifyAdxStrength(adx: number): AdxStrength {
  if (adx > 25) return "STRONG";
  if (adx < 20) return "WEAK";
  return "BORDERLINE";
}

/** Williams 5-bar swing high/low fractal — center bar 가 양옆 2 보다 strict 큼/작음. */
interface SwingPoint {
  idx: number;
  price: number;
  type: "HIGH" | "LOW";
}

function detectSwingPoints(candles: Candle[]): SwingPoint[] {
  const swings: SwingPoint[] = [];
  for (let i = 2; i < candles.length - 2; i++) {
    const c = candles[i];
    const isHigh =
      c.high > candles[i - 1].high &&
      c.high > candles[i - 2].high &&
      c.high > candles[i + 1].high &&
      c.high > candles[i + 2].high;
    const isLow =
      c.low < candles[i - 1].low &&
      c.low < candles[i - 2].low &&
      c.low < candles[i + 1].low &&
      c.low < candles[i + 2].low;
    if (isHigh) swings.push({ idx: i, price: c.high, type: "HIGH" });
    if (isLow) swings.push({ idx: i, price: c.low, type: "LOW" });
  }
  return swings;
}

/** 마지막 2 swing high + 2 swing low 비교 → HH/HL 구조 5-state. */
function classifyHhHlStructure(candles: Candle[]): StructureState {
  if (candles.length < 10) return "MIXED";
  // 직전 30 캔들 (또는 전체) 에서 swing 탐지.
  const slice = candles.slice(-Math.min(30, candles.length));
  const swings = detectSwingPoints(slice);
  const highs = swings.filter((s) => s.type === "HIGH").slice(-2);
  const lows = swings.filter((s) => s.type === "LOW").slice(-2);
  if (highs.length < 2 || lows.length < 2) return "MIXED";

  const hh = highs[1].price > highs[0].price;
  const hl = lows[1].price > lows[0].price;
  const lh = highs[1].price < highs[0].price;
  const ll = lows[1].price < lows[0].price;

  if (hh && hl) return "HH_HL_x2";
  if (lh && ll) return "LH_LL_x2";
  if (hh || hl) return "HH_HL_x1";
  if (lh || ll) return "LH_LL_x1";
  return "MIXED";
}

/** 직전 10 캔들 거래량 추세: 5-on-5 비교. */
function classifyVolumeConfirmation(candles: Candle[]): VolumeConfirmation {
  if (candles.length < 10) return "FLAT";
  const last10 = candles.slice(-10);
  const recent5 = last10.slice(5).reduce((s, c) => s + c.volume, 0) / 5;
  const prior5 = last10.slice(0, 5).reduce((s, c) => s + c.volume, 0) / 5;
  if (prior5 <= 0) return "FLAT";
  const ratio = recent5 / prior5;
  if (ratio > 1.15) return "INCREASING";
  if (ratio < 0.85) return "DECREASING";
  return "FLAT";
}

/**
 * Deep multi-TF trend 분석. v2.0 명세서 §4.5~§4.10 의 단순화 구현 —
 * weighted-LSQ regression / dynamic ATR threshold 는 후속 iteration.
 *
 * 입력 캔들 부족 시 (50 미만) SIDEWAYS + 0 confidence + neutral confirmations.
 */
export function analyzeTimeframeTrendDeep(
  candles: Candle[],
  tf: string
): DeepTimeframeTrend {
  if (candles.length < 50) {
    return {
      tf,
      side: "SIDEWAYS",
      confirmations: {
        trendline: false,
        emaArray: "MIXED",
        adxStrength: "WEAK",
        hhHlStructure: "MIXED",
        volumeConfirm: "FLAT",
      },
      confidenceScore: 0,
      emas: { ema9: 0, ema21: 0, ema50: 0 },
      adx: 0,
      diPlus: 0,
      diMinus: 0,
    };
  }

  const closes = candles.map((c) => c.close);
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const ema50 = calculateEMA(closes, 50);
  const { adx, plusDi, minusDi } = calculateADX(candles);

  const emaArray = classifyEmaArray(closes);
  const adxStrength = classifyAdxStrength(adx);
  const hhHlStructure = classifyHhHlStructure(candles);
  const volumeConfirm = classifyVolumeConfirmation(candles);

  const slopeWindow = closes.slice(-Math.min(20, closes.length));
  const slope = linearRegressionSlope(slopeWindow);
  const slopeNorm = Math.abs(slope) / Math.max(Math.abs(slopeWindow[slopeWindow.length - 1]), 1e-9);
  // 의미 있는 slope 기준: 정규화된 절대값 > 0.0005 (per-bar 0.05%)
  const slopeMeaningful = slopeNorm > 0.0005;

  // Side 결정 — bullish/bearish align + STRONG ADX + slope 일치.
  let side: "BULLISH" | "BEARISH" | "SIDEWAYS";
  const bullishEma =
    emaArray === "BULLISH_ALIGNED" || emaArray === "GOLDEN";
  const bearishEma =
    emaArray === "BEARISH_ALIGNED" || emaArray === "DEATH";
  if (bullishEma && adxStrength === "STRONG" && slope > 0 && slopeMeaningful) {
    side = "BULLISH";
  } else if (bearishEma && adxStrength === "STRONG" && slope < 0 && slopeMeaningful) {
    side = "BEARISH";
  } else if (bullishEma && plusDi > minusDi && slope > 0 && slopeMeaningful && adxStrength !== "WEAK") {
    // BORDERLINE ADX 도 EMA + DI + slope 가 다 일치하면 BULLISH 인정 (낮은 신뢰도).
    side = "BULLISH";
  } else if (bearishEma && minusDi > plusDi && slope < 0 && slopeMeaningful && adxStrength !== "WEAK") {
    side = "BEARISH";
  } else {
    side = "SIDEWAYS";
  }

  // Trendline confirmation: side 와 slope 부호 일치.
  let trendlineConfirm = false;
  if (side === "BULLISH") trendlineConfirm = slope > 0 && slopeMeaningful;
  else if (side === "BEARISH") trendlineConfirm = slope < 0 && slopeMeaningful;
  // SIDEWAYS → false 유지

  // confidenceScore 계산 — side 부합 4 confirmations 갯수 × 25.
  let confirmCount = 0;
  if (side === "BULLISH") {
    if (trendlineConfirm) confirmCount++;
    if (emaArray === "BULLISH_ALIGNED" || emaArray === "GOLDEN") confirmCount++;
    if (adxStrength === "STRONG") confirmCount++;
    if (hhHlStructure === "HH_HL_x2" || hhHlStructure === "HH_HL_x1") confirmCount++;
  } else if (side === "BEARISH") {
    if (trendlineConfirm) confirmCount++;
    if (emaArray === "BEARISH_ALIGNED" || emaArray === "DEATH") confirmCount++;
    if (adxStrength === "STRONG") confirmCount++;
    if (hhHlStructure === "LH_LL_x2" || hhHlStructure === "LH_LL_x1") confirmCount++;
  }
  const confidenceScore = confirmCount * 25;

  return {
    tf,
    side,
    confirmations: {
      trendline: trendlineConfirm,
      emaArray,
      adxStrength,
      hhHlStructure,
      volumeConfirm,
    },
    confidenceScore,
    emas: { ema9, ema21, ema50 },
    adx,
    diPlus: plusDi,
    diMinus: minusDi,
  };
}
