/**
 * Trend Analysis Strategy — Wave Tracker / Trend Analysis 페이지.
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║ ⚠ 헌장 R3 (No Standalone Signal) 통제 — P1-#2 fix, 2026-05-10        ║
 * ║                                                                      ║
 * ║ 본 strategy 는 **backtest 알파 baseline 측정 전용**.                  ║
 * ║ live signal scanner (`scanner.ts`) 는 trend 분석을 BBDX 의            ║
 * ║ *waveMult multiplier* 로만 사용 (`analyzeTrend(...).waveMult`).       ║
 * ║ standalone 진입 발행 X.                                              ║
 * ║                                                                      ║
 * ║ 사용 정책:                                                           ║
 * ║   ✅ backtest CLI (`pnpm backtest --strategy trend`) — 비교 baseline  ║
 * ║   ❌ real-time signal 발행 — BBDX 의 waveMult multiplier 로만 작동    ║
 * ║                                                                      ║
 * ║ Audit: `docs/2026-05-10-SCANNER-AUDIT/06-WAVE-TREND-AUDIT.md`        ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * 명세서 Trend_Analysis_Engine_v2.0 의 멀티 TF 종합을 backtest 가능하게
 * 단순화한 버전. 같은 TF 캔들에서 SMA 기반 Higher-TF 추세 근사.
 *
 * 진입 게이트 (backtest 한정):
 *   1. EMA 9 > 21 > 50 (정배열) — 추세 방향 BULLISH
 *   2. ADX ≥ 20 (추세 존재)
 *   3. +DI > -DI (강세 우위)
 *   4. price > SMA(50) AND SMA(50) 상승 (long-term context)
 *   5. HH/HL pattern (직전 swing 대비 higher highs)
 *
 * Tier 1/2:
 *   Tier 1: 직전 20캔들 high (swing high) 회복 → 50%
 *   Tier 2: entry × 1.05 (+5%) → 잔여 50%
 *   Stop: max(EMA(21), entry × 0.97) — 추세 추종 손절
 *
 * 헌장 차원: 3 trend (ADX + EMA + SMA + HH/HL)
 */

import type { Candle, TechnicalIndicators } from "@shared/types";
import { calculateEMA, calculateADX } from "../../indicators";
import type { BacktestStrategy, EntryEvaluation, EntryParams } from "./types";
import { registerStrategy } from "./types";

/** Higher-TF SMA(50) 방향성 평가 */
function smaContext(candles: Candle[], idx: number): {
  smaCurrent: number;
  smaSlope: number;
  priceAbove: boolean;
} {
  const slice = candles.slice(Math.max(0, idx - 49), idx + 1);
  const closes = slice.map((c) => c.close);
  const smaCurrent = closes.reduce((a, b) => a + b, 0) / closes.length;

  const idxBack = Math.max(idx - 20, 50);
  const sliceBack = candles.slice(Math.max(0, idxBack - 49), idxBack + 1);
  const closesBack = sliceBack.map((c) => c.close);
  const smaBack = closesBack.reduce((a, b) => a + b, 0) / closesBack.length;
  const smaSlope = smaBack > 0 ? (smaCurrent - smaBack) / smaBack : 0;

  return {
    smaCurrent,
    smaSlope,
    priceAbove: candles[idx].close > smaCurrent,
  };
}

/** HH/HL 추세 구조: 직전 N캔들이 상승 구조인지 */
function hasBullishStructure(candles: Candle[], idx: number, lookback = 10): boolean {
  if (idx < lookback) return false;
  const slice = candles.slice(idx - lookback, idx + 1);
  // 단순화: 직전 5캔들 high 평균 > 그 이전 5캔들 high 평균
  const recent5 = slice.slice(-5);
  const prior5 = slice.slice(-10, -5);
  if (recent5.length === 0 || prior5.length === 0) return false;
  const recentHighAvg = recent5.reduce((s, c) => s + c.high, 0) / recent5.length;
  const priorHighAvg = prior5.reduce((s, c) => s + c.high, 0) / prior5.length;
  const recentLowAvg = recent5.reduce((s, c) => s + c.low, 0) / recent5.length;
  const priorLowAvg = prior5.reduce((s, c) => s + c.low, 0) / prior5.length;
  return recentHighAvg > priorHighAvg && recentLowAvg > priorLowAvg;
}

