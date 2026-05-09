/**
 * [EXIT-B] Reversal score — Part II.1 §1.3.
 *
 * Replaces the defective v6.1 "ADX ≥ 30 OR +DI ≥ 25" standalone
 * triggers. The spec's correct interpretation: ADX is a strength
 * confirmation for +DI/-DI direction, never a standalone EXIT.
 *
 * Five-component weighted score (0..1):
 *   B1. +DI/-DI cross (0..0.40)   — direction reversal core signal
 *   B2. ADX > 25 AND -DI > +DI    (0..0.30)
 *   B3. Bearish pattern strength  (0..0.20) — only when ≥0.6
 *   B4. Trendline state           (0..0.30) — broken or confirmed-break
 *   B5. MACD bearish divergence   (0..0.20)
 *
 * Thresholds:
 *   ≥ 0.50 → full exit
 *   0.30..0.50 → partial 50% exit
 *   < 0.30 → no exit
 *
 * For B.1, B4 (trendline) and B5 (MACD divergence) are wired with
 * neutral (0) inputs because the project has no trendline/divergence
 * detector at the BE yet (the FE has fibonacci-engine.ts, but it's
 * client-side). Plumb both through in B.3.
 */

import type {
  CandlePatternMatch,
  ReversalScoreBreakdown,
  TechnicalIndicators,
} from "@shared/types";

export interface ReversalContext {
  indicators: TechnicalIndicators;
  bearishPatterns: CandlePatternMatch[];
  /** B.3 — set when trendline detection is wired. */
  trendlineState?: "intact" | "confirmed_break" | "broken";
  /** B.3 — set when MACD divergence detection is wired. */
  macdBearishDivergence?: boolean;
  /**
   * v6.5 §5.2 — macro regime boost on the reversal score.
   *   crisis  → +0.20
   *   tight   → +0.10
   *   flooded → -0.10
   *   neutral / easy → 0
   */
  macroRegime?: "crisis" | "tight" | "neutral" | "easy" | "flooded";
  /**
   * v6.5 §5.2 — onchain regime boost on the reversal score.
   *   strong_distribution → +0.20
   *   distribution        → +0.10
   *   strong_accumulation → multiplicative ×0.8 when rs < 0.7
   *   neutral / accumulation → 0
   */
  onchainRegime?:
    | "strong_distribution"
    | "distribution"
    | "neutral"
    | "accumulation"
    | "strong_accumulation";
}

export interface ReversalResult {
  score: number;
  breakdown: ReversalScoreBreakdown;
  reasons: string[];
}

