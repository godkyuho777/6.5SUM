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
export declare const WAVE_MULTIPLIERS: Readonly<Record<WaveAlignment, number>>;
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
