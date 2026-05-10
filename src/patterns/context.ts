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
 * Volume baseline — EMA(volume, lookback) ending at `patternIdx-1` (exclusive).
 *
 * **P2 fix (2026-05-10, audit `04-VWAP-AUDIT.md` §V3 / `01-BBDX-AUDIT.md` 권고)**:
 *   이전 SMA(50) → EMA(50) 마이그레이션. spec 정합 회복.
 *
 * 효과:
 *   - SMA 는 50 캔들 모두 동일 가중. 거래량 spike 가 50 캔들 동안 baseline 을
 *     *과도하게 끌어올려* volume multiplier 가 일관된 1.0 으로 떨어지는
 *     문제 발생.
 *   - EMA 는 최근 캔들에 더 큰 가중 (α=2/(N+1)). 거래량 spike 가 더 빠르게
 *     baseline 에 흡수되어 *현재 캔들의 volume 비교* 가 의미 회복.
 *
 * lookback < 50 이면 (warmup 부족) SMA 로 fallback — EMA 의 첫 값이
 * undefined 인 문제 방지.
 *
 * Lookahead-free: `candles[0..patternIdx-1]` 만 사용 (patternIdx 제외).
 */
export function volumeBaseline(
  candles: Candle[],
  patternIdx: number,
  lookback = 50
): number {
  const start = Math.max(0, patternIdx - lookback);
  const slice = candles.slice(start, patternIdx);
  if (slice.length === 0) return 0;
  // SMA fallback for warmup (slice 가 lookback 보다 짧을 때)
  if (slice.length < lookback) {
    let sum = 0;
    for (const c of slice) sum += c.volume;
    return sum / slice.length;
  }
  // EMA(volume, lookback) — α=2/(N+1)
  const alpha = 2 / (lookback + 1);
  // Seed = SMA of first half (warmup convention)
  const seedEnd = Math.floor(slice.length / 2);
  let seedSum = 0;
  for (let i = 0; i < seedEnd; i++) seedSum += slice[i].volume;
  let ema = seedEnd > 0 ? seedSum / seedEnd : slice[0].volume;
  for (let i = seedEnd; i < slice.length; i++) {
    ema = alpha * slice[i].volume + (1 - alpha) * ema;
  }
  return ema;
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
