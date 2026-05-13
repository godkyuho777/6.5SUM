/**
 * EMA + ADX 정배열 추세 — 시그널 발행 로직.
 *
 * LONG / SHORT 양방향. lookahead-free (현 캔들 이전 데이터만 사용).
 * 기존 backtest strategies/trend.ts 의 룰을 기반으로 SHORT mirror + 가중치
 * 합성으로 final_confidence 산출.
 */

import { calculateEMA, calculateADX } from "../../indicators";
import { fetchKlines } from "../../bybit";
import type { Candle, TimeframeValue } from "../../shared/types";
import {
  ADX_MIN,
  ADX_STRONG,
  CONFIDENCE_WEIGHTS,
  DI_DIFF_MIN,
  DI_DIFF_STRONG,
  ENTRY_THRESHOLD,
  HHHL_LOOKBACK,
  SMA_PERIOD,
  SMA_SLOPE_MIN,
} from "./constants";

export type EmaAdxSide = "LONG" | "SHORT" | "NEUTRAL";

export interface EmaAdxBreakdown {
  /** 0~1 정배열 강도 (1 = 완전 정배열) */
  emaStack: number;
  /** 0~1 ADX 정규화 (20→0, 50+→1) */
  adx: number;
  /** 0~1 ±DI 차이 정규화 */
  diDiff: number;
  /** 0~1 SMA slope 정규화 */
  smaSlope: number;
  /** 0~1 HH/HL 구조 (boolean → 1/0) */
  structure: number;
}

export interface EmaAdxSignal {
  symbol: string;
  tf: TimeframeValue;
  side: EmaAdxSide;
  triggered: boolean;
  finalConfidence: number; // 0~100
  threshold: number;
  breakdown: EmaAdxBreakdown;
  reasons: string[];
  prices: {
    price: number;
    ema9: number;
    ema21: number;
    ema50: number;
    sma50: number;
    adx: number;
    plusDi: number;
    minusDi: number;
    /** target1, target2, stop (LONG/SHORT 적용된 값) */
    target1: number;
    target2: number;
    stopLoss: number;
    target1Pct: number;
    target2Pct: number;
    stopPct: number;
  };
  computedAt: number;
}

/** SMA(50) 기준 + slope. lookahead-free. */
function smaContext(candles: Candle[]): {
  sma: number;
  slope: number;
  priceAbove: boolean;
} {
  const n = candles.length;
  if (n < SMA_PERIOD + 1) {
    return { sma: 0, slope: 0, priceAbove: false };
  }
  const last = candles[n - 1];
  const recent = candles.slice(n - SMA_PERIOD);
  const sma = recent.reduce((s, c) => s + c.close, 0) / SMA_PERIOD;

  // 20 캔들 전 SMA
  const offset = 20;
  if (n < SMA_PERIOD + offset + 1) {
    return { sma, slope: 0, priceAbove: last.close > sma };
  }
  const prev = candles.slice(n - SMA_PERIOD - offset, n - offset);
  const smaPrev = prev.reduce((s, c) => s + c.close, 0) / SMA_PERIOD;
  const slope = smaPrev > 0 ? (sma - smaPrev) / smaPrev : 0;
  return { sma, slope, priceAbove: last.close > sma };
}

