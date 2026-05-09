import type {
  BBStructure,
  BBStructureShort,
  Candle,
  CandlePatternMatch,
  CandlePatternName,
  EmaPosition,
  EntryDecision,
  ExitDecision,
  PressureLabel,
  PullbackQuality,
  ShortEntryDecision,
  TechnicalIndicators,
  VwapBands,
  VwapPosition,
  VwapSignal,
} from "@shared/types";
import type { VolumeProfile } from "./volume-profile";

import { detectPatternsAtIndex } from "./patterns";
import { decideExitForScanner } from "./exits";

/**
 * RSI (Relative Strength Index) 계산
 * @param closes - 종가 배열
 * @param period - 기간 (기본 14)
 */
export function calculateRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50; // 데이터 부족 시 중립값

  let gains = 0;
  let losses = 0;

  // 초기 평균 계산
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Wilder's Smoothing Method
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * 볼린저 밴드 계산
 * @param closes - 종가 배열
 * @param period - 기간 (기본 20)
 * @param stdDev - 표준편차 배수 (기본 2)
 */
export function calculateBollingerBands(
  closes: number[],
  period = 20,
  stdDev = 2
): { upper: number; middle: number; lower: number } {
  if (closes.length < period) {
    const last = closes[closes.length - 1] || 0;
    return { upper: last, middle: last, lower: last };
  }

  const slice = closes.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;

  const variance = slice.reduce((sum, val) => sum + Math.pow(val - middle, 2), 0) / period;
  const sd = Math.sqrt(variance);

  return {
    upper: middle + stdDev * sd,
    middle,
    lower: middle - stdDev * sd,
  };
}

/**
 * True Range 계산
 */
function trueRange(high: number, low: number, prevClose: number): number {
  return Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
}

/**
 * ADX (Average Directional Index) 계산
 * +DI, -DI 포함
 * @param candles - 캔들 데이터 배열
 * @param period - 기간 (기본 14)
 */
export function calculateADX(
  candles: Candle[],
  period = 14
): { adx: number; plusDi: number; minusDi: number } {
  if (candles.length < period * 2 + 1) {
    return { adx: 0, plusDi: 0, minusDi: 0 };
  }

  const trArr: number[] = [];
  const plusDmArr: number[] = [];
  const minusDmArr: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i];
    const prev = candles[i - 1];

    trArr.push(trueRange(curr.high, curr.low, prev.close));

    const upMove = curr.high - prev.high;
    const downMove = prev.low - curr.low;

    plusDmArr.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDmArr.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  // Wilder's smoothing for initial values
  let smoothTR = trArr.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothPlusDM = plusDmArr.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothMinusDM = minusDmArr.slice(0, period).reduce((a, b) => a + b, 0);

  const dxArr: number[] = [];

  // 초기 DI 계산
  let plusDi = (smoothPlusDM / smoothTR) * 100;
  let minusDi = (smoothMinusDM / smoothTR) * 100;
  let diSum = plusDi + minusDi;
  if (diSum > 0) {
    dxArr.push((Math.abs(plusDi - minusDi) / diSum) * 100);
  }

  // 나머지 기간 계산
  for (let i = period; i < trArr.length; i++) {
    smoothTR = smoothTR - smoothTR / period + trArr[i];
    smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDmArr[i];
    smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDmArr[i];

    plusDi = smoothTR > 0 ? (smoothPlusDM / smoothTR) * 100 : 0;
    minusDi = smoothTR > 0 ? (smoothMinusDM / smoothTR) * 100 : 0;
    diSum = plusDi + minusDi;

    if (diSum > 0) {
      dxArr.push((Math.abs(plusDi - minusDi) / diSum) * 100);
    }
  }

  // ADX = DX의 이동평균
  let adx = 0;
  if (dxArr.length >= period) {
    adx = dxArr.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < dxArr.length; i++) {
      adx = (adx * (period - 1) + dxArr[i]) / period;
    }
  } else if (dxArr.length > 0) {
    adx = dxArr.reduce((a, b) => a + b, 0) / dxArr.length;
  }

  return {
    adx: Math.round(adx * 100) / 100,
    plusDi: Math.round(plusDi * 100) / 100,
    minusDi: Math.round(minusDi * 100) / 100,
  };
}

/**
 * 모든 기술 지표를 한번에 계산
 */
export function calculateAllIndicators(candles: Candle[]): TechnicalIndicators {
  const closes = candles.map((c) => c.close);
  const rsi = calculateRSI(closes);
  const bb = calculateBollingerBands(closes);
  const { adx, plusDi, minusDi } = calculateADX(candles);

  // 피보나치 계산 (최근 100개 캔들 기준 고점/저점)
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const maxHigh = Math.max(...highs);
  const minLow = Math.min(...lows);
  const fibLevels = calculateFibonacciLevels(maxHigh, minLow, 'up');

  // 빗각 계산
  const trendlines = calculateTrendlines(candles);

  // VWAP / EMA(9) — Parker Brooks scanner inputs
  const vwap = calculateVWAP(candles);
  const ema9 = calculateEMA(closes, 9);

  return {
    rsi: Math.round(rsi * 100) / 100,
    bbUpper: bb.upper,
    bbMiddle: bb.middle,
    bbLower: bb.lower,
    vwap: Math.round(vwap * 10000) / 10000,
    ema9: Math.round(ema9 * 10000) / 10000,
    adx,
    plusDi,
    minusDi,
    fibLevels,
    trendlines
  };
}

/**
 * 매수 진입 시그널 판단
 * 조건: RSI 30~35, 가격이 BB 하단선 근처, ADX 30 이하
 */
export function isEntrySignal(
  price: number,
  indicators: TechnicalIndicators,
  config = { rsiLow: 30, rsiHigh: 35, adxThreshold: 30, bbTolerance: 0.02 }
): boolean {
  const rsiInRange = indicators.rsi >= config.rsiLow && indicators.rsi <= config.rsiHigh;
  const nearBbLower = price <= indicators.bbLower * (1 + config.bbTolerance);
  const adxLow = indicators.adx <= config.adxThreshold;

  return rsiInRange && nearBbLower && adxLow;
}

/**
 * 목표가 도달(청산) 시그널 판단
 * 조건: BB 기준선 도달 OR RSI 70+ OR ADX 30+ OR +DI 30+
 */
export function isExitSignal(
  price: number,
  indicators: TechnicalIndicators,
  config = { targetRsi: 70, targetAdx: 30, targetPlusDi: 30 }
): boolean {
  const reachedBbMiddle = price >= indicators.bbMiddle;
  const rsiHigh = indicators.rsi >= config.targetRsi;
  const adxHigh = indicators.adx >= config.targetAdx;
  const plusDiHigh = indicators.plusDi >= config.targetPlusDi;

  return reachedBbMiddle || rsiHigh || adxHigh || plusDiHigh;
}

/**
 * 시그널 강도 계산 (0-100)
 * 여러 조건이 동시에 충족될수록 높은 점수
 */
/**
 * RSI 시계열 계산 (차트용)
 * 각 캔들 시점의 RSI 값을 배열로 반환
 */
export function calculateRSISeries(closes: number[], period = 14): number[] {
  const result: number[] = [];
  if (closes.length < period + 1) {
    return closes.map(() => 50);
  }

  // Fill initial values with 50
  for (let i = 0; i < period; i++) {
    result.push(50);
  }

  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }

  return result;
}

/**
 * ADX 시계열 계산 (차트용)
 * 각 캔들 시점의 ADX, +DI, -DI 값을 배열로 반환
 */
