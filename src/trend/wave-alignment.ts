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

export type WaveAlignment =
  | "perfect_up"
  | "partial_up"
  | "mixed"
  | "opposing"
  | "perfect_down"; // ★ 신규 — 모든 TF BEARISH 일 때

export const WAVE_MULTIPLIERS: Readonly<Record<WaveAlignment, number>> = {
  perfect_up: 1.3,
  partial_up: 1.1,
  mixed: 0.85,
  opposing: 0.3,
  // perfect_down: 모든 TF 명확한 하락 추세 — LONG 진입은 강하게 차감되지만,
  // opposing (단기/장기 충돌) 만큼 위험하지는 않음 (구조가 일관됨).
  perfect_down: 0.65,
};

/**
 * Wave Alignment → multiplier (BBDX final_confidence 곱셈 체인용).
 *
 * **P2 fix (2026-05-10, audit `06-WAVE-TREND-AUDIT.md` SHORT support)**:
 *   SHORT 추가됨 (P1-#3). LONG 의 perfect_up 은 SHORT 의 perfect_down
 *   과 의미 반전 — 추세 일치 시 강화, 추세 반대 시 약화.
 *
 *   LONG 매핑:
 *     perfect_up → 1.30  (모든 TF 강세 정렬, LONG 완벽 환경)
 *     perfect_down → 0.65 (모든 TF 약세, LONG 진입 잘못)
 *     partial_up → 1.10
 *     mixed → 0.85
 *     opposing → 0.30
 *
 *   SHORT 매핑 (의미 반전):
 *     perfect_down → 1.30 (모든 TF 약세, SHORT 완벽 환경)
 *     perfect_up → 0.65   (모든 TF 강세, SHORT 진입 잘못)
 *     partial_up → 0.85   (LONG 의 mixed 대응)
 *     mixed → 0.85        (양방향 중립)
 *     opposing → 0.30     (자본 보호 — 다중 TF 충돌)
 */
export function waveAlignmentToMultiplier(
  alignment: WaveAlignment,
  bbdxSide: "LONG" | "SHORT" = "LONG"
): number {
  if (bbdxSide === "LONG") return WAVE_MULTIPLIERS[alignment];
  // SHORT — perfect_up ↔ perfect_down 의 1.30 ↔ 0.65 swap
  switch (alignment) {
    case "perfect_down":
      return 1.30;
    case "perfect_up":
      return 0.65;
    case "partial_up":
      return 0.85; // LONG 의 mixed 와 동일 가중
    case "mixed":
      return 0.85;
    case "opposing":
      return 0.30; // 자본 보호 — 양 방향 모두 위험
    default:
      return 1.0;
  }
}

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

  // perfect_down: every TF bearish — 명확한 하락 추세.
  // perfect_up 미러. opposing 보다 덜 차감 (구조 일관 → 모호하지 않음).
  if (trends.every((t) => t.direction === "BEARISH")) {
    return {
      alignment: "perfect_down",
      mult: WAVE_MULTIPLIERS.perfect_down,
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
