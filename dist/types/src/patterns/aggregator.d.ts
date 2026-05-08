/**
 * Look-ahead safe pattern aggregator — Part III.1 §5.3 / §5.4.
 *
 * The critical contract: `detectPatternsAtIndex(candles, currentIdx)`
 * returns the same result regardless of what data exists past
 * `currentIdx`. This is enforced by the predicates only ever reading
 * `candles[j]` for `j ≤ currentIdx`, and by the aggregator slicing
 * before calling them.
 *
 * Unlike the legacy detectAtIndex in indicators.ts (which deduped by
 * priority and threw away information), this aggregator returns ALL
 * matches and lets the consumer aggregate via max + bonus. This way
 * confluence (engulfing + hammer in the same bar) shows up as higher
 * strength rather than being silently lost.
 */
import type { Candle, CandlePatternMatch } from "@shared/types";
/**
 * Detect every pattern that formed at any candle in
 * `[currentIdx - lookback + 1, currentIdx]`.
 *
 * **Look-ahead safe** — only reads `candles[j]` for `j ≤ currentIdx`.
 *
 * Returns CandlePatternMatch[] with `strength` in 0–100 (mapped from
 * 0–1 base × context multipliers, then ×100 to match the existing
 * shared-type contract).
 */
export declare function detectPatternsAtIndex(candles: Candle[], currentIdx: number, lookback?: number): CandlePatternMatch[];
/**
 * Aggregate multiple pattern matches into a single confluence score.
 *
 * Per Part III.1 §5.4: instead of dedup, use max + bonus.
 *   primary = max(strength × ageDiscount)
 *   bonus = min(0.20, (n - 1) × 0.10)
 *   final = min(1.0, primary + bonus)
 *
 * Age discount: exp(-candlesAgo / 3) — recent matches dominate.
 *
 * Returns a value in [0, 1].
 */
export declare function aggregatePatternScore(detected: CandlePatternMatch[]): number;
/**
 * Count detected patterns by bias — used by reversal scoring and EXIT
 * category B to know whether bearish patterns are present.
 */
export declare function countByBias(detected: CandlePatternMatch[]): {
    bullish: number;
    bearish: number;
};