export function calculateADXSeries(
  candles: Candle[],
  period = 14
): { adx: number; plusDi: number; minusDi: number }[] {
  const result: { adx: number; plusDi: number; minusDi: number }[] = [];
  if (candles.length < period * 2 + 1) {
    return candles.map(() => ({ adx: 0, plusDi: 0, minusDi: 0 }));
  }

  const trArr: number[] = [];
  const plusDmArr: number[] = [];
  const minusDmArr: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i];
    const prev = candles[i - 1];
    trArr.push(trueRange(curr.high, curr.low, prev.close));
    const upMove = curr.high - prev.high;
    const downMove = prev.low - curr.low;
    plusDmArr.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDmArr.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  // Fill initial period with zeros
  for (let i = 0; i <= period; i++) {
    result.push({ adx: 0, plusDi: 0, minusDi: 0 });
  }

  let smoothTR = trArr.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothPlusDM = plusDmArr.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothMinusDM = minusDmArr.slice(0, period).reduce((a, b) => a + b, 0);

  const dxArr: number[] = [];
  let plusDi = (smoothPlusDM / smoothTR) * 100;
  let minusDi = (smoothMinusDM / smoothTR) * 100;
  let diSum = plusDi + minusDi;
  if (diSum > 0) dxArr.push((Math.abs(plusDi - minusDi) / diSum) * 100);

  result.push({ adx: dxArr[0] ?? 0, plusDi: Math.round(plusDi * 100) / 100, minusDi: Math.round(minusDi * 100) / 100 });

  for (let i = period; i < trArr.length; i++) {
    smoothTR = smoothTR - smoothTR / period + trArr[i];
    smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDmArr[i];
    smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDmArr[i];
    plusDi = smoothTR > 0 ? (smoothPlusDM / smoothTR) * 100 : 0;
    minusDi = smoothTR > 0 ? (smoothMinusDM / smoothTR) * 100 : 0;
    diSum = plusDi + minusDi;
    if (diSum > 0) dxArr.push((Math.abs(plusDi - minusDi) / diSum) * 100);

    let adx = 0;
    if (dxArr.length >= period) {
      adx = dxArr.slice(0, period).reduce((a, b) => a + b, 0) / period;
      for (let j = period; j < dxArr.length; j++) {
        adx = (adx * (period - 1) + dxArr[j]) / period;
      }
    } else if (dxArr.length > 0) {
      adx = dxArr.reduce((a, b) => a + b, 0) / dxArr.length;
    }

    result.push({
      adx: Math.round(adx * 100) / 100,
      plusDi: Math.round(plusDi * 100) / 100,
      minusDi: Math.round(minusDi * 100) / 100,
    });
  }

  return result;
}

export function calculateSignalStrength(
  price: number,
  indicators: TechnicalIndicators
): number {
  let score = 0;

  // RSI 점수 (30~35 범위에서 30에 가까울수록 높음)
  if (indicators.rsi >= 25 && indicators.rsi <= 40) {
    if (indicators.rsi <= 30) score += 35;
    else if (indicators.rsi <= 35) score += 25;
    else score += 10;
  }

  // BB 하단선 근접도 (가격이 하단선 아래일수록 높음)
  if (price <= indicators.bbLower) {
    score += 35;
  } else if (price <= indicators.bbLower * 1.02) {
    score += 25;
  } else if (price <= indicators.bbLower * 1.05) {
    score += 10;
  }

  // ADX 점수 (낮을수록 레인지 마켓 = 반등 가능성)
  if (indicators.adx <= 20) score += 30;
  else if (indicators.adx <= 25) score += 20;
  else if (indicators.adx <= 30) score += 15;

  return Math.min(100, score);
}

/**
 * 피보나치 되돌림 레벨 계산
 * @param high - 기간 내 최고가
 * @param low - 기간 내 최저가
 * @param trend - 'up' (상승 후 되돌림) | 'down' (하락 후 되돌림)
 */
export function calculateFibonacciLevels(high: number, low: number, trend: 'up' | 'down' = 'up') {
  const diff = high - low;
  const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  
  return levels.map(level => {
    const price = trend === 'up' ? high - (diff * level) : low + (diff * level);
    return {
      level,
      price: Math.round(price * 10000) / 10000,
      isGoldenZone: level === 0.382 || level === 0.618
    };
  });
}

/**
 * 황금비 존(±0.5% 오차범위) 진입 여부 확인
 */
export function isInFibZone(price: number, fibPrice: number, tolerance = 0.005): boolean {
  const upper = fibPrice * (1 + tolerance);
  const lower = fibPrice * (1 - tolerance);
  return price >= lower && price <= upper;
}

/**
 * 단순 추세 빗각 계산 (간이 구현)
 * 최근 저점들을 연결하거나 고점들을 연결
 */
export function calculateTrendlines(candles: Candle[]) {
  if (candles.length < 20) return [];

  // 최근 50개 캔들 기준
  const lookback = candles.slice(-50);
  
  // 저점들 (Support)
  const lows = lookback
    .map((c, i) => ({ price: c.low, index: i, time: c.openTime }))
    .sort((a, b) => a.price - b.price)
    .slice(0, 5);
  
  // 고점들 (Resistance)
  const highs = lookback
    .map((c, i) => ({ price: c.high, index: i, time: c.openTime }))
    .sort((a, b) => b.price - a.price)
    .slice(0, 5);

  const trendlines = [];

  if (lows.length >= 2) {
    const p1 = lows[0];
    const p2 = lows[1];
    trendlines.push({
      type: "support" as const,
      points: [
        { time: p1.time, price: p1.price },
        { time: p2.time, price: p2.price }
      ],
      isActive: true
    });
  }

  if (highs.length >= 2) {
    const p1 = highs[0];
    const p2 = highs[1];
    trendlines.push({
      type: "resistance" as const,
      points: [
        { time: p1.time, price: p1.price },
        { time: p2.time, price: p2.price }
      ],
      isActive: true
    });
  }

  return trendlines;
}

// ─── BBDX-PATTERN v6.1 ──────────────────────────────────────────────────────

/**
 * Bollinger Bands 시계열 (각 캔들 시점의 BB)
 * 패턴 인식 및 BB 구조 감지에 사용.
 */
export function calculateBollingerBandsSeries(
  closes: number[],
  period = 20,
  stdDev = 2
): { upper: number; middle: number; lower: number }[] {
  const out: { upper: number; middle: number; lower: number }[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i + 1 < period) {
      const v = closes[i];
      out.push({ upper: v, middle: v, lower: v });
      continue;
    }
    out.push(calculateBollingerBands(closes.slice(0, i + 1), period, stdDev));
  }
  return out;
}

// ── 캔들 패턴 helpers ──────────────────────────────────────────────────────

const PATTERN_STRENGTH: Record<CandlePatternName, number> = {
  engulfing: 100,
  morningStar: 90,
  hammer: 75,
  invertedHammer: 75,
  pinBar: 70,
  doji: 60,
  threeWhiteSoldiers: 85,
  bearishEngulfing: 100,
  eveningStar: 90,
  threeBlackCrows: 85,
};

const isBull = (c: Candle) => c.close > c.open;
const isBear = (c: Candle) => c.close < c.open;
const bodySize = (c: Candle) => Math.abs(c.close - c.open);
const upperWick = (c: Candle) => c.high - Math.max(c.open, c.close);
const lowerWick = (c: Candle) => Math.min(c.open, c.close) - c.low;
const range = (c: Candle) => c.high - c.low;

function patternMatch(
  name: CandlePatternName,
  bias: "bullish" | "bearish",
  candlesAgo: number
): CandlePatternMatch {
  return { name, bias, candlesAgo, strength: PATTERN_STRENGTH[name] };
}

