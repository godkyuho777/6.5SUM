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
export declare function volumeBaseline(candles: Candle[], patternIdx: number, lookback?: number): number;
/**
 * Volume multiplier — Part III.1 §5.2 / §결함 6.
 *   ≥ 2.0× baseline → ×1.40
 *   ≥ 1.5× baseline → ×1.25
 *   ≥ 1.2× baseline → ×1.10
 *   < 0.8× baseline → ×0.80
 *   else            → ×1.00
 */
export declare function volumeMultiplier(candleVolume: number, baseline: number): number;
/**
 * Prior-trend cumulative return — sum of (close - open) / open across
 * the `lookback` candles immediately before `patternIdx`. Look-ahead
 * safe because it never reads `patternIdx` or beyond.
 */
export declare function priorTrendReturn(candles: Candle[], patternIdx: number, lookback?: number): number;
/**
 * Prior-trend multiplier — Part III.1 §5.2 / §결함 7.
 *
 * Bullish patterns get a boost after a downtrend, dampening after
 * an uptrend. Bearish patterns are mirrored.
 */
export declare function priorTrendMultiplier(cumulativeReturn: number, bias: "bullish" | "bearish" | "neutral"): number;
/**
 * Combined pattern strength with volume + prior-trend context.
 * Returns a value in [0, 1].
 *
 * @param baseStrength patternBase value from definitions.ts (0–1)
 * @param bias bullish | bearish | neutral
 * @param candles full candle history (read up to patternIdx only)
 * @param patternIdx the candle where the pattern formed
 */
export declare function patternStrengthWithContext(baseStrength: number, bias: "bullish" | "bearish" | "neutral", candles: Candle[], patternIdx: number): number;
