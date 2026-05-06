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

export function getMetrics(c: Candle): CandleMetrics {
  return {
    body: Math.abs(c.close - c.open),
    range: c.high - c.low,
    upperWick: c.high - Math.max(c.open, c.close),
    lowerWick: Math.min(c.open, c.close) - c.low,
    isBull: c.close >= c.open,
  };
}

// ──────────────────────────────────────────────────────────────────
// Single-candle patterns
// ──────────────────────────────────────────────────────────────────

/**
 * Hammer (Tradelab standard).
 *   lower wick ≥ body × 2
 *   upper wick ≤ body × 0.5
 *   body within 5–40% of range
 */
export function isHammer(c: Candle): boolean {
  const m = getMetrics(c);
  if (m.range === 0) return false;
  if (m.body === 0) return false; // doji-like, not hammer
  return (
    m.lowerWick >= m.body * 2.0 &&
    m.upperWick <= m.body * 0.5 &&
    m.body / m.range >= 0.05 &&
    m.body / m.range <= 0.4
  );
}

/**
 * Inverted hammer.
 *   upper wick ≥ body × 2
 *   lower wick ≤ body × 0.5
 */
export function isInvertedHammer(c: Candle): boolean {
  const m = getMetrics(c);
  if (m.range === 0) return false;
  if (m.body === 0) return false;
  return (
    m.upperWick >= m.body * 2.0 &&
    m.lowerWick <= m.body * 0.5 &&
    m.body / m.range >= 0.05 &&
    m.body / m.range <= 0.4
  );
}

/**
 * Bullish pin bar.
 *   lower wick / range ≥ 0.6
 *   body / range ≤ 0.30
 *   upper wick / range ≤ 0.20
 *   bull body
 */
export function isBullishPinBar(c: Candle): boolean {
  const m = getMetrics(c);
  if (m.range === 0) return false;
  return (
    m.lowerWick / m.range >= 0.6 &&
    m.body / m.range <= 0.3 &&
    m.upperWick / m.range <= 0.2 &&
    c.close > c.open
  );
}

/** Doji — body / range < threshold (default 10%). */
export function isDoji(c: Candle, threshold = 0.1): boolean {
  const m = getMetrics(c);
  if (m.range === 0) return false;
  return m.body / m.range < threshold;
}

// ──────────────────────────────────────────────────────────────────
// Two-candle patterns
// ──────────────────────────────────────────────────────────────────

/**
 * Bullish engulfing.
 *   prev candle is bearish, curr candle is bullish
 *   curr.open ≤ prev.close
 *   curr.close ≥ prev.open
 *   curr body > prev body × 0.8
 */
export function isBullishEngulfing(prev: Candle, curr: Candle): boolean {
  const prevBear = prev.close < prev.open;
  const currBull = curr.close > curr.open;
  if (!prevBear || !currBull) return false;
  const prevBody = Math.abs(prev.close - prev.open);
  const currBody = Math.abs(curr.close - curr.open);
  return (
    curr.open <= prev.close &&
    curr.close >= prev.open &&
    currBody > prevBody * 0.8
  );
}

/**
 * Bearish engulfing — mirror of bullish engulfing.
 */
export function isBearishEngulfing(prev: Candle, curr: Candle): boolean {
  const prevBull = prev.close > prev.open;
  const currBear = curr.close < curr.open;
  if (!prevBull || !currBear) return false;
  const prevBody = Math.abs(prev.close - prev.open);
  const currBody = Math.abs(curr.close - curr.open);
  return (
    curr.open >= prev.close &&
    curr.close <= prev.open &&
    currBody > prevBody * 0.8
  );
}

// ──────────────────────────────────────────────────────────────────
// Three-candle patterns
// ──────────────────────────────────────────────────────────────────

/**
 * Morning star.
 *   c1 strong bear (body / range ≥ 0.5)
 *   c2 small body (body / range ≤ 0.30)
 *   c3 strong bull (body / range ≥ 0.5)
 *   c3 close > midpoint(c1.open, c1.close)
 */
export function isMorningStar(c1: Candle, c2: Candle, c3: Candle): boolean {
  const m1 = getMetrics(c1);
  const m2 = getMetrics(c2);
  const m3 = getMetrics(c3);
  const c1Bear = c1.close < c1.open;
  const c3Bull = c3.close > c3.open;
  if (!c1Bear || !c3Bull) return false;
  if (m1.range === 0 || m3.range === 0) return false;
  const c2Body = m2.body / Math.max(m2.range, 1e-9);
  return (
    m1.body / m1.range >= 0.5 &&
    c2Body <= 0.3 &&
    m3.body / m3.range >= 0.5 &&
    c3.close > (c1.open + c1.close) / 2
  );
}