export function computeReversalScore(ctx: ReversalContext): ReversalResult {
  const { indicators, bearishPatterns } = ctx;
  const reasons: string[] = [];

  // B1. +DI/-DI cross (core direction reversal).
  let diCross = 0;
  if (indicators.minusDi > indicators.plusDi) {
    const strength = (indicators.minusDi - indicators.plusDi) / 30;
    diCross = Math.min(0.4, Math.max(0, strength) * 0.4);
    if (diCross > 0) {
      reasons.push(
        `-DI ${indicators.minusDi.toFixed(1)} > +DI ${indicators.plusDi.toFixed(1)} (cross ${diCross.toFixed(2)})`
      );
    }
  }

  // B2. ADX > 25 with -DI > +DI (bear trend strengthening).
  let adxConfirmation = 0;
  if (indicators.adx > 25 && indicators.minusDi > indicators.plusDi) {
    const factor = Math.min(1.0, (indicators.adx - 25) / 15);
    adxConfirmation = factor * 0.3;
    reasons.push(
      `ADX ${indicators.adx.toFixed(1)} confirms bear direction (${adxConfirmation.toFixed(2)})`
    );
  }

  // B3. Bearish pattern strength (≥0.6 threshold per spec).
  let bearishPattern = 0;
  if (bearishPatterns.length > 0) {
    const strongest = Math.max(
      ...bearishPatterns.map((p) => p.strength / 100)
    );
    if (strongest >= 0.6) {
      bearishPattern = strongest * 0.2;
      reasons.push(
        `Bearish pattern strength ${strongest.toFixed(2)} (${bearishPattern.toFixed(2)})`
      );
    }
  }

  // B4. Trendline state (B.3 wiring — currently 0).
  let trendlineBreak = 0;
  if (ctx.trendlineState === "broken") {
    trendlineBreak = 0.3;
    reasons.push("Uptrend trendline broken (0.30)");
  } else if (ctx.trendlineState === "confirmed_break") {
    trendlineBreak = 0.15;
    reasons.push("Uptrend trendline confirmed-break (0.15)");
  }

  // B5. MACD bearish divergence (B.3 wiring — currently 0).
  let macdDivergence = 0;
  if (ctx.macdBearishDivergence) {
    macdDivergence = 0.2;
    reasons.push("MACD bearish divergence (0.20)");
  }

  // Base reversal score (5-component v6.3 sum).
  const baseScore =
    diCross + adxConfirmation + bearishPattern + trendlineBreak + macdDivergence;

  // v6.5 §5.2 — macro boost.
  let macroBoost = 0;
  if (ctx.macroRegime === "crisis") {
    macroBoost = 0.2;
    reasons.push("Macro crisis regime (+0.20)");
  } else if (ctx.macroRegime === "tight") {
    macroBoost = 0.1;
    reasons.push("Macro tight regime (+0.10)");
  } else if (ctx.macroRegime === "flooded") {
    macroBoost = -0.1;
    reasons.push("Macro flooded regime (-0.10) — bull environment, EXIT damped");
  }

  // v6.5 §5.2 — onchain boost.
  let onchainBoost = 0;
  let strongAccumulationDamp = false;
  if (ctx.onchainRegime === "strong_distribution") {
    onchainBoost = 0.2;
    reasons.push("Onchain strong distribution (+0.20)");
  } else if (ctx.onchainRegime === "distribution") {
    onchainBoost = 0.1;
    reasons.push("Onchain distribution (+0.10)");
  } else if (ctx.onchainRegime === "strong_accumulation") {
    // Multiplicative damp (×0.8) applied below when score < 0.7.
    strongAccumulationDamp = true;
  }

  let total = baseScore + macroBoost + onchainBoost;
  if (strongAccumulationDamp && total < 0.7) {
    const before = total;
    total = total * 0.8;
    reasons.push(
      `Onchain strong accumulation — damped weak reversal ${before.toFixed(2)} → ${total.toFixed(2)} (×0.8)`
    );
  }

  return {
    score: total,
    breakdown: {
      diCross,
      adxConfirmation,
      bearishPattern,
      trendlineBreak,
      macdDivergence,
      macroBoost,
      onchainBoost,
      total,
    },
    reasons,
  };
}

export interface ReversalDecision {
  action: "full_exit" | "partial_exit" | null;
  ratio: number;
  score: number;
  breakdown: ReversalScoreBreakdown;
  reasons: string[];
}

/** Apply v6.3 thresholds: 0.50 full / 0.30 partial. */
export function decideReversal(
  ctx: ReversalContext,
  thresholds: { full: number; partial: number } = { full: 0.5, partial: 0.3 }
): ReversalDecision {
  const r = computeReversalScore(ctx);
  if (r.score >= thresholds.full) {
    return {
      action: "full_exit",
      ratio: 1.0,
      score: r.score,
      breakdown: r.breakdown,
      reasons: r.reasons,
    };
  }
  if (r.score >= thresholds.partial) {
    return {
      action: "partial_exit",
      ratio: 0.5,
      score: r.score,
      breakdown: r.breakdown,
      reasons: r.reasons,
    };
  }
  return {
    action: null,
    ratio: 0,
    score: r.score,
    breakdown: r.breakdown,
    reasons: r.reasons,
  };
}
