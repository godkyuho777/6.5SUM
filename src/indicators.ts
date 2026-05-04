import type { Candle, TechnicalIndicators } from "@shared/types";

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

  return {
    rsi: Math.round(rsi * 100) / 100,
    bbUpper: bb.upper,
    bbMiddle: bb.middle,
    bbLower: bb.lower,
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
