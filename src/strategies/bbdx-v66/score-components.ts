/**
 * BBDX v6.6 — 5 카테고리 점수 추출.
 *
 * v6.5 시그널의 indicators + path 정보로부터 (momentum, position, trend, volume,
 * action) 5축 점수를 0~1 정규화. calibrated weights 와 곱해 base_strength 산출.
 *
 *   momentum: RSI 의 진입영역 깊이 (LONG: 35→25 가까울수록 ↑, SHORT: 65→75)
 *   position: BB 위치 (LONG: 하단, SHORT: 상단)
 *   trend:    ADX 약세 (낮을수록 평균회귀 환경 ↑) — 'trend_weakness' 로 해석
 *   volume:   volRatio 이상치
 *   action:   detect된 패턴 confluence
 *
 * 헌장 규칙 1 (차원 중복 X): v6.5 와 같은 indicators 를 다른 각도로 측정.
 */

import type { TechnicalIndicators } from "../../shared/types";
import type { WeightSide } from "../weight-calibration";

export interface ScoreComponents {
  momentum: number;
  position: number;
  trend: number;
  volume: number;
  action: number;
}

// v6.5 임계값 mirror
const LONG_RSI_LOW = 25;
const LONG_RSI_HIGH = 38;
const SHORT_RSI_LOW = 62;
const SHORT_RSI_HIGH = 75;

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * LONG: RSI 25 가까울수록 점수 1, 38 이상이면 0.
 * SHORT: RSI 75 가까울수록 점수 1, 62 이하면 0.
 */
function momentumScore(rsi: number, side: WeightSide): number {
  if (side === "long") {
    // 25 → 1.0, 38 → 0.0
    return clamp01((LONG_RSI_HIGH - rsi) / (LONG_RSI_HIGH - LONG_RSI_LOW));
  } else {
    // 75 → 1.0, 62 → 0.0
    return clamp01((rsi - SHORT_RSI_LOW) / (SHORT_RSI_HIGH - SHORT_RSI_LOW));
  }
}

/**
 * LONG: BB 하단에 가까울수록 1, 상단에서 0.
 * SHORT: BB 상단에 가까울수록 1, 하단에서 0.
 */
function positionScore(
  price: number,
  ind: TechnicalIndicators,
  side: WeightSide,
): number {
  const range = ind.bbUpper - ind.bbLower;
  if (range <= 0) return 0;
  if (side === "long") {
    return clamp01(1 - (price - ind.bbLower) / range);
  } else {
    return clamp01((price - ind.bbLower) / range);
  }
}

/**
 * Trend weakness: ADX 낮을수록 점수 ↑ (평균회귀 환경 선호).
 *   ADX 0 → 1, ADX 40+ → 0
 * v6.6 헌장 — 추세장 추종 시 별도 modifier 가 처리.
 */
function trendWeaknessScore(adx: number): number {
  return clamp01(1 - adx / 40);
}

/**
 * Volume confirmation: volRatio (현재 거래량 / 평균 거래량).
 *   1.0 (평균) → 0.5, 2.0+ → 1.0, 0.5 → 0.25
 */
function volumeScore(volRatio: number): number {
  if (volRatio <= 0) return 0;
  return clamp01(volRatio / 2);
}

/**
 * Action: 패턴 confluence score (이미 0~1 정규화됨).
 *   detectAllCandlePatterns + aggregatePatternScore 결과 직접 사용.
 */
function actionScore(patternConfluence: number): number {
  return clamp01(patternConfluence);
}

export interface ScoreExtractInput {
  price: number;
  indicators: TechnicalIndicators;
  volRatio: number;
  patternConfluence: number;
  side: WeightSide;
}

export function extractScoreComponents(
  input: ScoreExtractInput,
): ScoreComponents {
  return {
    momentum: momentumScore(input.indicators.rsi, input.side),
    position: positionScore(input.price, input.indicators, input.side),
    trend: trendWeaknessScore(input.indicators.adx),
    volume: volumeScore(input.volRatio),
    action: actionScore(input.patternConfluence),
  };
}