export const trendStrategy: BacktestStrategy = {
  name: "trend",
  label: "Multi-TF Trend Analysis (v2.0)",
  description:
    "EMA 정배열 + ADX≥20 + +DI > -DI + SMA(50) 상승 + HH/HL 구조",
  dimensionsCovered: [3],

  shouldEnter(
    candles: Candle[],
    idx: number,
    indicators: TechnicalIndicators,
    windowCandles: Candle[],
  ): EntryEvaluation {
    if (idx < 50) return { entry: false };

    const reasons: string[] = [];
    const closes = windowCandles.map((c) => c.close);
    const ema9 = calculateEMA(closes, 9);
    const ema21 = calculateEMA(closes, 21);
    const ema50 = calculateEMA(closes, 50);

    // Gate 1: EMA 정배열 (9 > 21 > 50)
    if (!(ema9 > ema21 && ema21 > ema50)) return { entry: false };
    reasons.push("EMA 정배열 (9 > 21 > 50)");

    // Gate 2: ADX ≥ 20 (추세 존재)
    const { adx, plusDi, minusDi } = calculateADX(windowCandles);
    if (adx < 20) return { entry: false };
    reasons.push(`ADX ${adx.toFixed(1)} ≥ 20 (추세 존재)`);

    // Gate 3: +DI > -DI (강세 우위)
    if (plusDi <= minusDi) return { entry: false };
    reasons.push(`+DI ${plusDi.toFixed(1)} > -DI ${minusDi.toFixed(1)}`);

    // Gate 4: SMA(50) 상승 + price > SMA
    const sma = smaContext(candles, idx);
    if (!sma.priceAbove || sma.smaSlope <= 0) return { entry: false };
    reasons.push(`SMA(50) 상승 (+${(sma.smaSlope * 100).toFixed(2)}%) + price > SMA`);

    // Gate 5: HH/HL 구조
    if (!hasBullishStructure(candles, idx)) return { entry: false };
    reasons.push("HH/HL 구조 (10캔들 상승 구조)");

    // 종합 confidence 산출
    const adxFactor = Math.min(1, (adx - 20) / 30); // 0~1
    const diFactor = Math.min(1, (plusDi - minusDi) / 20);
    const smaFactor = Math.min(1, sma.smaSlope * 50);
    const trendConfidence = Math.round(
      ((adxFactor + diFactor + smaFactor) / 3) * 100,
    );

    return {
      entry: true,
      reasons,
      metadata: {
        trendAlignment: "ALIGNED_BULL",
        trendConfidence,
      },
    };
  },

  getEntryParams(
    candles: Candle[],
    idx: number,
    _indicators: TechnicalIndicators,
    entryPrice: number,
    windowCandles: Candle[],
  ): EntryParams {
    // Tier 1: 직전 20캔들 swing high (anchor) 회복
    const recent20 = candles.slice(Math.max(0, idx - 19), idx + 1);
    const recentHigh = Math.max(...recent20.map((c) => c.high));
    const target1 = Math.min(recentHigh * 1.005, entryPrice * 1.04);

    // Tier 2: entry × 1.05 cap
    const target2 = Math.min(recentHigh * 1.03, entryPrice * 1.07);

    // Stop: EMA(21) 또는 entry × 0.97 — 추세 추종 손절 (좁지 않게)
    const closes = windowCandles.map((c) => c.close);
    const ema21 = calculateEMA(closes, 21);
    const stopLoss = Math.max(ema21 * 0.99, entryPrice * 0.97);

    // Signal strength: confidence 기반
    const { adx, plusDi, minusDi } = calculateADX(windowCandles);
    const adxFactor = Math.min(50, adx);
    const diFactor = Math.min(30, plusDi - minusDi);
    const signalStrength = Math.round(adxFactor + diFactor + 20); // 30~100

    return { target1, target2, stopLoss, signalStrength };
  },
};

registerStrategy(trendStrategy);