function detectHammerAt(
  candles: Candle[],
  idx: number
): CandlePatternMatch | null {
  const c = candles[idx];
  if (!c || range(c) === 0) return null;
  const body = bodySize(c);
  const lower = lowerWick(c);
  const upper = upperWick(c);
  // Long lower wick (≥2× body), small upper wick, small body
  if (
    lower >= body * 2 &&
    upper <= body * 0.5 &&
    body / range(c) <= 0.4 &&
    isBull(c)
  ) {
    return patternMatch("hammer", "bullish", candles.length - 1 - idx);
  }
  return null;
}

function detectInvertedHammerAt(
  candles: Candle[],
  idx: number
): CandlePatternMatch | null {
  const c = candles[idx];
  if (!c || range(c) === 0) return null;
  const body = bodySize(c);
  const lower = lowerWick(c);
  const upper = upperWick(c);
  if (
    upper >= body * 2 &&
    lower <= body * 0.5 &&
    body / range(c) <= 0.4 &&
    isBull(c)
  ) {
    return patternMatch("invertedHammer", "bullish", candles.length - 1 - idx);
  }
  return null;
}

function detectPinBarAt(
  candles: Candle[],
  idx: number
): CandlePatternMatch | null {
  const c = candles[idx];
  if (!c || range(c) === 0) return null;
  const body = bodySize(c);
  const lower = lowerWick(c);
  const upper = upperWick(c);
  // Bullish pin: long lower wick, body in upper portion
  const bullishPin =
    lower >= range(c) * 0.6 &&
    upper <= range(c) * 0.2 &&
    isBull(c);
  if (bullishPin && body / range(c) <= 0.3) {
    return patternMatch("pinBar", "bullish", candles.length - 1 - idx);
  }
  return null;
}

function detectDojiAt(
  candles: Candle[],
  idx: number
): CandlePatternMatch | null {
  const c = candles[idx];
  if (!c || range(c) === 0) return null;
  const body = bodySize(c);
  if (body / range(c) <= 0.1) {
    return patternMatch("doji", "bullish", candles.length - 1 - idx);
  }
  return null;
}

function detectEngulfingAt(
  candles: Candle[],
  idx: number,
  dir: "bullish" | "bearish"
): CandlePatternMatch | null {
  if (idx < 1) return null;
  const prev = candles[idx - 1];
  const c = candles[idx];
  if (!c || !prev) return null;
  if (dir === "bullish") {
    if (
      isBear(prev) &&
      isBull(c) &&
      c.open <= prev.close &&
      c.close >= prev.open &&
      bodySize(c) > bodySize(prev)
    ) {
      return patternMatch("engulfing", "bullish", candles.length - 1 - idx);
    }
    return null;
  }
  if (
    isBull(prev) &&
    isBear(c) &&
    c.open >= prev.close &&
    c.close <= prev.open &&
    bodySize(c) > bodySize(prev)
  ) {
    return patternMatch("bearishEngulfing", "bearish", candles.length - 1 - idx);
  }
  return null;
}

function detectMorningStarAt(
  candles: Candle[],
  idx: number
): CandlePatternMatch | null {
  if (idx < 2) return null;
  const c1 = candles[idx - 2];
  const c2 = candles[idx - 1];
  const c3 = candles[idx];
  if (!c1 || !c2 || !c3) return null;
  // c1 bear, c2 small body (star), c3 bull closing past c1's midpoint
  const c1Bear = isBear(c1);
  const c2Small = bodySize(c2) <= bodySize(c1) * 0.5;
  const c3Bull = isBull(c3);
  const c1Mid = (c1.open + c1.close) / 2;
  const c3PastMid = c3.close > c1Mid;
  if (c1Bear && c2Small && c3Bull && c3PastMid) {
    return patternMatch("morningStar", "bullish", candles.length - 1 - idx);
  }
  return null;
}

function detectEveningStarAt(
  candles: Candle[],
  idx: number
): CandlePatternMatch | null {
  if (idx < 2) return null;
  const c1 = candles[idx - 2];
  const c2 = candles[idx - 1];
  const c3 = candles[idx];
  if (!c1 || !c2 || !c3) return null;
  const c1Bull = isBull(c1);
  const c2Small = bodySize(c2) <= bodySize(c1) * 0.5;
  const c3Bear = isBear(c3);
  const c1Mid = (c1.open + c1.close) / 2;
  const c3PastMid = c3.close < c1Mid;
  if (c1Bull && c2Small && c3Bear && c3PastMid) {
    return patternMatch("eveningStar", "bearish", candles.length - 1 - idx);
  }
  return null;
}

function detectThreeWhiteSoldiersAt(
  candles: Candle[],
  idx: number
): CandlePatternMatch | null {
  if (idx < 2) return null;
  const c1 = candles[idx - 2];
  const c2 = candles[idx - 1];
  const c3 = candles[idx];
  if (
    isBull(c1) &&
    isBull(c2) &&
    isBull(c3) &&
    c2.close > c1.close &&
    c3.close > c2.close &&
    c2.open >= c1.open &&
    c2.open <= c1.close &&
    c3.open >= c2.open &&
    c3.open <= c2.close
  ) {
    return patternMatch(
      "threeWhiteSoldiers",
      "bullish",
      candles.length - 1 - idx
    );
  }
  return null;
}

function detectThreeBlackCrowsAt(
  candles: Candle[],
  idx: number
): CandlePatternMatch | null {
  if (idx < 2) return null;
  const c1 = candles[idx - 2];
  const c2 = candles[idx - 1];
  const c3 = candles[idx];
  if (
    isBear(c1) &&
    isBear(c2) &&
    isBear(c3) &&
    c2.close < c1.close &&
    c3.close < c2.close &&
    c2.open <= c1.open &&
    c2.open >= c1.close &&
    c3.open <= c2.open &&
    c3.open >= c2.close
  ) {
    return patternMatch("threeBlackCrows", "bearish", candles.length - 1 - idx);
  }
  return null;
}

/**
 * 단일 캔들 인덱스에서 감지된 모든 패턴을 반환.
 *
 * PATTERN_SYSTEM_AUDIT.md 결함 #4 (중복 제거 임의) 해결:
 *   - 이전: 우선순위 if/else if 체인 → 첫 매치만 유지, 나머지 정보 손실
 *   - 현재: 모든 매치를 push → confluence 정보 보존
 *
 * 합산은 `src/patterns/aggregator.ts` 의 `aggregatePatternScore` 가
 * max + bonus 모델로 수행하므로 여기서는 dedup 하지 않는다.
 *
 * 강세/약세 패턴은 동시에 감지될 수 있다 (예: 같은 캔들이 강세 인걸핑이면서
 * 직전 3캔들 컨텍스트로는 이브닝스타가 형성될 가능성은 없지만,
 * 일반적으로 강세/약세는 mutual exclusive). 그래도 alleged 매치는 모두 기록.
 */
function detectAtIndex(candles: Candle[], idx: number): CandlePatternMatch[] {
  const out: CandlePatternMatch[] = [];

  // 강세 패턴 — 모두 기록 (이전 우선순위 dedup 제거)
  const bullEng = detectEngulfingAt(candles, idx, "bullish");
  if (bullEng) out.push(bullEng);

  const morningStar = detectMorningStarAt(candles, idx);
  if (morningStar) out.push(morningStar);

  const tws = detectThreeWhiteSoldiersAt(candles, idx);
  if (tws) out.push(tws);

  const hammer = detectHammerAt(candles, idx);
  if (hammer) out.push(hammer);

  const inv = detectInvertedHammerAt(candles, idx);
  if (inv) out.push(inv);

  const pin = detectPinBarAt(candles, idx);
  if (pin) out.push(pin);

  const doji = detectDojiAt(candles, idx);
  if (doji) out.push(doji);

  // 약세 패턴 — 모두 기록
  const bearEng = detectEngulfingAt(candles, idx, "bearish");
  if (bearEng) out.push(bearEng);

  const eveningStar = detectEveningStarAt(candles, idx);
  if (eveningStar) out.push(eveningStar);

  const tbc = detectThreeBlackCrowsAt(candles, idx);
  if (tbc) out.push(tbc);

  return out;
}

