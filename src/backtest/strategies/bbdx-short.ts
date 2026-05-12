/**
 * BBDX SHORT Strategy (P1-#3, 2026-05-10) — `decideShortEntry` 미러.
 *
 * `bbdx.ts` (LONG) 의 dual mirror. RSI 평균회귀 *상단* + BB 상단 + ADX 약함
 * + bearish Pattern Confluence + Higher-TF SMA(50) 약세 게이트.
 *
 * 진입 게이트 (4단계 직렬, LONG 미러):
 *   1. decideShortEntry — RSI 62~75, BB upper×0.98, ADX≤20 (NUM)
 *      OR bearish pattern + BB upper×0.95 + ADX≤25 (PTN)
 *      OR detectBBStructureShort 결과 (BB)
 *   2. Rising Knife 차단 — `decideShortEntry` 내부에서 처리됨
 *   3. Pattern Confluence — bearishPatterns aggregatePatternScore ≥ 0.4
 *   4. Higher-TF SMA(50) — SMA +1% 이상 상승 + price > SMA 시 차단 (LONG 미러)
 *
 * Tier 1/2 부분 청산 (R:R 비대칭화 미러):
 *   Tier 1: bbMiddle 도달 (price 하락) → 50%
 *   Tier 2: max(bbLower, entry × 0.95) → 잔여 50%
 *   Stop:   min(bbUpper × 1.03, entry × 1.02)
 *
 * Modifier 추적 (Phase 2): MACD × Order Block 의 *부호 반전*
 *   long mult 1.20 → short mult 0.80 (`invertMultiplier(2 - x)`)
 *
 * 헌장:
 *   - R1 차원: 1 momentum (RSI), 2 volatility (BB), 3 trend (ADX), 5 structure (pattern)
 *   - R2 alpha: 본 strategy 가 backtest CLI 에서 실행 가능 — Wilson CI / winRate / Sharpe 측정
 *   - R3 단독 X: BBDX core 의 SHORT mirror — 통과
 *   - Capital protection: Rising Knife 차단 + Tier 1 stop 보존
 */

import type { Candle, TechnicalIndicators, BBStructureShort } from "@shared/types";
import {
  decideShortEntry,
  detectAllCandlePatterns,
  detectBBStructureShort,
  calculateBollingerBandsSeries,
  calculateShortSignalStrength,
  volumeRatio,
  volumeConfirmationFromRatio,
} from "../../indicators";
import { aggregatePatternScore } from "../../patterns/aggregator";
import {
  detectMacdDivergence,
  detectOrderBlock,
} from "../../modifiers";
import type { BacktestStrategy, EntryEvaluation, EntryParams } from "./types";
import { registerStrategy } from "./types";

/**
 * Higher-TF context — LONG 미러의 *부호 반전*.
 *
 * BULLISH 차단: SMA +1% 이상 상승 + price > SMA → LONG 환경, SHORT 거부.
 */
function checkHigherTfBearish(candles: Candle[], idx: number): boolean {
  if (idx < 50) return true;
  const slice = candles.slice(Math.max(0, idx - 49), idx + 1);
  const closes = slice.map((c) => c.close);
  const smaCurrent = closes.reduce((a, b) => a + b, 0) / closes.length;

  const idxBack = idx - 20;
  if (idxBack < 50) return candles[idx].close <= smaCurrent;
  const sliceBack = candles.slice(Math.max(0, idxBack - 49), idxBack + 1);
  const closesBack = sliceBack.map((c) => c.close);
  const smaBack = closesBack.reduce((a, b) => a + b, 0) / closesBack.length;

  const slope = (smaCurrent - smaBack) / smaBack;
  const priceBelow = candles[idx].close <= smaCurrent;
  if (slope > 0.01 && !priceBelow) return false;
  return true;
}

/** SHORT modifier 부호 반전 — scanner.ts 의 invertMultiplier 와 동일. */
function invertMultiplier(longMult: number): number {
  if (!Number.isFinite(longMult)) return 1.0;
  const inverted = 2 - longMult;
  return Math.max(0.30, Math.min(2.0, inverted));
}