/**
 * Evening star — mirror of morning star.
 */
export function isEveningStar(c1: Candle, c2: Candle, c3: Candle): boolean {
  const m1 = getMetrics(c1);
  const m2 = getMetrics(c2);
  const m3 = getMetrics(c3);
  const c1Bull = c1.close > c1.open;
  const c3Bear = c3.close < c3.open;
  if (!c1Bull || !c3Bear) return false;
  if (m1.range === 0 || m3.range === 0) return false;
  const c2Body = m2.body / Math.max(m2.range, 1e-9);
  return (
    m1.body / m1.range >= 0.5 &&
    c2Body <= 0.3 &&
    m3.body / m3.range >= 0.5 &&
    c3.close < (c1.open + c1.close) / 2
  );
}

/**
 * Three white soldiers.
 *   3 consecutive bullish candles, ascending closes
 *   each open inside the prior body
 *   each body is ≥ 50% of its candle range
 */
export function isThreeWhiteSoldiers(c1: Candle, c2: Candle, c3: Candle): boolean {
  const allBull =
    c1.close > c1.open && c2.close > c2.open && c3.close > c3.open;
  if (!allBull) return false;
  const ascending = c2.close > c1.close && c3.close > c2.close;
  if (!ascending) return false;
  const opensInside =
    c2.open >= c1.open &&
    c2.open <= c1.close &&
    c3.open >= c2.open &&
    c3.open <= c2.close;
  if (!opensInside) return false;
  const m1 = getMetrics(c1);
  const m2 = getMetrics(c2);
  const m3 = getMetrics(c3);
  if (m1.range === 0 || m2.range === 0 || m3.range === 0) return false;
  return (
    m1.body / m1.range >= 0.5 &&
    m2.body / m2.range >= 0.5 &&
    m3.body / m3.range >= 0.5
  );
}

/**
 * Three black crows — mirror of three white soldiers.
 */
export function isThreeBlackCrows(c1: Candle, c2: Candle, c3: Candle): boolean {
  const allBear =
    c1.close < c1.open && c2.close < c2.open && c3.close < c3.open;
  if (!allBear) return false;
  const descending = c2.close < c1.close && c3.close < c2.close;
  if (!descending) return false;
  const opensInside =
    c2.open <= c1.open &&
    c2.open >= c1.close &&
    c3.open <= c2.open &&
    c3.open >= c2.close;
  if (!opensInside) return false;
  const m1 = getMetrics(c1);
  const m2 = getMetrics(c2);
  const m3 = getMetrics(c3);
  if (m1.range === 0 || m2.range === 0 || m3.range === 0) return false;
  return (
    m1.body / m1.range >= 0.5 &&
    m2.body / m2.range >= 0.5 &&
    m3.body / m3.range >= 0.5
  );
}

// ──────────────────────────────────────────────────────────────────
// patternBase registry — Part III.1 §5 starting values.
// ──────────────────────────────────────────────────────────────────

/**
 * Starting base values [0, 1] from spec. These are intuited per
 * Pattern Audit defect #2 and stay tagged "beta" until the B.4
 * calibration pipeline measures realized win-rates per pattern.
 */
export const PATTERN_BASE: Readonly<Record<CandlePatternName, number>> = {
  engulfing: 0.85,
  morningStar: 0.9,
  hammer: 0.7,
  invertedHammer: 0.65,
  pinBar: 0.7,
  doji: 0.4,
  threeWhiteSoldiers: 0.85,
  bearishEngulfing: 0.85,
  eveningStar: 0.9,
  threeBlackCrows: 0.85,
};

/** Bias of each pattern (used by aggregator + context multipliers). */
export const PATTERN_BIAS: Readonly<Record<CandlePatternName, "bullish" | "bearish" | "neutral">> = {
  engulfing: "bullish",
  morningStar: "bullish",
  hammer: "bullish",
  invertedHammer: "bullish",
  pinBar: "bullish",
  doji: "neutral",
  threeWhiteSoldiers: "bullish",
  bearishEngulfing: "bearish",
  eveningStar: "bearish",
  threeBlackCrows: "bearish",
};
