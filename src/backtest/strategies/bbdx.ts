/**
 * BBDX Strategy (RSI/BB/ADX) — Signal Tracker / RSI · BB · ADX 페이지.
 *
 * 진입 게이트 (4단계 직렬, v6.5 Phase 1):
 *   1. isEntrySignal — RSI 30~35, BB lower×1.02, ADX≤30
 *   2. Falling Knife — -DI > +DI && ADX > 25 차단
 *   3. Pattern Confluence — bullishPatterns aggregatePatternScore ≥ 0.4
 *   4. Higher-TF SMA(50) — SMA -1% 이상 하락 + price < SMA 시 차단
 *
 * Tier 1/2 부분 청산 (R:R 비대칭화):
 *   Tier 1: bbMiddle 도달 → 50%
 *   Tier 2: min(bbUpper, entry × 1.05) → 잔여 50%
 *   Stop: max(bbLower × 0.97, entry × 0.98)
 *
 * Modifier 추적 (Phase 2): EMA Ribbon × MACD × Order Block
 *
 * 헌장 차원: 1 momentum (RSI), 2 volatility (BB), 3 trend (ADX)
 */

import type { Candle, TechnicalIndicators } from "@shared/types";
import {
  isEntrySignal,
  calculateSignalStrength,
  detectAllCandlePatterns,
} from "../../indicators";
import { aggregatePatternScore } from "../../patterns/aggregator";
import {
  computeEmaRibbon,
  detectMacdDivergence,
  detectOrderBlock,
} from "../../modifiers";
import type { BacktestStrategy, EntryEvaluation, EntryParams } from "./types";
import { registerStrategy } from "./types";

/**
 * 같은 TF 캔들로 Higher-TF context 근사 (별도 1D fetch X).
 * SMA(50) 의 방향성 + 현재가 위치만 평가.
 *
 * BEARISH 차단: SMA -1% 이상 하락 + price < SMA
 */
function checkHigherTfBullish(candles: Candle[], idx: number): boolean {
  if (idx < 50) return true;
  const slice = candles.slice(Math.max(0, idx - 49), idx + 1);
  const closes = slice.map((c) => c.close);
  const smaCurrent = closes.reduce((a, b) => a + b, 0) / closes.length;

  const idxBack = idx - 20;
  if (idxBack < 50) return candles[idx].close >= smaCurrent;
  const sliceBack = candles.slice(Math.max(0, idxBack - 49), idxBack + 1);
  const closesBack = sliceBack.map((c) => c.close);
  const smaBack = closesBack.reduce((a, b) => a + b, 0) / closesBack.length;

  const slope = (smaCurrent - smaBack) / smaBack;
  const priceAbove = candles[idx].close >= smaCurrent;
  if (slope < -0.01 && !priceAbove) return false;
  return true;
}

export const bbdxStrategy: BacktestStrategy = {
  name: "bbdx",
  label: "BBDX (RSI / BB / ADX)",
  description:
    "v6.5 Phase 1+2+3 — RSI 평균회귀 + BB 하단 + ADX 약함 + Pattern Confluence + Higher-TF",
  dimensionsCovered: [1, 2, 3, 5],

  shouldEnter(
    candles: Candle[],
    idx: number,
    indicators: TechnicalIndicators,
    windowCandles: Candle[],
  ): EntryEvaluation {
    const price = candles[idx].close;
    const reasons: string[] = [];

    // Gate 1: BBDX 기본 진입
    if (!isEntrySignal(price, indicators)) return { entry: false };
    reasons.push("RSI 30~35 + BB lower 근처 + ADX ≤ 30");

    // Gate 2: Falling Knife 차단
    if (indicators.minusDi > indicators.plusDi && indicators.adx > 25) {
      return { entry: false };
    }

    // Gate 3: Pattern Confluence ≥ 0.4
    const allPatterns = detectAllCandlePatterns(windowCandles);
    const bullishPatterns = allPatterns.filter((p) => p.bias === "bullish");
    const patternConfluenceScore = aggregatePatternScore(bullishPatterns);
    if (patternConfluenceScore < 0.4) return { entry: false };
    reasons.push(`Pattern Confluence ${(patternConfluenceScore * 100).toFixed(0)} ≥ 40`);

    // Gate 4: Higher-TF SMA(50)
    const higherTfBullish = checkHigherTfBullish(candles, idx);
    if (!higherTfBullish) return { entry: false };
    reasons.push("Higher-TF SMA(50) bullish/sideways");

    // Phase 2: Modifier multipliers (graceful — 차단 X)
    let emaRibbonMult = 1.0;
    let macdDivergenceMult = 1.0;
    let orderBlockMult = 1.0;
    try {
      emaRibbonMult = computeEmaRibbon(windowCandles).multiplier;
      macdDivergenceMult = detectMacdDivergence(windowCandles).multiplier;
      orderBlockMult = detectOrderBlock(windowCandles).multiplier;
    } catch {
      /* graceful */
    }
    const modifiersProduct = emaRibbonMult * macdDivergenceMult * orderBlockMult;

    return {
      entry: true,
      reasons,
      metadata: {
        patternConfluenceScore,
        higherTfBullish,
        emaRibbonMult,
        macdDivergenceMult,
        orderBlockMult,
        modifiersProduct,
      },
    };
  },

  getEntryParams(
    _candles: Candle[],
    _idx: number,
    indicators: TechnicalIndicators,
    entryPrice: number,
  ): EntryParams {
    const target1 = indicators.bbMiddle;
    const target2 = Math.min(indicators.bbUpper, entryPrice * 1.05);
    const stopLoss = Math.max(indicators.bbLower * 0.97, entryPrice * 0.98);
    const signalStrength = calculateSignalStrength(entryPrice, indicators);
    return { target1, target2, stopLoss, signalStrength };
  },
};

registerStrategy(bbdxStrategy);
