/**
 * Candlestick pattern definitions — exact formulas (no natural-language).
 *
 * Per Pattern Audit (Part III.1) critical defect #1: every predicate
 * must be a precise mathematical condition. These functions are pure
 * and operate only on the candles passed in (no global state, no
 * lookups beyond their inputs). Combined with detectPatternsAtIndex
 * (`aggregator.ts`), they are look-ahead safe.
 *
 * patternBase values follow Part III.1 §5.1 / §5.3 / §5.4 starting
 * recommendations. They stay intuited until the calibration pipeline
 * (B.4 tier) replaces them with measured win-rates. UI must label
 * pattern strength as "beta — calibration pending".
 */
import type { Candle, CandlePatternName } from "@shared/types";
export interface CandleMetrics {
    /** |close - open| */
    body: number;
    /** high - low */
    range: number;
    /** high - max(open, close) */
    upperWick: number;
    /** min(open, close) - low */
    lowerWick: number;
    /** close >= open */
    isBull: boolean;
}
export declare function getMetrics(c: Candle): CandleMetrics;
/**
 * Hammer (Tradelab standard).
 *   lower wick ≥ body × 2
 *   upper wick ≤ body × 0.5
 *   body within 5–40% of range
 */
export declare function isHammer(c: Candle): boolean;
/**
 * Inverted hammer.
 *   upper wick ≥ body × 2
 *   lower wick ≤ body × 0.5
 */
export declare function isInvertedHammer(c: Candle): boolean;
/**
 * Bullish pin bar.
 *   lower wick / range ≥ 0.6
 *   body / range ≤ 0.30
 *   upper wick / range ≤ 0.20
 *   bull body
 */
export declare function isBullishPinBar(c: Candle): boolean;
/** Doji — body / range < threshold (default 10%). */
export declare function isDoji(c: Candle, threshold?: number): boolean;
/**
 * Bullish engulfing.
 *   prev candle is bearish, curr candle is bullish
 *   curr.open ≤ prev.close
 *   curr.close ≥ prev.open
 *   curr body > prev body × 0.8
 */
export declare function isBullishEngulfing(prev: Candle, curr: Candle): boolean;
/**
 * Bearish engulfing — mirror of bullish engulfing.
 */
export declare function isBearishEngulfing(prev: Candle, curr: Candle): boolean;
/**
 * Morning star.
 *   c1 strong bear (body / range ≥ 0.5)
 *   c2 small body (body / range ≤ 0.30)
 *   c3 strong bull (body / range ≥ 0.5)
 *   c3 close > midpoint(c1.open, c1.close)
 */
export declare function isMorningStar(c1: Candle, c2: Candle, c3: Candle): boolean;
/**
 * Evening star — mirror of morning star.
 */
export declare function isEveningStar(c1: Candle, c2: Candle, c3: Candle): boolean;
/**
 * Three white soldiers.
 *   3 consecutive bullish candles, ascending closes
 *   each open inside the prior body
 *   each body is ≥ 50% of its candle range
 */
export declare function isThreeWhiteSoldiers(c1: Candle, c2: Candle, c3: Candle): boolean;
/**
 * Three black crows — mirror of three white soldiers.
 */
export declare function isThreeBlackCrows(c1: Candle, c2: Candle, c3: Candle): boolean;
/**
 * Starting base values [0, 1] from spec. These are intuited per
 * Pattern Audit defect #2 and stay tagged "beta" until the B.4
 * calibration pipeline measures realized win-rates per pattern.
 */
export declare const PATTERN_BASE: Readonly<Record<CandlePatternName, number>>;
/** Bias of each pattern (used by aggregator + context multipliers). */
export declare const PATTERN_BIAS: Readonly<Record<CandlePatternName, "bullish" | "bearish" | "neutral">>;
