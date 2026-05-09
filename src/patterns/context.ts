/**
 * Pattern context multipliers — volume + prior-trend.
 *
 * Per Pattern Audit (Part III.1) major defect #6 (volume context
 * missing) and #7 (prior-trend context missing). Same pattern means
 * different things in different contexts; without these, all base
 * values are misleading.
 *
 * Inputs only use candles up to and including patternIdx — look-ahead
 * safe by construction.
 */

import type { Candle } from "@shared/types";

/**
 * Volume baseline — simple mean of the volume of the `lookback`
 * candles immediately preceding `patternIdx` (exclusive). Returns 0
 * when there are not enough candles.
 *
 * The spec uses EMA(volume, 50). We start with a SMA window for
 * simplicity and switch to EMA when the indicator pipeline already
 * produces an EMA-volume series we can reuse. Either way, this
 * function operates only on `candles[0..patternIdx-1]`.
 */
export function volumeBaseline(
  candles: Candle[],
  patternIdx: number,
  lookback = 50
): number {
  const start = Math.max(0, patternIdx - lookback);
  const slice = candles.slice(start, patternIdx);
  if (slice.length === 0) return 0;
  let sum = 0;
  for (const c of slice) sum += c.volume;
  return sum / slice.length;
}

/**
 * Volume multiplier — Part III.1 §5.2 / §결함 6.
 *   ≥ 2.0× baseline → ×1.40
 *   ≥ 1.5× baseline → ×1.25
 *   ≥ 1.2× baseline → ×1.10
 *   < 0.8× baseline → ×0.80
 *   else            → ×1.00
 */
export function volumeMultiplier(
  candleVolume: number,
  baseline: number
): number {
  if (baseline <= 0) return 1.0;
  const ratio = candleVolume / baseline;
  if (ratio >= 2.0) return 1.4;
  if (ratio >= 1.5) return 1.25;
  if (ratio >= 1.2) return 1.1;
  if (ratio < 0.8) return 0.8;
  return 1.0;
}

/**
 * Prior-trend cumulative return — sum of (close - open) / open across
 * the `lookback` candles immediately before `patternIdx`. Look-ahead
 * safe because it never reads `patternIdx` or beyond.
 */
export function priorTrendReturn(
  candles: Candle[],
  patternIdx: number,
  lookback = 5
): number {
  if (patternIdx < lookback) return 0;
  const slice = candles.slice(patternIdx - lookback, patternIdx);
  let sum = 0;
  for (const c of slice) {
    if (c.open > 0) sum += (c.close - c.open) / c.open;
  }
  return sum;
}

/**
 * Prior-trend multiplier — Part III.1 §5.2 / §결함 7.
 *
 * Bullish patterns get a boost after a downtrend, dampening after
 * an uptrend. Bearish patterns are mirrored.
 */
export function priorTrendMultiplier(
  cumulativeReturn: number,
  bias: "bullish" | "bearish" | "neutral"
): number {
  if (bias === "neutral") return 1.0;

  if (bias === "bullish") {
    if (cumulativeReturn < -0.05) return 1.3;
    if (cumulativeReturn < -0.02) return 1.15;
    if (cumulativeReturn > 0.05) return 0.6;
    return 1.0;
  }

  // bearish
  if (cumulativeReturn > 0.05) return 1.3;
  if (cumulativeReturn > 0.02) return 1.15;
  if (cumulativeReturn < -0.05) return 0.6;
  return 1.0;
}

/**
 * Combined pattern strength with volume + prior-trend context.
 * Returns a value in [0, 1].
 *
 * @param baseStrength patternBase value from definitions.ts (0–1)
 * @param bias bullish | bearish | neutral
 * @param candles full candle history (read up to patternIdx only)
 * @param patternIdx the candle where the pattern formed
 */
export function patternStrengthWithContext(
  baseStrength: number,
  bias: "bullish" | "bearish" | "neutral",
  candles: Candle[],
  patternIdx: number
): number {
  if (patternIdx < 0 || patternIdx >= candles.length) return baseStrength;

  const candle = candles[patternIdx];
  const baseline = volumeBaseline(candles, patternIdx);
  const volMult = volumeMultiplier(candle.volume, baseline);

  const trendReturn = priorTrendReturn(candles, patternIdx);
  const trendMult = priorTrendMultiplier(trendReturn, bias);

  return Math.min(1.0, baseStrength * volMult * trendMult);
}