/**
 * 최근 5개 캔들 윈도우 내에서 감지된 모든 패턴을 반환.
 * candlesAgo 0~4 범위의 패턴만 포함.
 *
 * Per Pattern Audit (Part III.1 §5.3 / §5.4) defects #3 and #4:
 *   - look-ahead safe: predicates only read candles[j ≤ currentIdx]
 *   - no priority dedup; aggregator uses max + bonus instead so
 *     multi-pattern confluence is preserved.
 *
 * Delegates to the modular implementation in `./patterns/`. Strength
 * values are now produced from `patternBase × volumeMultiplier ×
 * priorTrendMultiplier × 100`, replacing the previous intuited
 * `PATTERN_STRENGTH` table (still kept above as a legacy reference for
 * `detectAtIndex`, which is no longer used).
 */
export function detectAllCandlePatterns(
  candles: Candle[]
): CandlePatternMatch[] {
  if (candles.length < 1) return [];
  return detectPatternsAtIndex(candles, candles.length - 1, 5);
}

// ── BB 구조 패턴 ───────────────────────────────────────────────────────────

/** 평균 밴드 폭 (현재 BB 기준 비교용) */
function averageBandWidth(
  bbSeries: { upper: number; middle: number; lower: number }[],
  lookback = 20
): number {
  const recent = bbSeries.slice(-lookback);
  let sum = 0;
  let count = 0;
  for (const bb of recent) {
    if (bb.middle > 0) {
      sum += ((bb.upper - bb.lower) / bb.middle) * 100;
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

function bandWidth(bb: { upper: number; middle: number; lower: number }): number {
  if (bb.middle <= 0) return 0;
  return ((bb.upper - bb.lower) / bb.middle) * 100;
}

/**
 * BB 구조 패턴 감지 (4가지 중 우선순위로 1개 반환).
 * 우선순위: lowerBounce > squeezeBreakout > middleSupport > upperRiding
 */
export function detectBBStructure(
  candles: Candle[],
  bbSeries: { upper: number; middle: number; lower: number }[]
): BBStructure | null {
  if (candles.length < 5 || bbSeries.length < 5) return null;

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const lastBB = bbSeries[bbSeries.length - 1];
  const prevBB = bbSeries[bbSeries.length - 2];

  // ── Lower Bounce ──
  // 직전 저가가 BB하단 × 0.98 이하, 현재 캔들 반전 + 종가 > 직전 종가
  const prevTouchedLower = prev.low <= prevBB.lower * 0.98;
  const reversalCandle =
    isBull(last) &&
    (lowerWick(last) >= bodySize(last) * 1.5 ||
      (last.open <= prev.close && last.close >= prev.open && bodySize(last) > bodySize(prev)));
  if (prevTouchedLower && reversalCandle && last.close > prev.close) {
    return "lowerBounce";
  }

  // ── Squeeze Breakout ──
  const avgBW = averageBandWidth(bbSeries.slice(0, -1));
  const recentBWs = bbSeries.slice(-6, -1).map(bandWidth);
  const wasSqueezed = recentBWs.some((bw) => avgBW > 0 && bw < avgBW * 0.6);
  const nowExpanded = avgBW > 0 && bandWidth(lastBB) > avgBW * 0.8;
  if (wasSqueezed && nowExpanded && isBull(last) && last.close > lastBB.middle) {
    return "squeezeBreakout";
  }

  // ── Middle Support ──
  // 최근 5캔들 중 3개 이상이 BB중간선 ±1% 터치, 종가 > 중간선
  let middleTouches = 0;
  for (let i = candles.length - 5; i < candles.length; i++) {
    const c = candles[i];
    const bb = bbSeries[i];
    if (!c || !bb) continue;
    const lo = bb.middle * 0.99;
    const hi = bb.middle * 1.01;
    if (c.low <= hi && c.low >= lo) middleTouches++;
  }
  if (middleTouches >= 3 && last.close > lastBB.middle) {
    return "middleSupport";
  }

  // ── Upper Riding ──
  // 연속 3개 캔들이 BB상단 상위 20% + 종가 > 중간선 + 모두 상승 방향
  if (candles.length >= 3) {
    const ridingCandles = candles.slice(-3);
    const ridingBBs = bbSeries.slice(-3);
    let allRiding = true;
    for (let i = 0; i < 3; i++) {
      const c = ridingCandles[i];
      const bb = ridingBBs[i];
      const upper20 = bb.upper - (bb.upper - bb.middle) * 0.2;
      if (!(c.close > upper20 && c.close > bb.middle && isBull(c))) {
        allRiding = false;
        break;
      }
    }
    if (allRiding && bandWidth(lastBB) > avgBW * 0.7) {
      return "upperRiding";
    }
  }

  return null;
}

// ── 압력 / 역추세 / 거래량 / Falling Knife ────────────────────────────────

export function pressureLabel(plusDi: number, minusDi: number): PressureLabel {
  // Treat near-equal +DI/-DI as neutral
  if (Math.abs(plusDi - minusDi) < 2) return "NEUTRAL";
  if (plusDi > minusDi) {
    return plusDi > 25 ? "BULL_PRESSURE" : "WEAK_BULL";
  }
  return minusDi > 25 ? "BEAR_PRESSURE" : "WEAK_BEAR";
}

export function reversalProbability(adx: number): number {
  return Math.max(0, Math.min(100, 100 - adx * 2.5));
}

export function volumeRatio(candles: Candle[]): number {
  if (candles.length < 100) {
    if (candles.length === 0) return 1;
    const avg = candles.reduce((a, c) => a + c.volume, 0) / candles.length;
    if (avg <= 0) return 1;
    const recent = candles.slice(-Math.min(5, candles.length));
    const recentAvg = recent.reduce((a, c) => a + c.volume, 0) / recent.length;
    return recentAvg / avg;
  }
  const totalAvg =
    candles.reduce((a, c) => a + c.volume, 0) / candles.length;
  if (totalAvg <= 0) return 1;
  const recent = candles.slice(-5);
  const recentAvg = recent.reduce((a, c) => a + c.volume, 0) / recent.length;
  return recentAvg / totalAvg;
}

export function volumeConfirmationFromRatio(ratio: number): number {
  if (ratio > 1.2) {
    // (ratio - 0.8) / 0.4 × 15, clamped to 0..15
    return Math.max(0, Math.min(15, ((ratio - 0.8) / 0.4) * 15));
  }
  if (ratio < 0.8) return -5;
  return 0;
}

export function isFallingKnife(
  plusDi: number,
  minusDi: number,
  adx: number
): boolean {
  return minusDi > plusDi && adx > 25;
}

/**
 * Rising Knife — `isFallingKnife` 의 SHORT 미러.
 *   +DI > -DI AND ADX > 25 → SHORT 진입 차단 (강한 상승 추세).
 *
 * 의미: 가격이 강한 상승 추세 중일 때 SHORT 진입은 *역추세* 위험.
 * 자본 보호 헌장에 따라 SHORT 평균회귀 path (upperRejection, middleResistance,
 * squeezeBreakdown) 진입을 차단. lowerRiding (추세 추종 SHORT) 만 예외 허용.
 */
export function isRisingKnife(
  plusDi: number,
  minusDi: number,
  adx: number
): boolean {
  return plusDi > minusDi && adx > 25;
}

// ── SHORT BB 구조 (4가지 미러) ─────────────────────────────────────────────

/**
 * SHORT 진입 BB 구조 패턴. LONG `detectBBStructure` 의 4가지 미러:
 *   upperRejection    — 직전 고가 ≥ BB상단×1.02 + 반전 음봉 + 종가 < 직전 종가
 *                       (LONG 의 lowerBounce 미러)
 *   squeezeBreakdown  — BW 압축 후 음봉 + 종가 < 중간선
 *                       (LONG 의 squeezeBreakout 미러)
 *   middleResistance  — 5중 3 캔들이 중간선 ±1% 터치 + 종가 < 중간선
 *                       (LONG 의 middleSupport 미러)
 *   lowerRiding       — 연속 3 캔들이 BB 하단 ± 하위 20% + 모두 음봉 + 종가 < 중간선
 *                       (LONG 의 upperRiding 미러, 추세 추종 SHORT)
 *
 * 헌장 규칙 3 준수: 단독 시그널 X. BBDX SHORT path 의 *위치 + 거동 + 변동성*
 * 3차원 confluence 만 발견.
 */
export function detectBBStructureShort(
  candles: Candle[],
  bbSeries: { upper: number; middle: number; lower: number }[]
): BBStructureShort | null {
  if (candles.length < 5 || bbSeries.length < 5) return null;

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const lastBB = bbSeries[bbSeries.length - 1];
  const prevBB = bbSeries[bbSeries.length - 2];

  // ── Upper Rejection ──
  // 직전 고가 ≥ BB상단×1.02 + 현재 음봉 + 반전 (긴 위 꼬리 또는 약세 엔글핑)
  const prevTouchedUpper = prev.high >= prevBB.upper * 1.02;
  const reversalCandle =
    isBear(last) &&
    (upperWick(last) >= bodySize(last) * 1.5 ||
      (last.open >= prev.close && last.close <= prev.open && bodySize(last) > bodySize(prev)));
  if (prevTouchedUpper && reversalCandle && last.close < prev.close) {
    return "upperRejection";
  }

  // ── Squeeze Breakdown ──
  const avgBW = averageBandWidth(bbSeries.slice(0, -1));
  const recentBWs = bbSeries.slice(-6, -1).map(bandWidth);
  const wasSqueezed = recentBWs.some((bw) => avgBW > 0 && bw < avgBW * 0.6);
  const nowExpanded = avgBW > 0 && bandWidth(lastBB) > avgBW * 0.8;
  if (wasSqueezed && nowExpanded && isBear(last) && last.close < lastBB.middle) {
    return "squeezeBreakdown";
  }

  // ── Middle Resistance ──
  // 최근 5캔들 중 3개 이상이 BB중간선 ±1% 터치 (위에서), 종가 < 중간선
  let middleTouches = 0;
  for (let i = candles.length - 5; i < candles.length; i++) {
    const c = candles[i];
    const bb = bbSeries[i];
    if (!c || !bb) continue;
    const lo = bb.middle * 0.99;
    const hi = bb.middle * 1.01;
    if (c.high >= lo && c.high <= hi) middleTouches++;
  }
  if (middleTouches >= 3 && last.close < lastBB.middle) {
    return "middleResistance";
  }

  // ── Lower Riding ──
  // 연속 3개 캔들이 BB하단 하위 20% + 종가 < 중간선 + 모두 음봉
  if (candles.length >= 3) {
    const ridingCandles = candles.slice(-3);
    const ridingBBs = bbSeries.slice(-3);
    let allRiding = true;
    for (let i = 0; i < 3; i++) {
      const c = ridingCandles[i];
      const bb = ridingBBs[i];
      const lower20 = bb.lower + (bb.middle - bb.lower) * 0.2;
      if (!(c.close < lower20 && c.close < bb.middle && isBear(c))) {
        allRiding = false;
        break;
      }
    }
    if (allRiding && bandWidth(lastBB) > avgBW * 0.7) {
      return "lowerRiding";
    }
  }

  return null;
}

// ── SHORT 진입 결정 (3가지 경로 미러) ──────────────────────────────────────

const SHORT_NUM_RSI_LOW = 62;
const SHORT_NUM_RSI_HIGH = 75;
const SHORT_NUM_BB_TOLERANCE = 0.02;
const SHORT_NUM_ADX_MAX = 20;
const SHORT_PTN_BB_TOLERANCE = 0.05;
const SHORT_PTN_ADX_MAX = 25;

/**
 * SHORT 진입 결정. LONG `decideEntry` 의 미러.
 *
 *   BB path  — `detectBBStructureShort` 결과 (4가지 SHORT 구조)
 *   PTN path — bearish 패턴 + 가격 ≥ BB상단×0.95 + ADX < 25
 *   NUM path — RSI 62~75 + 가격 ≥ BB상단×0.98 + ADX < 20
 *
 * Rising Knife (강한 상승 추세) 시 호출 측에서 미리 차단해야 함 (lowerRiding 외).
 *
 * 헌장 규칙 3 준수: SHORT 도 BBDX 차원 안. 단독 시그널 X.
 * decideEntry 와 동일한 우선순위 (BB > PTN > NUM).
 */
export function decideShortEntry(
  candles: Candle[],
  ind: TechnicalIndicators,
  patterns: CandlePatternMatch[],
  bbStructureShort: BBStructureShort | null,
  _volRatio: number
): ShortEntryDecision | null {
  if (candles.length === 0) return null;
  const last = candles[candles.length - 1];
  const price = last.close;

  // ── BB 경로 ──
  if (bbStructureShort != null) {
    return {
      path: "BB",
      reasons: [`SHORT BB 구조: ${bbStructureShort}`],
      bbStructure: bbStructureShort,
    };
  }

  // ── PTN 경로 ──
  const bearishPatterns = patterns.filter((p) => p.bias === "bearish");
  if (bearishPatterns.length > 0) {
    const nearUpper = price >= ind.bbUpper * (1 - SHORT_PTN_BB_TOLERANCE);
    const adxOk = ind.adx < SHORT_PTN_ADX_MAX;
    if (nearUpper && adxOk) {
      return {
        path: "PTN",
        reasons: [
          `${bearishPatterns.length}개 약세 패턴 감지`,
          `현재가 ≥ BB상단 × ${1 - SHORT_PTN_BB_TOLERANCE}`,
          `ADX ${ind.adx.toFixed(1)} < ${SHORT_PTN_ADX_MAX}`,
        ],
        patterns: bearishPatterns,
      };
    }
  }

  // ── NUM 경로 ──
  const rsiOk = ind.rsi >= SHORT_NUM_RSI_LOW && ind.rsi <= SHORT_NUM_RSI_HIGH;
  const nearUpper = price >= ind.bbUpper * (1 - SHORT_NUM_BB_TOLERANCE);
  const adxOk = ind.adx < SHORT_NUM_ADX_MAX;
  if (rsiOk && nearUpper && adxOk) {
    return {
      path: "NUM",
      reasons: [
        `RSI ${ind.rsi.toFixed(1)} ∈ [${SHORT_NUM_RSI_LOW}, ${SHORT_NUM_RSI_HIGH}]`,
        `현재가 ≥ BB상단 × ${1 - SHORT_NUM_BB_TOLERANCE}`,
        `ADX ${ind.adx.toFixed(1)} < ${SHORT_NUM_ADX_MAX}`,
      ],
    };
  }

  return null;
}

/** SHORT 진입 강도 (LONG 의 5-component 거울).
 *   - RSI score: 75 에 가까울수록 ↑ (과매수)
 *   - BB proximity: BB 상단에 가까울수록 ↑
 *   - ADX reversal: ADX 낮을수록 ↑ (평균회귀 SHORT 환경)
 *   - reversal prob: 동일
 *   - volume confirm: 동일 (음봉 거래량 ↑ 면 강한 신호)
 */
export function calculateShortSignalStrength(
  price: number,
  ind: TechnicalIndicators,
  volumeConfirmation: number
): number {
  const rsiScore = Math.max(
    0,
    Math.min(25, ((ind.rsi - SHORT_NUM_RSI_LOW) / (SHORT_NUM_RSI_HIGH - SHORT_NUM_RSI_LOW)) * 25)
  );

  const range = ind.bbUpper - ind.bbLower;
  const bbProximity =
    range > 0
      ? Math.max(0, Math.min(25, ((price - ind.bbLower) / range) * 25))
      : 0;

  const adxReversal = Math.max(0, Math.min(20, ((20 - ind.adx) / 20) * 20));
  const reversalProb = (reversalProbability(ind.adx) / 100) * 15;

  const total = rsiScore + bbProximity + adxReversal + reversalProb + volumeConfirmation;
  return Math.max(0, Math.min(100, Math.round(total)));
}

// SHORT BB structure 가 사용하는 helper (isBear, upperWick) 는 위쪽
// LONG 패턴 모듈에서 이미 정의됨 — 재사용.

// ── 진입 결정 (3가지 경로) ────────────────────────────────────────────────

const NUM_RSI_LOW = 25;
const NUM_RSI_HIGH = 38;
const NUM_BB_TOLERANCE = 0.02;
const NUM_ADX_MAX = 20;
const PTN_BB_TOLERANCE = 0.05;
const PTN_ADX_MAX = 25;

/**
 * 3가지 진입 경로 중 가장 우선순위 높은 1개를 반환.
 * 우선순위: BB > PTN > NUM (스펙: BB가 가장 명확한 신호).
 * Falling Knife일 때는 호출 측에서 미리 차단해야 함.
 */
export function decideEntry(
  candles: Candle[],
  ind: TechnicalIndicators,
  patterns: CandlePatternMatch[],
  bbStructure: BBStructure | null,
  _volRatio: number
): EntryDecision | null {
  if (candles.length === 0) return null;
  const last = candles[candles.length - 1];
  const price = last.close;

  // ── BB 경로 ──
  if (bbStructure != null) {
    return {
      path: "BB",
      reasons: [`BB 구조 패턴: ${bbStructure}`],
      bbStructure,
    };
  }

  // ── PTN 경로 ──
  const bullishPatterns = patterns.filter((p) => p.bias === "bullish");
  if (bullishPatterns.length > 0) {
    const nearLower = price <= ind.bbLower * (1 + PTN_BB_TOLERANCE);
    const adxOk = ind.adx < PTN_ADX_MAX;
    if (nearLower && adxOk) {
      return {
        path: "PTN",
        reasons: [
          `${bullishPatterns.length}개 강세 패턴 감지`,
          `현재가 ≤ BB하단 × ${1 + PTN_BB_TOLERANCE}`,
          `ADX ${ind.adx.toFixed(1)} < ${PTN_ADX_MAX}`,
        ],
        patterns: bullishPatterns,
      };
    }
  }

  // ── NUM 경로 ──
  const rsiOk = ind.rsi >= NUM_RSI_LOW && ind.rsi <= NUM_RSI_HIGH;
  const nearLower = price <= ind.bbLower * (1 + NUM_BB_TOLERANCE);
  const adxOk = ind.adx < NUM_ADX_MAX;
  if (rsiOk && nearLower && adxOk) {
    return {
      path: "NUM",
      reasons: [
        `RSI ${ind.rsi.toFixed(1)} ∈ [${NUM_RSI_LOW}, ${NUM_RSI_HIGH}]`,
        `현재가 ≤ BB하단 × ${1 + NUM_BB_TOLERANCE}`,
        `ADX ${ind.adx.toFixed(1)} < ${NUM_ADX_MAX}`,
      ],
    };
  }

  return null;
}

// ── EXIT 결정 ─────────────────────────────────────────────────────────────

const EXIT_RSI_THRESHOLD = 65;
const EXIT_ADX_THRESHOLD = 30;
const EXIT_PLUSDI_THRESHOLD = 25;

/**
 * v6.3 EXIT decision (Part II.1).
 *
 * Replaces the defective v6.1 4-of-4 rule. Per spec:
 *   - ADX ≥ 30 standalone trigger → DELETED
 *   - +DI ≥ 25 standalone trigger → DELETED
 *   - Reversal is now a 5-component weighted score (DI cross,
 *     ADX+−DI confirmation, bearish pattern, trendline break,
 *     MACD divergence).
 *   - BB middle recovery → 50% partial exit (Tier 1 of EXIT-A).
 *
 * Position-state-dependent categories (C protection, D time stop)
 * require an open position record and are exposed via
 * decideExitForPosition() in src/exits/index.ts. The scanner uses
 * this thin wrapper which only runs EXIT-A and EXIT-B.
 */
export function decideExit(
  price: number,
  ind: TechnicalIndicators,
  bearishPatterns: CandlePatternMatch[]
): ExitDecision | null {
  return decideExitForScanner({ price, indicators: ind, bearishPatterns });
}

// ── 시그널 강도 (5-component formula per spec) ────────────────────────────

/**
 * BBDX-PATTERN v6.1 시그널 강도. 0~100.
 *
 * components:
 *   - RSI_score        (0–25)  RSI 25에 가까울수록 높음
 *   - BB_proximity     (0–25)  BB 하단에 가까울수록 높음
 *   - ADX_reversal     (0–20)  ADX 낮을수록 높음
 *   - reversal_prob    (0–15)  reversalProbability / 100 × 15
 *   - volume_confirm   (-5–15) 거래량 확인
 */
export function calculateSignalStrengthV2(
  price: number,
  ind: TechnicalIndicators,
  volumeConfirmation: number
): number {
  const rsiScore = Math.max(
    0,
    Math.min(25, ((NUM_RSI_HIGH - ind.rsi) / (NUM_RSI_HIGH - NUM_RSI_LOW)) * 25)
  );

  const range = ind.bbUpper - ind.bbLower;
  const bbProximity =
    range > 0
      ? Math.max(0, Math.min(25, (1 - (price - ind.bbLower) / range) * 25))
      : 0;

  const adxReversal = Math.max(
    0,
    Math.min(20, ((20 - ind.adx) / 20) * 20)
  );

  const reversalProb = (reversalProbability(ind.adx) / 100) * 15;

  const total = rsiScore + bbProximity + adxReversal + reversalProb + volumeConfirmation;
  return Math.max(0, Math.min(100, Math.round(total)));
}

// ─── VWAP Strategy (Parker Brooks Style) ─────────────────────────────────

const VWAP_AT_TOLERANCE = 0.001; // ±0.1% counts as "AT"
const PULLBACK_PROXIMITY = 0.005; // within 0.5% of VWAP/EMA = approaching
const VWAP_SIGNAL_THRESHOLD = 50;

/**
 * Volume-weighted average price across the supplied candle range.
 * Uses typical price (H+L+C)/3 weighted by volume.
 */
export function calculateVWAP(candles: Candle[]): number {
  let cumPV = 0;
  let cumVol = 0;
  for (const c of candles) {
    const typical = (c.high + c.low + c.close) / 3;
    cumPV += typical * c.volume;
    cumVol += c.volume;
  }
  return cumVol > 0 ? cumPV / cumVol : 0;
}

/** Standard EMA. Returns the trailing EMA over `values` with `period`. */
export function calculateEMA(values: number[], period: number): number {
  if (values.length === 0 || period <= 0) return 0;
  if (values.length < period) {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

export function vwapPosition(price: number, vwap: number): VwapPosition {
  if (vwap <= 0) return "AT";
  const diff = (price - vwap) / vwap;
  if (Math.abs(diff) < VWAP_AT_TOLERANCE) return "AT";
  return diff > 0 ? "ABOVE" : "BELOW";
}

export function emaPosition(price: number, ema: number): EmaPosition {
  if (ema <= 0) return "AT";
  const diff = (price - ema) / ema;
  if (Math.abs(diff) < VWAP_AT_TOLERANCE) return "AT";
  return diff > 0 ? "ABOVE" : "BELOW";
}

/**
 * Pullback = price has recently approached VWAP or EMA(9) within
 * PULLBACK_PROXIMITY without crossing the prevailing-trend reference line.
 * Looks at the last 5 candles. Returns false when the trend hasn't been
 * established (current position is "AT") or when no candle approached.
 */
export function detectPullback(
  candles: Candle[],
  vwap: number,
  ema9: number
): boolean {
  if (candles.length < 5 || vwap <= 0 || ema9 <= 0) return false;
  const last = candles[candles.length - 1];
  const currentSide = vwapPosition(last.close, vwap);
  if (currentSide === "AT") return false;

  const lookback = candles.slice(-5);
  for (const c of lookback) {
    const distance = Math.abs(c.low - vwap) / vwap;
    const distanceHigh = Math.abs(c.high - vwap) / vwap;
    const minDist = Math.min(distance, distanceHigh);
    if (minDist <= PULLBACK_PROXIMITY) {
      const closeSide = vwapPosition(c.close, vwap);
      if (closeSide === currentSide || closeSide === "AT") return true;
    }
  }
  for (const c of lookback) {
    const distance = Math.abs(c.low - ema9) / ema9;
    const distanceHigh = Math.abs(c.high - ema9) / ema9;
    const minDist = Math.min(distance, distanceHigh);
    if (minDist <= PULLBACK_PROXIMITY) {
      const closeSide = emaPosition(c.close, ema9);
      if (closeSide === currentSide || closeSide === "AT") return true;
    }
  }
  return false;
}

/**
 * VWAP 표준편차 밴드 (volume-weighted variance).
 *
 * VWAP_STRATEGY.md §6.3 — 1σ/2σ/3σ 밴드.
 * variance = Σ((typical - vwap)² × vol) / Σvol
 *
 * 엣지: candles 비었거나 cumVol === 0 → sigma = 0, 모든 밴드 0.
 */
export function calculateVwapBands(candles: Candle[]): VwapBands {
  if (!candles || candles.length === 0) {
    return {
      vwap: 0,
      sigma: 0,
      upper1: 0,
      upper2: 0,
      upper3: 0,
      lower1: 0,
      lower2: 0,
      lower3: 0,
    };
  }
  let cumPV = 0;
  let cumVol = 0;
  for (const c of candles) {
    const typical = (c.high + c.low + c.close) / 3;
    cumPV += typical * c.volume;
    cumVol += c.volume;
  }
  if (cumVol <= 0) {
    return {
      vwap: 0,
      sigma: 0,
      upper1: 0,
      upper2: 0,
      upper3: 0,
      lower1: 0,
      lower2: 0,
      lower3: 0,
    };
  }
  const vwap = cumPV / cumVol;

  // volume-weighted variance
  let cumVarNum = 0;
  for (const c of candles) {
    const typical = (c.high + c.low + c.close) / 3;
    const dev = typical - vwap;
    cumVarNum += dev * dev * c.volume;
  }
  const variance = cumVarNum / cumVol;
  const sigma = Math.sqrt(Math.max(0, variance));

  return {
    vwap,
    sigma,
    upper1: vwap + sigma,
    upper2: vwap + 2 * sigma,
    upper3: vwap + 3 * sigma,
    lower1: vwap - sigma,
    lower2: vwap - 2 * sigma,
    lower3: vwap - 3 * sigma,
  };
}

/**
 * Pullback v2 — VWAP_STRATEGY.md §8 의 "터치 + 반등" 패턴 검증.
 *
 * 알고리즘:
 *   1. 마지막 5 캔들 (lookback) 에서 low/high 가 vwap/ema9 의 0.5% 이내 터치
 *   2. 터치 발견 시 다음 1~2 캔들의 종가가 추세 방향으로 반등 확인
 *      LONG: next.close > next.open && next.close > touch.close
 *      SHORT: next.close < next.open && next.close < touch.close
 *
 * 헌장 규칙 3 준수: standalone 시그널 X, decideVwapSignal 의 보조 점수로만 사용.
 *
 * 엣지: candles.length < 7 → detected: false (5 lookback + 2 confirm 필요).
 */
export function detectPullbackV2(
  candles: Candle[],
  vwap: number,
  ema9: number,
  side: "LONG" | "SHORT"
): PullbackQuality {
  const empty: PullbackQuality = {
    detected: false,
    touchCandleIdx: null,
    bounceConfirmed: false,
    proximityRatio: 1,
    touchedLine: null,
  };
  if (!candles || candles.length < 7 || vwap <= 0 || ema9 <= 0) return empty;

  const n = candles.length;
  // lookback: 마지막에서 두 번째 5 캔들 윈도우 — confirm 캔들 2개 여유 확보
  // i.e. touch candidate idx = [n-7 .. n-3], confirm = [touch+1, touch+2]
  let bestProximity = 1;
  let bestIdx: number | null = null;
  let bestLine: "vwap" | "ema9" | null = null;

  // 가장 가까웠던 거리 추적 (proximityRatio) — 관찰 윈도우는 마지막 5 캔들
  const obsStart = Math.max(0, n - 5);
  for (let i = obsStart; i < n; i++) {
    const c = candles[i];
    const distVwap = Math.min(
      Math.abs(c.low - vwap) / vwap,
      Math.abs(c.high - vwap) / vwap
    );
    const distEma = Math.min(
      Math.abs(c.low - ema9) / ema9,
      Math.abs(c.high - ema9) / ema9
    );
    if (distVwap < bestProximity) bestProximity = distVwap;
    if (distEma < bestProximity) bestProximity = distEma;
  }

  // touch 후보: confirm 캔들 1~2 개 여유 → idx 최대 n-3 까지
  for (let i = obsStart; i <= n - 3; i++) {
    const c = candles[i];
    const distVwap = Math.min(
      Math.abs(c.low - vwap) / vwap,
      Math.abs(c.high - vwap) / vwap
    );
    const distEma = Math.min(
      Math.abs(c.low - ema9) / ema9,
      Math.abs(c.high - ema9) / ema9
    );
    if (distVwap <= PULLBACK_PROXIMITY) {
      bestIdx = i;
      bestLine = "vwap";
      break;
    }
    if (distEma <= PULLBACK_PROXIMITY) {
      bestIdx = i;
      bestLine = "ema9";
      break;
    }
  }

  if (bestIdx === null) {
    return { ...empty, proximityRatio: bestProximity };
  }

  // bounce 확인: 다음 1~2 캔들
  const touchCandle = candles[bestIdx];
  let bounceConfirmed = false;
  for (let j = 1; j <= 2; j++) {
    const next = candles[bestIdx + j];
    if (!next) break;
    if (side === "LONG") {
      if (next.close > next.open && next.close > touchCandle.close) {
        bounceConfirmed = true;
        break;
      }
    } else {
      if (next.close < next.open && next.close < touchCandle.close) {
        bounceConfirmed = true;
        break;
      }
    }
  }

  return {
    detected: true,
    touchCandleIdx: bestIdx,
    bounceConfirmed,
    proximityRatio: bestProximity,
    touchedLine: bestLine,
  };
}

/**
 * decideVwapSignal 의 5-컴포넌트 평가 옵션 (VWAP_STRATEGY.md §9.1).
 *
 * opts 미제공 시 기존 4-컴포넌트 (35/25/25/15) fallback — 호환성.
 */
export interface DecideVwapSignalOptions {
  pullbackQuality?: PullbackQuality;
  volumeProfile?: VolumeProfile;
}

/**
 * Decide LONG / SHORT / null per spec §6.3.
 *
 * LONG: price ABOVE both VWAP and EMA(9) (EMA can be AT).
 * SHORT: price BELOW both VWAP and EMA(9) (EMA can be AT).
 * Mixed → null.
 *
 * opts 제공 시 5-컴포넌트 (25/20/25/15/15) 명세서 §9.1 가중치.
 * opts 미제공 시 기존 4-컴포넌트 (35/25/25/15) — legacy 호환.
 */
export function decideVwapSignal(
  price: number,
  vwap: number,
  ema9: number,
  pullback: boolean,
  volRatio: number,
  opts?: DecideVwapSignalOptions
): VwapSignal | null {
  if (vwap <= 0 || ema9 <= 0 || price <= 0) return null;

  const vwapPos = vwapPosition(price, vwap);
  const emaPos = emaPosition(price, ema9);
  if (vwapPos === "AT") return null;

  let side: "LONG" | "SHORT" | null = null;
  if (vwapPos === "ABOVE" && (emaPos === "ABOVE" || emaPos === "AT")) {
    side = "LONG";
  } else if (vwapPos === "BELOW" && (emaPos === "BELOW" || emaPos === "AT")) {
    side = "SHORT";
  }
  if (!side) return null;

  const vwapDistPct = Math.abs(price - vwap) / vwap;
  const aligned =
    (side === "LONG" && emaPos === "ABOVE") ||
    (side === "SHORT" && emaPos === "BELOW");

  const reasons: string[] = [];
  let strength = 0;

  if (opts && (opts.pullbackQuality || opts.volumeProfile)) {
    // ── 5-컴포넌트 평가 (명세서 §9.1) ──
    // (1) VWAP 거리: 25점 (vwapDistPct × 17.5 ×100, capped at 25)
    const vwapDistanceScore = Math.max(
      0,
      Math.min(25, vwapDistPct * 100 * 17.5)
    );
    // (2) EMA(9) 위치: 20 (aligned), 10 (partial — emaPos === "AT"), 0 (else)
    const emaScore = aligned ? 20 : emaPos === "AT" ? 10 : 0;
    // (3) EMA 되돌림 (Pullback v2): 25 (bounceConfirmed), 12 (detected only), 0
    const pq = opts.pullbackQuality;
    const pullbackScore = pq
      ? pq.bounceConfirmed
        ? 25
        : pq.detected
          ? 12
          : 0
      : pullback
        ? 12
        : 0;
    // (4) Volume Profile 지지 (HVN/POC 0.5% 이내): 15
    // (5) Volume Profile 구조 (LONG: price > nearest LVN, SHORT: price < nearest LVN): 15
    let vpSupportScore = 0;
    let vpStructureScore = 0;
    const vp = opts.volumeProfile;
    if (vp) {
      const tolerance = price * 0.005;
      const pocDist = Math.abs(price - vp.poc);
      const nearestHvnDist = vp.hvnList.length
        ? Math.min(...vp.hvnList.map((h) => Math.abs(price - h)))
        : Infinity;
      if (pocDist <= tolerance || nearestHvnDist <= tolerance) {
        vpSupportScore = 15;
      }
      if (vp.lvnList.length > 0) {
        if (side === "LONG") {
          // 위쪽에 LVN 빈 구간 = 상승 여력
          const lvnsAbove = vp.lvnList.filter((l) => l > price);
          if (lvnsAbove.length > 0) vpStructureScore = 15;
        } else {
          const lvnsBelow = vp.lvnList.filter((l) => l < price);
          if (lvnsBelow.length > 0) vpStructureScore = 15;
        }
      }
    }

    strength = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          vwapDistanceScore +
            emaScore +
            pullbackScore +
            vpSupportScore +
            vpStructureScore
        )
      )
    );

    if (strength < VWAP_SIGNAL_THRESHOLD) return null;

    reasons.push(
      side === "LONG"
        ? `Price ABOVE VWAP (${(vwapDistPct * 100).toFixed(2)}%)`
        : `Price BELOW VWAP (${(vwapDistPct * 100).toFixed(2)}%)`
    );
    reasons.push(
      `EMA(9) ${emaPos.toLowerCase()} (${aligned ? "aligned" : "transition"})`
    );
    if (pq?.bounceConfirmed) {
      reasons.push("Pullback bounce confirmed (touch + reversal)");
    } else if (pq?.detected) {
      reasons.push("Pullback touch detected (awaiting bounce)");
    } else if (pullback) {
      reasons.push("Pullback proximity (legacy)");
    }
    if (vpSupportScore > 0) reasons.push("Volume Profile support (POC/HVN nearby)");
    if (vpStructureScore > 0) {
      reasons.push(
        side === "LONG"
          ? "LVN gap above (room to move)"
          : "LVN gap below (room to drop)"
      );
    }
  } else {
    // ── 4-컴포넌트 fallback (legacy) ──
    const vwapDistanceScore = Math.max(
      0,
      Math.min(35, vwapDistPct * 100 * 17.5)
    );
    const emaScore = aligned ? 25 : 12.5;
    const volRaw = volumeConfirmationFromRatio(volRatio);
    const volScore = Math.max(0, Math.min(25, ((volRaw + 5) / 20) * 25));
    const pullbackScore = pullback ? 15 : 0;

    strength = Math.max(
      0,
      Math.min(
        100,
        Math.round(vwapDistanceScore + emaScore + volScore + pullbackScore)
      )
    );

    if (strength < VWAP_SIGNAL_THRESHOLD) return null;

    reasons.push(
      side === "LONG"
        ? `Price ABOVE VWAP (${(vwapDistPct * 100).toFixed(2)}%)`
        : `Price BELOW VWAP (${(vwapDistPct * 100).toFixed(2)}%)`
    );
    reasons.push(
      `EMA(9) ${emaPos.toLowerCase()} (${aligned ? "aligned" : "transition"})`
    );
    if (pullback) reasons.push("Pullback detected (entry zone)");
    if (volRatio > 1.2) reasons.push(`Volume +${((volRatio - 1) * 100).toFixed(0)}%`);
  }

  return { side, strength, reasons };
}

/**
 * VwapSignal → BBDX confidence multiplier (헌장 규칙 3 준수).
 *
 * Standalone VwapSignal 발행은 deprecated — 본 헬퍼가 정식 통합 경로.
 *
 * Mapping:
 *   - null signal: 1.00 (neutral)
 *   - signal.side === bbdxSide:  1.0 + (strength - 50) / 50 × 0.30  → 1.0~1.30
 *   - signal.side !== bbdxSide:  1.0 - (strength - 50) / 50 × 0.30  → 0.70~1.0
 *
 * Tradelab 은 현재 LONG-only — bbdxSide 기본값 "LONG".
 *
 * @param signal - decideVwapSignal 결과
 * @param bbdxSide - BBDX 진입 path side
 */
export function vwapToMultiplier(
  signal: VwapSignal | null,
  bbdxSide: "LONG" = "LONG"
): number {
  if (!signal) return 1.0;
  const normalizedStrength =
    Math.max(0, Math.min(50, signal.strength - 50)) / 50; // 0~1
  if (signal.side === bbdxSide) {
    return 1.0 + normalizedStrength * 0.3; // 1.0~1.30
  }
  return 1.0 - normalizedStrength * 0.3; // 0.70~1.0
}
