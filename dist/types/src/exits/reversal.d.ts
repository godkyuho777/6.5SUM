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
import type { CandlePatternMatch, ReversalScoreBreakdown, TechnicalIndicators } from "@shared/types";
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
    onchainRegime?: "strong_distribution" | "distribution" | "neutral" | "accumulation" | "strong_accumulation";
}
export interface ReversalResult {
    score: number;
    breakdown: ReversalScoreBreakdown;
    reasons: string[];
}
export declare function computeReversalScore(ctx: ReversalContext): ReversalResult;
export interface ReversalDecision {
    action: "full_exit" | "partial_exit" | null;
    ratio: number;
    score: number;
    breakdown: ReversalScoreBreakdown;
    reasons: string[];
}
/** Apply v6.3 thresholds: 0.50 full / 0.30 partial. */
export declare function decideReversal(ctx: ReversalContext, thresholds?: {
    full: number;
    partial: number;
}): ReversalDecision;
