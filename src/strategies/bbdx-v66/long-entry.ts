/**
 * BBDX v6.6 LONG Entry — v6.5 코어를 wrap + calibrated weights/threshold 적용.
 *
 * v6.5 코드 절대 수정 X. `decideEntry` + 보조 modifier 결과를 그대로 받아
 * (1) 5 카테고리 점수 추출 → (2) calibrated weights 와 곱해 base_strength →
 * (3) calibrated threshold 와 비교.
 *
 * 헌장 규칙 3 (단독 시그널 X): v6.5 의 BBDX 코어 통과한 시그널에 대해서만
 * 가중치 + 임계 calibration 을 적용. BBDX 진입 룰은 변경 X.
 */

import type {
  BBStructure,
  Candle,
  CandlePatternMatch,
  EntryDecision,
  TechnicalIndicators,
} from "../../shared/types";
import {
  decideEntry,
  detectAllCandlePatterns,
  detectBBStructure,
  calculateBollingerBandsSeries,
  isFallingKnife,
  volumeRatio,
} from "../../indicators";
import { aggregatePatternScore } from "../../patterns/aggregator";
import {
  getThresholdForSignal,
  getWeightsForSignal,
} from "../weight-calibration";
import { extractScoreComponents } from "./score-components";

export interface V66LongResult {
  side: "long";
  triggered: boolean;
  path?: "NUM" | "PTN" | "BB";
  decision?: EntryDecision;
  finalScore: number;
  thresholdUsed: number;
  baseStrength: number;
  weightsUsed: { momentum: number; position: number; trend: number; volume: number; action: number };
  weightsSource: "self_backtest" | "external" | "default";
  thresholdSource: "self_backtest" | "external" | "default";
  reasons: string[];
  meta: Record<string, unknown>;
}

export interface V66LongInput {
  symbol: string;
  tf: string;
  candles: Candle[];
  windowCandles: Candle[];
  indicators: TechnicalIndicators;
  /** 옵션 보조 modifier 곱셈 (이미 적용된 multiplier 곱) — default 1.0 */
  modifiersMult?: number;
}

export async function evaluateLongV66(
  input: V66LongInput,
): Promise<V66LongResult> {
  const reasons: string[] = [];
  const ind = input.indicators;
  const last = input.windowCandles[input.windowCandles.length - 1];
  const price = last?.close ?? 0;

  // Gate 1: Falling Knife
  if (isFallingKnife(ind.plusDi, ind.minusDi, ind.adx)) {
    return {
      side: "long",
      triggered: false,
      finalScore: 0,
      thresholdUsed: 0,
      baseStrength: 0,
      weightsUsed: { momentum: 0, position: 0, trend: 0, volume: 0, action: 0 },
      weightsSource: "default",
      thresholdSource: "default",
      reasons: ["Falling Knife 차단"],
      meta: {},
    };
  }

  // Gate 2: v6.5 decideEntry (BB > PTN > NUM)
  let patterns: CandlePatternMatch[] = [];
  let bbStructure: BBStructure | null = null;
  let volRatio = 0;
  try {
    patterns = detectAllCandlePatterns(input.windowCandles);
    volRatio = volumeRatio(input.windowCandles);
    const closes = input.windowCandles.map((c) => c.close);
    const bbSeries = calculateBollingerBandsSeries(closes);
    bbStructure = detectBBStructure(input.windowCandles, bbSeries);
  } catch (err) {
    console.warn(`[v66-long] indicator prep failed: ${(err as Error).message}`);
  }

  const decision = decideEntry(
    input.windowCandles,
    ind,
    patterns,
    bbStructure,
    volRatio,
  );
  if (!decision) {
    return {
      side: "long",
      triggered: false,
      finalScore: 0,
      thresholdUsed: 0,
      baseStrength: 0,
      weightsUsed: { momentum: 0, position: 0, trend: 0, volume: 0, action: 0 },
      weightsSource: "default",
      thresholdSource: "default",
      reasons: ["v6.5 decideEntry 미충족"],
      meta: {},
    };
  }
  reasons.push(`Entry path: ${decision.path}`);
  decision.reasons.forEach((r) => reasons.push(r));

  // Pattern confluence
  const bullishPatterns = patterns.filter((p) => p.bias === "bullish");
  const patternConfluence = aggregatePatternScore(bullishPatterns);

  // 5 카테고리 점수 추출
  const scores = extractScoreComponents({
    price,
    indicators: ind,
    volRatio,
    patternConfluence,
    side: "long",
  });

  // Calibrated weights + threshold
  const weights = await getWeightsForSignal({
    symbol: input.symbol,
    tf: input.tf,
    path: decision.path,
    side: "long",
  });
  const threshold = await getThresholdForSignal({
    symbol: input.symbol,
    tf: input.tf,
    side: "long",
  });

  // base_strength = weighted sum × 100
  const baseStrength =
    (weights.weights.momentum * scores.momentum +
      weights.weights.position * scores.position +
      weights.weights.trend * scores.trend +
      weights.weights.volume * scores.volume +
      weights.weights.action * scores.action) *
    100 *
    (input.modifiersMult ?? 1.0);

  // 최종 score (보조 modifier 미적용 단순 형태 — wave/macro/onchain 은 호출측 책임)
  const finalScore = Math.max(0, Math.min(100, baseStrength));

  return {
    side: "long",
    triggered: finalScore >= threshold.threshold,
    path: decision.path,
    decision,
    finalScore,
    thresholdUsed: threshold.threshold,
    baseStrength,
    weightsUsed: weights.weights,
    weightsSource: weights.source,
    thresholdSource: threshold.source,
    reasons,
    meta: {
      scores,
      patternConfluence,
      weightsMetadata: weights.metadata,
      weightsStatus: weights.status,
      thresholdStatus: threshold.status,
    },
  };
}