export const bbdxShortStrategy: BacktestStrategy = {
  name: "bbdx-short",
  label: "BBDX SHORT (RSI / BB / ADX)",
  description:
    "v6.5 SHORT mirror — RSI 62~75 평균회귀 + BB 상단 + ADX 약함 + Pattern Confluence + Higher-TF",
  dimensionsCovered: [1, 2, 3, 5],
  side: "short",

  shouldEnter(
    candles: Candle[],
    idx: number,
    indicators: TechnicalIndicators,
    windowCandles: Candle[],
  ): EntryEvaluation {
    const reasons: string[] = [];

    // Gate 1: BB 시리즈로 SHORT 구조 감지
    let bbStructureShort: BBStructureShort | null = null;
    try {
      const closes = windowCandles.map((c) => c.close);
      const bbSeries = calculateBollingerBandsSeries(closes);
      bbStructureShort = detectBBStructureShort(windowCandles, bbSeries);
    } catch {
      bbStructureShort = null;
    }

    // Gate 2: 패턴 + 거래량 비율 산출 (decideShortEntry 입력)
    const patterns = detectAllCandlePatterns(windowCandles);
    const ratio = volumeRatio(windowCandles);

    // Gate 3: decideShortEntry — Rising Knife 차단 내장됨 (P1-#3 fix)
    const decision = decideShortEntry(
      windowCandles,
      indicators,
      patterns,
      bbStructureShort,
      ratio,
    );
    if (!decision) return { entry: false };
    reasons.push(`SHORT path: ${decision.path}`);
    decision.reasons.forEach((r) => reasons.push(r));

    // Gate 4: Pattern Confluence ≥ 0.4 (bearish)
    const bearishPatterns = patterns.filter((p) => p.bias === "bearish");
    const patternConfluenceScore = aggregatePatternScore(bearishPatterns);
    if (patternConfluenceScore < 0.4) return { entry: false };
    reasons.push(
      `Bearish Pattern Confluence ${(patternConfluenceScore * 100).toFixed(0)} ≥ 40`,
    );

    // Gate 5: Higher-TF SMA(50) bearish/sideways
    const higherTfBearish = checkHigherTfBearish(candles, idx);
    if (!higherTfBearish) return { entry: false };
    reasons.push("Higher-TF SMA(50) bearish/sideways");

    // Phase 2: Modifier multipliers (graceful — 차단 X)
    let macdDivergenceMult = 1.0;
    let orderBlockMult = 1.0;
    try {
      // SHORT 는 LONG mult 부호 반전
      macdDivergenceMult = invertMultiplier(
        detectMacdDivergence(windowCandles).multiplier,
      );
      orderBlockMult = invertMultiplier(detectOrderBlock(windowCandles).multiplier);
    } catch {
      /* graceful */
    }
    const modifiersProduct = macdDivergenceMult * orderBlockMult;

    return {
      entry: true,
      reasons,
      metadata: {
        patternConfluenceScore,
        higherTfBearish,
        macdDivergenceMult,
        orderBlockMult,
        modifiersProduct,
        shortPath: decision.path,
        bbStructureShort: decision.bbStructure ?? null,
      },
    };
  },

  getEntryParams(
    _candles: Candle[],
    _idx: number,
    indicators: TechnicalIndicators,
    entryPrice: number,
  ): EntryParams {
    // SHORT R:R 비대칭화 미러 (alpha 튜닝 2026-05-10):
    //   Tier 1 = bbMiddle (price 하락 시 도달)
    //   Tier 2 = max(bbLower, entry × 0.97) — entry-3% 도달이 -5% 보다 흔함
    //            (가) 결과: tier1_then_stop 37.7% dominant — Tier 2 도달 X 후
    //            잔여 50% 손절. Tier 2 보수화로 expectancy 회복 시도.
    //   Stop  = min(bbUpper × 1.03, entry × 1.02)
    const target1 = indicators.bbMiddle;
    const target2 = Math.max(indicators.bbLower, entryPrice * 0.97);
    const stopLoss = Math.min(indicators.bbUpper * 1.03, entryPrice * 1.02);

    // SHORT signal strength — calculateShortSignalStrength 사용
    const ratio = 0; // strategy 호출 시 windowCandles 미접근 — 신호 강도 보수적 추정
    const volConfirmation = volumeConfirmationFromRatio(ratio);
    const signalStrength = calculateShortSignalStrength(
      entryPrice,
      indicators,
      volConfirmation,
    );

    return { target1, target2, stopLoss, signalStrength };
  },
};

registerStrategy(bbdxShortStrategy);
