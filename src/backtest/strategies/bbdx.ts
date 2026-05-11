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
  calculateSignalStrength,
  calculateATR,
  calculateBollingerBandsSeries,
  decideEntry,
  detectAllCandlePatterns,
  detectBBStructure,
  isFallingKnife,
  volumeRatio,
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
    const reasons: string[] = [];

    // P0-③ fix (2026-05-11): live `decideEntry` (RSI 25~38, 3-path: BB > PTN > NUM)
    // 와 backtest 가 동일 룰 측정하도록 동기화. 이전엔 `isEntrySignal` (RSI 30~35,
    // 1-path) 사용 — live 와 다른 전략 측정. Audit D5 시정.
    const allPatterns = detectAllCandlePatterns(windowCandles);
    const ratio = volumeRatio(windowCandles);
    const closes = windowCandles.map((c) => c.close);
    const bbSeries = calculateBollingerBandsSeries(closes);
    const bbStructure = detectBBStructure(windowCandles, bbSeries);

    // Gate 1: Falling Knife 차단 (live 와 동일)
    if (isFallingKnife(indicators.plusDi, indicators.minusDi, indicators.adx)) {
      return { entry: false };
    }

    // Gate 2: live decideEntry 호출 (3-path: BB > PTN > NUM)
    const entryDecision = decideEntry(
      windowCandles,
      indicators,
      allPatterns,
      bbStructure,
      ratio,
    );
    if (!entryDecision) return { entry: false };
    reasons.push(`Entry path: ${entryDecision.path}`);
    entryDecision.reasons.forEach((r) => reasons.push(r));

    // P1-② fix (2026-05-11): 모든 path Pattern Confluence ≥ 0.4 hard gate.
    //   P0 적용 후 365d 결과: 1728 trades (4.7/day) — over-trading 으로
    //   PF 0.44, MDD 100%. NUM path soft gate 0.2 너무 헐거움.
    //   모든 path 동일 0.4 임계 → 진입 빈도 ↓, winRate ↑ 예상.
    //   Audit D4 권고: 5차원 structure 커버 필수.
    const bullishPatterns = allPatterns.filter((p) => p.bias === "bullish");
    const patternConfluenceScore = aggregatePatternScore(bullishPatterns);
    if (patternConfluenceScore < 0.4) {
      return { entry: false };
    }
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
    windowCandles: Candle[],
  ): EntryParams {
    const atr = calculateATR(windowCandles);

    // P1-① fix (2026-05-11): Tier 1 = bbMiddle + 0.5 × ATR — 짧은 bounce 잘림 방지.
    //   P0 적용 후 365d 결과: tier1_then_stop 45.1% (Tier 1 도달 후 BE 회귀
    //   stop). 원인: Tier 1 = bbMiddle 이 entry 근처 → normal pullback 도
    //   Tier 1 도달 → 잔여 50% 가 entry (BE) 회귀하면서 무수익 청산.
    //
    //   bbMiddle + 0.5 × ATR → 짧은 bounce 보다 *의미 있는 trend continuation*
    //   까지 가야 Tier 1 인정. ATR 부재 시 bbMiddle 단독 fallback.
    const target1 =
      atr > 0
        ? indicators.bbMiddle + 0.5 * atr
        : indicators.bbMiddle;

    // P1-① fix: Tier 2 = max(bbUpper, entry + 2 × ATR) 또는 entry × 1.05 중 작은 쪽.
    //   기존 min(bbUpper, entry × 1.05) 가 좁은 BB 코인에서 너무 가까움.
    //   ATR 기반 floor 추가 → 변동성 큰 코인은 더 멀리 target.
    const atrTarget2 = atr > 0 ? entryPrice + 2 * atr : entryPrice * 1.05;
    const target2 = Math.min(
      Math.max(indicators.bbUpper, atrTarget2),
      entryPrice * 1.08, // 8% cap (너무 멀어지지 않도록)
    );

    // P0-① stop placement (ATR 1.5σ)
    let stopLoss: number;
    if (atr > 0) {
      const atrStop = entryPrice - 1.5 * atr;
      const floor = indicators.bbLower * 0.92;
      stopLoss = Math.max(atrStop, floor);
    } else {
      stopLoss = Math.max(indicators.bbLower * 0.97, entryPrice * 0.98);
    }

    const signalStrength = calculateSignalStrength(entryPrice, indicators);
    return { target1, target2, stopLoss, signalStrength };
  },
};

registerStrategy(bbdxStrategy);
