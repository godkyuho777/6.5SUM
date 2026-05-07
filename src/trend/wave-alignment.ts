/**
 * Multi-TF wave alignment — v6.5 §1.1 / Part III.3 §7.
 *
 * Aggregates per-TF directions into a single alignment label and a
 * multiplier the entry orchestrator consumes.
 *
 *   perfect_up   → 1.30   (every TF bullish, no contradictions)
 *   partial_up   → 1.10   (majority bullish, some sideways/conflict)
 *   mixed        → 0.85   (no consistent direction)
 *   opposing     → 0.30   (longer TFs bearish, shorter TFs bullish — risky)
 */

import type { TimeframeTrend, TrendDirection } from "./multi-tf";

export type WaveAlignment = "perfect_up" | "partial_up" | "mixed" | "opposing";

export const WAVE_MULTIPLIERS: Readonly<Record<WaveAlignment, number>> = {
  perfect_up: 1.3,
  partial_up: 1.1,
  mixed: 0.85,
  opposing: 0.3,
};

export interface WaveAlignmentResult {
  alignment: WaveAlignment;
  mult: number;
  /** Per-TF direction snapshot for the FE breakdown panel. */
  directions: { tf: string; direction: TrendDirection }[];
}

/**
 * Default TF weights mirror the spec's "longer TF = more weight"
 * principle (15m × 1, 1h × 2, 4h × 3, 1d × 4). Caller can override
 * for non-standard TF sets.
 */
const DEFAULT_TF_WEIGHTS: Readonly<Record<string, number>> = {
  "15m": 1,
  "1h": 2,
  "4h": 3,
  "1d": 4,
  "1D": 4,
  "1w": 5,
  "1W": 5,
};

function tfWeight(
  tf: string,
  weights: Readonly<Record<string, number>>
): number {
  return weights[tf] ?? 1;
}

/**
 * Classify alignment from a list of per-TF trends.
 *
 *   - All BULLISH → perfect_up
 *   - Weighted bullish > 60% AND no BEARISH on the **longest** TF → partial_up
 *   - Longest TF bearish AND any TF bullish → opposing
 *   - Anything else → mixed
 */
export function classifyWaveAlignment(
  trends: TimeframeTrend[],
  weights: Readonly<Record<string, number>> = DEFAULT_TF_WEIGHTS
): WaveAlignmentResult {
  if (trends.length === 0) {
    return {
      alignment: "mixed",
      mult: WAVE_MULTIPLIERS.mixed,
      directions: [],
    };
  }

  const directions = trends.map((t) => ({ tf: t.tf, direction: t.direction }));

  // Identify the "longest" TF in this batch by weight — usually 1d or 1w.
  let longestTf = trends[0].tf;
  let longestWeight = tfWeight(trends[0].tf, weights);
  for (const t of trends) {
    const w = tfWeight(t.tf, weights);
    if (w > longestWeight) {
      longestTf = t.tf;
      longestWeight = w;
    }
  }
  const longestDir = trends.find((t) => t.tf === longestTf)!.direction;

  let totalWeight = 0;
  let bullWeight = 0;
  let bearWeight = 0;
  for (const t of trends) {
    const w = tfWeight(t.tf, weights);
    totalWeight += w;
    if (t.direction === "BULLISH") bullWeight += w;
    else if (t.direction === "BEARISH") bearWeight += w;
  }
  const bullFrac = bullWeight / totalWeight;

  // perfect_up: every TF bullish.
  if (trends.every((t) => t.direction === "BULLISH")) {
    return {
      alignment: "perfect_up",
      mult: WAVE_MULTIPLIERS.perfect_up,
      directions,
    };
  }

  // opposing: longest TF bearish AND any other TF bullish.
  if (longestDir === "BEARISH" && bullWeight > 0) {
    return {
      alignment: "opposing",
      mult: WAVE_MULTIPLIERS.opposing,
      directions,
    };
  }

  // partial_up: weighted bullish dominates AND longest TF not bearish.
  // 0.6 boundary inclusive — matches spec's "majority" intent.
  if (bullFrac >= 0.6 && longestDir !== "BEARISH" && bearWeight === 0) {
    return {
      alignment: "partial_up",
      mult: WAVE_MULTIPLIERS.partial_up,
      directions,
    };
  }

  return {
    alignment: "mixed",
    mult: WAVE_MULTIPLIERS.mixed,
    directions,
  };
}
