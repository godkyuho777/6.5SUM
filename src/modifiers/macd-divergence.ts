/**
 * MACD Histogram Divergence Modifier — 명세서 §1.
 *
 * MACD(12, 26, 9) histogram 의 swing 과 가격 swing 비교로 다이버전스 탐지.
 * RSI 와 같은 차원 (1: momentum) 이지만 측정 각도가 다르다 (level vs
 * momentum-of-momentum). 헌장 규칙 1 예외 (allowsSameDimensionPair).
 *
 * 룩어헤드 안전: 모든 swing 탐지는 i 시점까지 데이터만 사용.
 */

import type { Candle } from "@shared/types";
import type { ModifierResult } from "./types";
import { clampMultiplier } from "./types";

export type MacdDivergenceType =
  | "bullish"
  | "bearish"
  | "hidden_bullish"
  | "hidden_bearish"
  | "none";

export interface MacdDivergenceResult extends ModifierResult {
  type: MacdDivergenceType;
  /** 0 ~ 1. swing 거리/매그니튜드 기반. */
  strength: number;
  swings: {
    priceSwingHighIdxs: number[];
    priceSwingLowIdxs: number[];
    histAtSwings: number[];
  };
}

// ─── EMA / MACD 시리즈 헬퍼 ─────────────────────────────────────────