/** Williams 5-bar 단순화 — 직전 5캔들 vs 그 전 5캔들 HH/HL or LH/LL. */
function detectStructure(
  candles: Candle[],
  side: "LONG" | "SHORT",
): boolean {
  if (candles.length < HHHL_LOOKBACK) return false;
  const slice = candles.slice(-HHHL_LOOKBACK);
  const recent5 = slice.slice(-5);
  const prior5 = slice.slice(-10, -5);
  if (recent5.length < 5 || prior5.length < 5) return false;
  const recentHighAvg = recent5.reduce((s, c) => s + c.high, 0) / 5;
  const priorHighAvg = prior5.reduce((s, c) => s + c.high, 0) / 5;
  const recentLowAvg = recent5.reduce((s, c) => s + c.low, 0) / 5;
  const priorLowAvg = prior5.reduce((s, c) => s + c.low, 0) / 5;
  if (side === "LONG") {
    return recentHighAvg > priorHighAvg && recentLowAvg > priorLowAvg;
  }
  return recentHighAvg < priorHighAvg && recentLowAvg < priorLowAvg;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** LONG 시그널 평가 — 정배열 + ADX + +DI + SMA 상승 + HH/HL. */
function evaluateLong(candles: Candle[]): EmaAdxSignal | null {
  const n = candles.length;
  if (n < 60) return null;
  const closes = candles.map((c) => c.close);
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const ema50 = calculateEMA(closes, 50);
  const { adx, plusDi, minusDi } = calculateADX(candles);
  const sma = smaContext(candles);

  const reasons: string[] = [];

  const emaAligned = ema9 > ema21 && ema21 > ema50;
  if (emaAligned) reasons.push(`EMA 정배열 (9 ${ema9.toFixed(2)} > 21 ${ema21.toFixed(2)} > 50 ${ema50.toFixed(2)})`);
  const adxOk = adx >= ADX_MIN;
  if (adxOk) reasons.push(`ADX ${adx.toFixed(1)} ≥ ${ADX_MIN}`);
  const diOk = plusDi - minusDi > DI_DIFF_MIN;
  if (diOk) reasons.push(`+DI ${plusDi.toFixed(1)} > -DI ${minusDi.toFixed(1)}`);
  const smaOk = sma.priceAbove && sma.slope > SMA_SLOPE_MIN;
  if (smaOk) reasons.push(`SMA(50) 상승 +${(sma.slope * 100).toFixed(2)}% · 가격 > SMA`);
  const structureOk = detectStructure(candles, "LONG");
  if (structureOk) reasons.push(`HH/HL 구조 (10캔들)`);

  // 5 차원 모두 가중치 합성 — 게이트 통과한 것만 점수, 나머지 0
  const breakdown: EmaAdxBreakdown = {
    emaStack: emaAligned ? 1 : 0,
    adx: clamp01((adx - ADX_MIN) / (ADX_STRONG - ADX_MIN)),
    diDiff: clamp01((plusDi - minusDi) / DI_DIFF_STRONG),
    smaSlope: smaOk ? clamp01(sma.slope * 100) : 0,
    structure: structureOk ? 1 : 0,
  };

  const finalConfidence = Math.round(
    (breakdown.emaStack * CONFIDENCE_WEIGHTS.emaStack +
      breakdown.adx * CONFIDENCE_WEIGHTS.adx +
      breakdown.diDiff * CONFIDENCE_WEIGHTS.diDiff +
      breakdown.smaSlope * CONFIDENCE_WEIGHTS.smaSlope +
      breakdown.structure * CONFIDENCE_WEIGHTS.structure) *
      100,
  );

  // Hard gate 통과 — 정배열 + ADX + +DI 셋은 필수
  const triggered =
    emaAligned && adxOk && diOk && finalConfidence >= ENTRY_THRESHOLD;

  const last = candles[n - 1];
  const recent20 = candles.slice(-20);
  const recentHigh = Math.max(...recent20.map((c) => c.high));
  const target1 = Math.min(recentHigh * 1.005, last.close * 1.04);
  const target2 = Math.min(recentHigh * 1.03, last.close * 1.07);
  const stopLoss = Math.max(ema21 * 0.99, last.close * 0.97);

  return {
    symbol: "",
    tf: "4h" as TimeframeValue,
    side: "LONG",
    triggered,
    finalConfidence,
    threshold: ENTRY_THRESHOLD,
    breakdown,
    reasons,
    prices: {
      price: last.close,
      ema9, ema21, ema50, sma50: sma.sma, adx, plusDi, minusDi,
      target1, target2, stopLoss,
      target1Pct: ((target1 - last.close) / last.close) * 100,
      target2Pct: ((target2 - last.close) / last.close) * 100,
      stopPct: ((stopLoss - last.close) / last.close) * 100,
    },
    computedAt: Date.now(),
  };
}

/** SHORT 시그널 — LONG mirror (역배열 + -DI > +DI + SMA 하락 + LH/LL). */
function evaluateShort(candles: Candle[]): EmaAdxSignal | null {
  const n = candles.length;
  if (n < 60) return null;
  const closes = candles.map((c) => c.close);
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const ema50 = calculateEMA(closes, 50);
  const { adx, plusDi, minusDi } = calculateADX(candles);
  const sma = smaContext(candles);

  const reasons: string[] = [];
  const emaReversed = ema9 < ema21 && ema21 < ema50;
  if (emaReversed) reasons.push(`EMA 역배열 (9 ${ema9.toFixed(2)} < 21 ${ema21.toFixed(2)} < 50 ${ema50.toFixed(2)})`);
  const adxOk = adx >= ADX_MIN;
  if (adxOk) reasons.push(`ADX ${adx.toFixed(1)} ≥ ${ADX_MIN}`);
  const diOk = minusDi - plusDi > DI_DIFF_MIN;
  if (diOk) reasons.push(`-DI ${minusDi.toFixed(1)} > +DI ${plusDi.toFixed(1)}`);
  const smaOk = !sma.priceAbove && sma.slope < -SMA_SLOPE_MIN;
  if (smaOk) reasons.push(`SMA(50) 하락 ${(sma.slope * 100).toFixed(2)}% · 가격 < SMA`);
  const structureOk = detectStructure(candles, "SHORT");
  if (structureOk) reasons.push(`LH/LL 구조 (10캔들)`);

  const breakdown: EmaAdxBreakdown = {
    emaStack: emaReversed ? 1 : 0,
    adx: clamp01((adx - ADX_MIN) / (ADX_STRONG - ADX_MIN)),
    diDiff: clamp01((minusDi - plusDi) / DI_DIFF_STRONG),
    smaSlope: smaOk ? clamp01(-sma.slope * 100) : 0,
    structure: structureOk ? 1 : 0,
  };

  const finalConfidence = Math.round(
    (breakdown.emaStack * CONFIDENCE_WEIGHTS.emaStack +
      breakdown.adx * CONFIDENCE_WEIGHTS.adx +
      breakdown.diDiff * CONFIDENCE_WEIGHTS.diDiff +
      breakdown.smaSlope * CONFIDENCE_WEIGHTS.smaSlope +
      breakdown.structure * CONFIDENCE_WEIGHTS.structure) *
      100,
  );

  const triggered =
    emaReversed && adxOk && diOk && finalConfidence >= ENTRY_THRESHOLD;

  const last = candles[n - 1];
  const recent20 = candles.slice(-20);
  const recentLow = Math.min(...recent20.map((c) => c.low));
  const target1 = Math.max(recentLow * 0.995, last.close * 0.96);
  const target2 = Math.max(recentLow * 0.97, last.close * 0.93);
  const stopLoss = Math.min(ema21 * 1.01, last.close * 1.03);

  return {
    symbol: "",
    tf: "4h" as TimeframeValue,
    side: "SHORT",
    triggered,
    finalConfidence,
    threshold: ENTRY_THRESHOLD,
    breakdown,
    reasons,
    prices: {
      price: last.close,
      ema9, ema21, ema50, sma50: sma.sma, adx, plusDi, minusDi,
      target1, target2, stopLoss,
      target1Pct: ((target1 - last.close) / last.close) * 100,
      target2Pct: ((target2 - last.close) / last.close) * 100,
      stopPct: ((stopLoss - last.close) / last.close) * 100,
    },
    computedAt: Date.now(),
  };
}

/**
 * 단일 심볼 평가 — LONG 과 SHORT 둘 다 평가 후 더 강한 쪽 채택.
 * 둘 다 미발생 시 강도 큰 쪽을 NEUTRAL 로 반환.
 */
export async function evaluateEmaAdxSignal(
  symbol: string,
  tf: TimeframeValue,
  candlesOverride?: Candle[],
): Promise<EmaAdxSignal> {
  const candles =
    candlesOverride ?? (await fetchKlines(symbol, tf, 200));
  const long = evaluateLong(candles);
  const short = evaluateShort(candles);

  // 둘 중 점수가 높은 쪽 (또는 triggered) 반환
  let chosen: EmaAdxSignal | null = null;
  if (long?.triggered && short?.triggered) {
    chosen = long.finalConfidence >= short.finalConfidence ? long : short;
  } else if (long?.triggered) {
    chosen = long;
  } else if (short?.triggered) {
    chosen = short;
  } else if (long && short) {
    chosen = long.finalConfidence >= short.finalConfidence ? long : short;
    chosen = { ...chosen, side: "NEUTRAL" };
  } else if (long) {
    chosen = { ...long, side: "NEUTRAL" };
  } else if (short) {
    chosen = { ...short, side: "NEUTRAL" };
  }

  if (!chosen) {
    // 캔들 부족 fallback
    return {
      symbol,
      tf,
      side: "NEUTRAL",
      triggered: false,
      finalConfidence: 0,
      threshold: ENTRY_THRESHOLD,
      breakdown: { emaStack: 0, adx: 0, diDiff: 0, smaSlope: 0, structure: 0 },
      reasons: ["데이터 부족 (60 캔들 미만)"],
      prices: {
        price: 0, ema9: 0, ema21: 0, ema50: 0, sma50: 0,
        adx: 0, plusDi: 0, minusDi: 0,
        target1: 0, target2: 0, stopLoss: 0,
        target1Pct: 0, target2Pct: 0, stopPct: 0,
      },
      computedAt: Date.now(),
    };
  }
  return { ...chosen, symbol, tf };
}

/**
 * 다중 심볼 스캔 — 시그널 트래커 페이지의 코인 리스트 표시 용.
 */
export async function scanEmaAdxSignals(
  symbols: string[],
  tf: TimeframeValue,
): Promise<EmaAdxSignal[]> {
  const results = await Promise.allSettled(
    symbols.map((s) => evaluateEmaAdxSignal(s, tf)),
  );
  return results
    .filter((r): r is PromiseFulfilledResult<EmaAdxSignal> => r.status === "fulfilled")
    .map((r) => r.value);
}
