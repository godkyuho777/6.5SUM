/**
 * BBDX × Onchain Integration
 *
 * 명세서 §4 그대로:
 *
 *   진입 multiplier = 1 + onchain.score × 0.30
 *     score +1.0 → ×1.30
 *     score  0   → ×1.00
 *     score -1.0 → ×0.70
 *
 *   strong_distribution + 평균회귀 진입 → 차단 (자본 보호)
 *
 *   EXIT reversal_score 보정:
 *     distribution / strong_distribution → +0.15 (가속)
 *     strong_accumulation                → -0.10 (보류)
 *
 * 헌장 규칙 3 준수: 단독 시그널 X, BBDX 가중치로만 작동.
 */

import type { OnchainAdjustedEntry, OnchainScore } from "./types";

export interface BbdxSignalLike {
  /** 0~100 base strength (BBDX path 결과). */
  strength: number;
  /** 진입 path. 평균회귀(BB:Mean / BB:Snap)와 추세(BB:Riding) 구분. */
  path?: string | null;
}

export function applyOnchainToEntry(
  signal: BbdxSignalLike,
  onchain: OnchainScore
): OnchainAdjustedEntry {
  const multiplier = 1 + onchain.score * 0.30;

  // 자본 보호: strong_distribution 환경에서 BB:Riding 외 경로 차단.
  // (riding = 추세 추종이라 분배 환경에서도 살아남을 여지 있음)
  const isMeanReversion = signal.path !== "BB:Riding";
  if (onchain.regime === "strong_distribution" && isMeanReversion) {
    return {
      baseStrength: signal.strength,
      multiplier,
      finalStrength: 0,
      blocked: true,
      blockReason:
        "온체인 strong_distribution 환경에서 평균회귀 진입은 자본 보호 위해 차단",
      regime: onchain.regime,
      modifiers: onchain.modifiers,
    };
  }

  const final = Math.min(100, signal.strength * multiplier);
  return {
    baseStrength: signal.strength,
    multiplier,
    finalStrength: final,
    blocked: false,
    blockReason: null,
    regime: onchain.regime,
    modifiers: onchain.modifiers,
  };
}

/** BBDX EXIT reversal_score (v6.3 [EXIT-B]) 에 온체인 regime 보정 적용. */
export function applyOnchainToExit(
  baseReversalScore: number,
  onchain: OnchainScore
): { adjustedScore: number; delta: number; reason: string } {
  let delta = 0;
  let reason = "no onchain regime adjustment";

  if (onchain.regime === "distribution" || onchain.regime === "strong_distribution") {
    delta = +0.15;
    reason = "온체인 분배 신호 → EXIT 가속 (+0.15)";
  } else if (onchain.regime === "strong_accumulation") {
    delta = -0.10;
    reason = "온체인 강한 매집 → EXIT 보류 (-0.10)";
  }

  return {
    adjustedScore: baseReversalScore + delta,
    delta,
    reason,
  };
}
