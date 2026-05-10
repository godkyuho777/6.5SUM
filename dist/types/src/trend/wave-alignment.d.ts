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
export type WaveAlignment = "perfect_up" | "partial_up" | "mixed" | "opposing" | "perfect_down";
export declare const WAVE_MULTIPLIERS: Readonly<Record<WaveAlignment, number>>;
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
export declare function waveAlignmentToMultiplier(alignment: WaveAlignment, bbdxSide?: "LONG" | "SHORT"): number;
export interface WaveAlignmentResult {
    alignment: WaveAlignment;
    mult: number;
    /** Per-TF direction snapshot for the FE breakdown panel. */
    directions: {
        tf: string;
        direction: TrendDirection;
    }[];
}
/**
 * Classify alignment from a list of per-TF trends.
 *
 *   - All BULLISH → perfect_up
 *   - Weighted bullish > 60% AND no BEARISH on the **longest** TF → partial_up
 *   - Longest TF bearish AND any TF bullish → opposing
 *   - Anything else → mixed
 */
export declare function classifyWaveAlignment(trends: TimeframeTrend[], weights?: Readonly<Record<string, number>>): WaveAlignmentResult;
