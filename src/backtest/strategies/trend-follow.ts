/**
 * Trend-Follow Strategy — P1-③ (2026-05-11) 전략 다양화.
 *
 * Audit 진단 결과 mean reversion (BBDX) 만으로는 강세장 부적합.
 * EMA + ADX + HH/HL 기반 추세 추종 strategy 신규 추가하여 BBDX 와 보완.
 *
 * 진입 게이트 (5단계):
 *   1. EMA 정배열: EMA(9) > EMA(21) > EMA(50)
 *   2. ADX ≥ 25 (강한 추세)
 *   3. +DI > -DI (강세 우위)
 *   4. price > SMA(50) (장기 추세 위)
 *   5. 직전 캔들 HH (higher high — 최근 20 캔들 max 갱신)
 *
 * Tier 1/2 (R:R 비대칭):
 *   Tier 1: entry + 1.5 × ATR → 50% (breakout 의 첫 익절)
 *   Tier 2: entry + 3.5 × ATR → 잔여 50% (trend continuation)
 *   Stop:   entry - 1.0 × ATR (변동성 적응)
 *
 * 차원 커버 (헌장 R1):
 *   1 momentum (RSI 미사용 — pure trend, 의도적 단일 차원 후 modifier 보완)
 *   3 trend (ADX + EMA + DI + SMA)
 *   5 structure (HH/HL swing)
 *
 * 헌장 R3 (단독 시그널 X):
 *   본 strategy 는 *backtest baseline 측정 전용*. live signal scanner 가
 *   사용하려면 BBDX 와 별도 path 로 통합 필요 (후속 작업).
 */

import type { Candle, TechnicalIndicators } from "@shared/types";
import { calculateATR } from "../../indicators";
import type { BacktestStrategy, EntryEvaluation, EntryParams } from "./types";
import { registerStrategy } from "./types";

/** EMA 계산 — 단순 helper (별도 export X). */
function calcEMA(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1] ?? 0;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

/** SMA 계산. */
function calcSMA(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1] ?? 0;
  const tail = closes.slice(-period);
  return tail.reduce((a, b) => a + b, 0) / tail.length;
}

/** Higher High 검사 — 직전 20 캔들 max 가 lookback 30 캔들 max 보다 큰가. */
function hasRecentHigherHigh(candles: Candle[], idx: number): boolean {
  if (idx < 30) return false;
  const recent20 = candles.slice(Math.max(0, idx - 19), idx + 1);
  const older10 = candles.slice(Math.max(0, idx - 29), idx - 19);
  if (older10.length === 0) return false;
  const recentMax = Math.max(...recent20.map((c) => c.high));
  const olderMax = Math.max(...older10.map((c) => c.high));
  return recentMax > olderMax;
}

export const trendFollowStrategy: BacktestStrategy = {
  name: "trend-follow",
  label: "Trend Follow (EMA / ADX / HH)",
  description:
    "v6.5 P1-③ — EMA 정배열 + ADX≥25 + Higher High 추세 추종. BBDX mean reversion 과 보완 전략.",
  dimensionsCovered: [1, 3, 5],
  side: "long",

  shouldEnter(
    candles: Candle[],
    idx: number,
    indicators: TechnicalIndicators,
    windowCandles: Candle[],
  ): EntryEvaluation {
    const reasons: string[] = [];
    const closes = windowCandles.map((c) => c.close);
    const price = candles[idx].close;

    // Gate 1: EMA 정배열
    const ema9 = calcEMA(closes, 9);
    const ema21 = calcEMA(closes, 21);
    const ema50 = calcEMA(closes, 50);
    if (!(ema9 > ema21 && ema21 > ema50)) {
      return { entry: false };
    }
    reasons.push(
      `EMA 정배열: 9(${ema9.toFixed(2)}) > 21(${ema21.toFixed(2)}) > 50(${ema50.toFixed(2)})`,
    );

    // Gate 2: ADX ≥ 25 (강한 추세)
    if (indicators.adx < 25) {
      return { entry: false };
    }
    reasons.push(`ADX ${indicators.adx.toFixed(1)} ≥ 25`);

    // Gate 3: +DI > -DI (강세 우위)
    if (indicators.plusDi <= indicators.minusDi) {
      return { entry: false };
    }
    reasons.push(
      `+DI ${indicators.plusDi.toFixed(1)} > -DI ${indicators.minusDi.toFixed(1)}`,
    );

    // Gate 4: price > SMA(50) (장기 추세 위)
    const sma50 = calcSMA(closes, 50);
    if (price <= sma50) {
      return { entry: false };
    }
    reasons.push(`price ${price.toFixed(2)} > SMA(50) ${sma50.toFixed(2)}`);

    // Gate 5: 직전 20 캔들 HH (higher high)
    if (!hasRecentHigherHigh(candles, idx)) {
      return { entry: false };
    }
    reasons.push("최근 20 캔들 HH 갱신");

    return {
      entry: true,
      reasons,
      metadata: {
        ema9,
        ema21,
        ema50,
        sma50,
      },
    };
  },

  getEntryParams(
    _candles: Candle[],
    _idx: number,
    indicators: TechnicalIndicators,
    entryPrice: number,
    windowCandles: Candle[],
  ): EntryParams {
    const atr = calculateATR(windowCandles);

    // ATR 기반 R:R 비대칭 (1:2:3 ratio)
    //   Stop = entry - 1.0 × ATR
    //   Tier 1 = entry + 1.5 × ATR (50% 부분 청산)
    //   Tier 2 = entry + 3.5 × ATR (잔여 50% — trend continuation)
    const stopLoss =
      atr > 0 ? entryPrice - 1.0 * atr : entryPrice * 0.97;
    const target1 =
      atr > 0 ? entryPrice + 1.5 * atr : entryPrice * 1.03;
    const target2 =
      atr > 0 ? entryPrice + 3.5 * atr : entryPrice * 1.08;

    // signalStrength: ADX 기반 (강한 추세 = 강한 신호)
    const signalStrength = Math.min(
      100,
      Math.round(50 + Math.min(50, indicators.adx)),
    );

    return { target1, target2, stopLoss, signalStrength };
  },
};

registerStrategy(trendFollowStrategy);
