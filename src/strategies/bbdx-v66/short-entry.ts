/**
 * BBDX v6.6 SHORT Entry — v6.5 SHORT 코어를 wrap + calibrated weights/threshold.
 *
 * 명세서 BBDX_v66_PERP §2.3 의 evaluate_short_v66 의사코드 구현.
 * v6.5 SHORT (`decideShortEntry`, `detectBBStructureShort`) 코드 절대 수정 X.
 *
 * 헌장 규칙 3 (단독 시그널 X): SHORT 도 BBDX 차원 안. multiplier 형태.
 */

import type {
  BBStructureShort,
  Candle,
  CandlePatternMatch,
  ShortEntryDecision,
  TechnicalIndicators,
} from "../../shared/types";
import {
  decideShortEntry,
  detectAllCandlePatterns,
  detectBBStructureShort,
  calculateBollingerBandsSeries,
  isRisingKnife,
  volumeRatio,
} from "../../indicators";
import { aggregatePatternScore } from "../../patterns/aggregator";
import {
  getThresholdForSignal,
  getWeightsForSignal,
} from "../weight-calibration";
import { extractScoreComponents } from "./score-components";

export interface V66ShortResult {
  side: "short";
  triggered: boolean;
  path?: "NUM" | "PTN" | "BB";
  decision?: ShortEntryDecision;
  finalScore: number;
  thresholdUsed: number;
  baseStrength: number;
  weightsUsed: { momentum: number; position: number; trend: number; volume: number; action: number };
  weightsSource: "self_backtest" | "external" | "default";
  thresholdSource: "self_backtest" | "external" | "default";
  shortStop: number | null;
  reasons: string[];
  meta: Record<string, unknown>;
}

export interface V66ShortInput {
  symbol: string;
  tf: string;
  candles: Candle[];
  windowCandles: Candle[];
  indicators: TechnicalIndicators;
  modifiersMult?: number;
}

/**
 * SHORT STOP LOSS (BBDX_v66_PERP §5.1) — 누락 영역 1 해결.
 *
 *   SHORT STOP = min(bbUpper × 1.03, entry × 1.02)
 *
 * 본 함수는 단순 indicator-based stop 만 제공. ATR / Fib 등 보강은 caller 가
 * 추가 (예: backtest/strategies/bbdx-short.ts).
 */
export function computeShortStopIndicator(
  entryPrice: number,
  indicators: TechnicalIndicators,
): number {
  const bbUpperStop = indicators.bbUpper * 1.03;
  const pctStop = entryPrice * 1.02;
  return Math.min(bbUpperStop, pctStop);
}

export async function evaluateShortV66(
  input: V66ShortInput,
): Promise<V66ShortResult> {
  const reasons: string[] = [];
  const ind = input.indicators;
  const last = input.windowCandles[input.windowCandles.length - 1];
  const price = last?.close ?? 0;

  // SHORT 자본 보호: Rising Knife 차단 (decideShortEntry 내부에서 처리되지만
  // graceful fallback 위해 명시).
  let bbStructureShort: BBStructureShort | null = null;
  let patterns: CandlePatternMatch[] = [];
  let volRatio = 0;
  try {
    patterns = detectAllCandlePatterns(input.windowCandles);
    volRatio = volumeRatio(input.windowCandles);
    const closes = input.windowCandles.map((c) => c.close);
    const bbSeries = calculateBollingerBandsSeries(closes);
    bbStructureShort = detectBBStructureShort(input.windowCandles, bbSeries);
  } catch (err) {
    console.warn(`[v66-short] indicator prep failed: ${(err as Error).message}`);
  }

  // graceful — risingKnife + non-lowerRiding = 차단 (decideShortEntry 와 동일)
  if (
    isRisingKnife(ind.plusDi, ind.minusDi, ind.adx) &&
    bbStructureShort !== "lowerRiding"
  ) {
    return {
      side: "short",
      triggered: false,
      finalScore: 0,
      thresholdUsed: 0,
      baseStrength: 0,
      weightsUsed: { momentum: 0, position: 0, trend: 0, volume: 0, action: 0 },
      weightsSource: "default",
      thresholdSource: "default",
      shortStop: null,
      reasons: ["Rising Knife 차단 (자본 보호)"],
      meta: {},
    };
  }

  const decision = decideShortEntry(
    input.windowCandles,
    ind,
    patterns,
    bbStructureShort,
    volRatio,
  );
  if (!decision) {
    return {
      side: "short",
      triggered: false,
      finalScore: 0,
      thresholdUsed: 0,
      baseStrength: 0,
      weightsUsed: { momentum: 0, position: 0, trend: 0, volume: 0, action: 0 },
      weightsSource: "default",
      thresholdSource: "default",
      shortStop: null,
      reasons: ["v6.5 decideShortEntry 미충족"],
      meta: {},
    };
  }
  reasons.push(`SHORT path: ${decision.path}`);
  decision.reasons.forEach((r) => reasons.push(r));

  // Bearish pattern confluence
  const bearishPatterns = patterns.filter((p) => p.bias === "bearish");
  const patternConfluence = aggregatePatternScore(bearishPatterns);

  // 5 카테고리 SHORT 점수 추출
  const scores = extractScoreComponents({
    price,
    indicators: ind,
    volRatio,
    patternConfluence,
    side: "short",
  });

  // Calibrated weights/threshold (SHORT side)
  const weights = await getWeightsForSignal({
    symbol: input.symbol,
    tf: input.tf,
    path: decision.path,
    side: "short",
  });
  const threshold = await getThresholdForSignal({
    symbol: input.symbol,
    tf: input.tf,
    side: "short",
  });

  const baseStrength =
    (weights.weights.momentum * scores.momentum +
      weights.weights.position * scores.position +
      weights.weights.trend * scores.trend +
      weights.weights.volume * scores.volume +
      weights.weights.action * scores.action) *
    100 *
    (input.modifiersMult ?? 1.0);

  const finalScore = Math.max(0, Math.min(100, baseStrength));
  const shortStop = computeShortStopIndicator(price, ind);

  return {
    side: "short",
    triggered: finalScore >= threshold.threshold,
    path: decision.path,
    decision,
    finalScore,
    thresholdUsed: threshold.threshold,
    baseStrength,
    weightsUsed: weights.weights,
    weightsSource: weights.source,
    thresholdSource: threshold.source,
    shortStop,
    reasons,
    meta: {
      scores,
      patternConfluence,
      weightsMetadata: weights.metadata,
      weightsStatus: weights.status,
      thresholdStatus: threshold.status,
      bbStructureShort,
    },
  };
}