function emaArr(values: number[], period: number): number[] {
  if (values.length === 0 || period <= 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  // SMA seed 후 EMA 점화식
  if (values.length < period) {
    let acc = 0;
    for (let i = 0; i < values.length; i++) {
      acc += values[i];
      out.push(acc / (i + 1));
    }
    return out;
  }
  let seed = 0;
  for (let i = 0; i < period; i++) {
    seed += values[i];
    out.push(seed / (i + 1));
  }
  let prev = out[period - 1];
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

/** MACD histogram = ema(12) - ema(26) - ema(signal=9 of macdLine). */
function macdHistogram(closes: number[]): number[] {
  if (closes.length < 26) {
    return new Array(closes.length).fill(0);
  }
  const ema12 = emaArr(closes, 12);
  const ema26 = emaArr(closes, 26);
  const macdLine = closes.map((_, i) => ema12[i] - ema26[i]);
  const signal = emaArr(macdLine, 9);
  return macdLine.map((v, i) => v - signal[i]);
}

// ─── Williams Fractal swing 탐지 (5-bar pattern) ────────────────────

/**
 * 5-bar fractal swing high. i 의 high 가 i-2, i-1, i+1, i+2 보다 크면 swing.
 * 룩어헤드 방지 — fractal 은 항상 i+2 이후 시점에서 확정 가능. lookback 50 이면
 * 가장 최신 swing 은 i = N-3 까지.
 */
function findSwingHighs(highs: number[], maxIdx: number): number[] {
  const out: number[] = [];
  for (let i = 2; i <= maxIdx - 2; i++) {
    if (
      highs[i] > highs[i - 1] &&
      highs[i] > highs[i - 2] &&
      highs[i] > highs[i + 1] &&
      highs[i] > highs[i + 2]
    ) {
      out.push(i);
    }
  }
  return out;
}

function findSwingLows(lows: number[], maxIdx: number): number[] {
  const out: number[] = [];
  for (let i = 2; i <= maxIdx - 2; i++) {
    if (
      lows[i] < lows[i - 1] &&
      lows[i] < lows[i - 2] &&
      lows[i] < lows[i + 1] &&
      lows[i] < lows[i + 2]
    ) {
      out.push(i);
    }
  }
  return out;
}

// ─── strength 계산 ─────────────────────────────────────────────────

/**
 * Strength 0~1 : swing 거리 + histogram 차이 magnitude.
 *   - distanceFactor: 두 swing 간 캔들 거리 / lookback (적정 1) — 너무 가까우면 약함
 *   - magnitudeFactor: |hist1 - hist2| / max(|hist|) — 히스토그램 차이가 클수록 강함
 */
function divergenceStrength(
  s1Idx: number,
  s2Idx: number,
  hist1: number,
  hist2: number,
  histRange: number,
  lookback: number,
  minSwingDistance: number
): number {
  const distance = s2Idx - s1Idx;
  if (distance < minSwingDistance) return 0;
  const distanceFactor = Math.min(1, distance / lookback);
  const magnitudeFactor =
    histRange > 1e-9 ? Math.min(1, Math.abs(hist1 - hist2) / histRange) : 0;
  return Math.min(1, 0.4 * distanceFactor + 0.6 * magnitudeFactor);
}

/**
 * MACD divergence multiplier (헌장 규칙 3 — base × multiplier 형태로만 사용).
 *
 *   bullish divergence       → 1.0 + strength * 0.20  (LONG 강화, 최대 1.20)
 *   hidden_bullish           → 1.0 + strength * 0.10
 *   none                     → 1.00
 *   hidden_bearish           → 1.0 - strength * 0.10
 *   bearish divergence       → 1.0 - strength * 0.20  (LONG 약화, 최소 0.80)
 */
function typeToMultiplier(type: MacdDivergenceType, strength: number): number {
  switch (type) {
    case "bullish":
      return clampMultiplier(1.0 + strength * 0.20, 0.80, 1.20);
    case "hidden_bullish":
      return clampMultiplier(1.0 + strength * 0.10, 0.90, 1.10);
    case "bearish":
      return clampMultiplier(1.0 - strength * 0.20, 0.80, 1.20);
    case "hidden_bearish":
      return clampMultiplier(1.0 - strength * 0.10, 0.90, 1.10);
    default:
      return 1.0;
  }
}

/**
 * Divergence 탐지.
 *
 * @param candles 시간순 정렬, 최소 30 캔들 권장.
 * @param lookback 최근 N 개 캔들에서 swing 검색 (기본 50).
 * @param minSwingDistance 두 swing 간 최소 거리 (기본 10).
 */
export function detectMacdDivergence(
  candles: Candle[],
  lookback: number = 50,
  minSwingDistance: number = 10
): MacdDivergenceResult {
  const minRequired = 35; // 26 + signal 9 + buffer
  if (!candles || candles.length < minRequired) {
    return {
      multiplier: 1.0,
      rawScore: 0,
      reason: `MACD divergence — 데이터 부족 (${candles?.length ?? 0} < ${minRequired})`,
      dimension: 1,
      status: "stub",
      type: "none",
      strength: 0,
      swings: { priceSwingHighIdxs: [], priceSwingLowIdxs: [], histAtSwings: [] },
    };
  }

  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const hist = macdHistogram(closes);

  // lookback 윈도우의 시작 인덱스
  const start = Math.max(0, candles.length - lookback);
  const maxIdx = candles.length - 1;

  // swing 탐지 — fractal 은 i+2 까지 봐야 확정됨. 룩어헤드 방지 위해
  // maxIdx-2 까지만 후보로 인정 (현재 시점 이전에 이미 확정된 swing).
  const swingHighIdxsAll = findSwingHighs(highs, maxIdx);
  const swingLowIdxsAll = findSwingLows(lows, maxIdx);

  // lookback 윈도우 내 swing 만
  const swingHighIdxs = swingHighIdxsAll.filter((i) => i >= start);
  const swingLowIdxs = swingLowIdxsAll.filter((i) => i >= start);

  const histRange = Math.max(...hist.map((h) => Math.abs(h)), 1e-9);

  let detected: MacdDivergenceType = "none";
  let strength = 0;

  // ── Bearish divergence: 가격 신고가 + histogram 하락 (마지막 두 swing high)
  if (swingHighIdxs.length >= 2) {
    const [s1, s2] = swingHighIdxs.slice(-2);
    const priceUp = highs[s2] > highs[s1];
    const histDown = hist[s2] < hist[s1];
    if (priceUp && histDown) {
      detected = "bearish";
      strength = divergenceStrength(
        s1,
        s2,
        hist[s1],
        hist[s2],
        histRange,
        lookback,
        minSwingDistance
      );
    } else if (!priceUp && hist[s2] > hist[s1]) {
      // hidden bearish: 가격 lower high + histogram higher high (continuation 약세)
      detected = "hidden_bearish";
      strength = divergenceStrength(
        s1,
        s2,
        hist[s1],
        hist[s2],
        histRange,
        lookback,
        minSwingDistance
      );
    }
  }

  // ── Bullish divergence: 가격 신저가 + histogram 상승 (마지막 두 swing low)
  // bearish 가 이미 detected 되었더라도 더 강한 bullish 가 있으면 그것 우선.
  if (swingLowIdxs.length >= 2) {
    const [s1, s2] = swingLowIdxs.slice(-2);
    const priceDown = lows[s2] < lows[s1];
    const histUp = hist[s2] > hist[s1];
    if (priceDown && histUp) {
      const bullStrength = divergenceStrength(
        s1,
        s2,
        hist[s1],
        hist[s2],
        histRange,
        lookback,
        minSwingDistance
      );
      // bullish 가 기존 bearish 보다 더 강하거나, swing low 가 더 최근이면 우선시
      const bullishMoreRecent =
        swingLowIdxs[swingLowIdxs.length - 1] >
        (swingHighIdxs[swingHighIdxs.length - 1] ?? 0);
      if (detected === "none" || bullStrength > strength || bullishMoreRecent) {
        detected = "bullish";
        strength = bullStrength;
      }
    } else if (!priceDown && hist[s2] < hist[s1]) {
      // hidden bullish: 가격 higher low + histogram lower low (continuation 강세)
      if (detected === "none") {
        detected = "hidden_bullish";
        strength = divergenceStrength(
          s1,
          s2,
          hist[s1],
          hist[s2],
          histRange,
          lookback,
          minSwingDistance
        );
      }
    }
  }

  const multiplier = typeToMultiplier(detected, strength);

  return {
    multiplier,
    rawScore: Math.round(strength * 100),
    reason:
      detected === "none"
        ? "MACD divergence — none"
        : `MACD ${detected} divergence (strength ${strength.toFixed(2)})`,
    dimension: 1,
    status: "real",
    type: detected,
    strength,
    swings: {
      priceSwingHighIdxs: swingHighIdxs,
      priceSwingLowIdxs: swingLowIdxs,
      histAtSwings: [...swingHighIdxs, ...swingLowIdxs].map((i) => hist[i]),
    },
  };
}
