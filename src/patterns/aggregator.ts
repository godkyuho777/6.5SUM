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

import type { Candle, CandlePatternMatch, CandlePatternName } from "@shared/types";

import {
  isBearishEngulfing,
  isBullishEngulfing,
  isBullishPinBar,
  isDoji,
  isEveningStar,
  isHammer,
  isInvertedHammer,
  isMorningStar,
  isThreeBlackCrows,
  isThreeWhiteSoldiers,
  PATTERN_BASE,
  PATTERN_BIAS,
} from "./definitions";

import { patternStrengthWithContext } from "./context";

interface DetectedRaw {
  name: CandlePatternName;
  candleIdx: number;
  candlesAgo: number;
}

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
export function detectPatternsAtIndex(
  candles: Candle[],
  currentIdx: number,
  lookback = 5
): CandlePatternMatch[] {
  if (currentIdx < 0 || currentIdx >= candles.length) return [];

  const start = Math.max(0, currentIdx - lookback + 1);
  const raw: DetectedRaw[] = [];

  for (let j = start; j <= currentIdx; j++) {
    const c = candles[j];

    // Single-candle
    if (isHammer(c)) raw.push({ name: "hammer", candleIdx: j, candlesAgo: currentIdx - j });
    if (isInvertedHammer(c))
      raw.push({ name: "invertedHammer", candleIdx: j, candlesAgo: currentIdx - j });
    if (isBullishPinBar(c))
      raw.push({ name: "pinBar", candleIdx: j, candlesAgo: currentIdx - j });
    if (isDoji(c)) raw.push({ name: "doji", candleIdx: j, candlesAgo: currentIdx - j });

    // Two-candle (need j ≥ 1)
    if (j >= 1) {
      const prev = candles[j - 1];
      if (isBullishEngulfing(prev, c))
        raw.push({ name: "engulfing", candleIdx: j, candlesAgo: currentIdx - j });
      if (isBearishEngulfing(prev, c))
        raw.push({ name: "bearishEngulfing", candleIdx: j, candlesAgo: currentIdx - j });
    }

    // Three-candle (need j ≥ 2)
    if (j >= 2) {
      const c1 = candles[j - 2];
      const c2 = candles[j - 1];
      const c3 = candles[j];
      if (isMorningStar(c1, c2, c3))
        raw.push({ name: "morningStar", candleIdx: j, candlesAgo: currentIdx - j });
      if (isEveningStar(c1, c2, c3))
        raw.push({ name: "eveningStar", candleIdx: j, candlesAgo: currentIdx - j });
      if (isThreeWhiteSoldiers(c1, c2, c3))
        raw.push({ name: "threeWhiteSoldiers", candleIdx: j, candlesAgo: currentIdx - j });
      if (isThreeBlackCrows(c1, c2, c3))
        raw.push({ name: "threeBlackCrows", candleIdx: j, candlesAgo: currentIdx - j });
    }
  }

  return raw.map<CandlePatternMatch>((d) => {
    const bias = PATTERN_BIAS[d.name];
    const base = PATTERN_BASE[d.name];
    const contextual = patternStrengthWithContext(base, bias, candles, d.candleIdx);
    return {
      name: d.name,
      bias: bias === "neutral" ? "bullish" : bias,
      candlesAgo: d.candlesAgo,
      strength: Math.round(contextual * 100),
    };
  });
}

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
export function aggregatePatternScore(
  detected: CandlePatternMatch[]
): number {
  if (detected.length === 0) return 0;
  const scored = detected.map((d) => {
    const ageDiscount = Math.exp(-d.candlesAgo / 3);
    return (d.strength / 100) * ageDiscount;
  });
  const primary = Math.max(...scored);
  const bonus = Math.min(0.2, (detected.length - 1) * 0.1);
  return Math.min(1.0, primary + bonus);
}

/**
 * Count detected patterns by bias — used by reversal scoring and EXIT
 * category B to know whether bearish patterns are present.
 */
export function countByBias(
  detected: CandlePatternMatch[]
): { bullish: number; bearish: number } {
  let bullish = 0;
  let bearish = 0;
  for (const d of detected) {
    if (d.bias === "bullish") bullish++;
    else if (d.bias === "bearish") bearish++;
  }
  return { bullish, bearish };
}
