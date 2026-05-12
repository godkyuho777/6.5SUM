/**
 * v6.5 confidence pipeline orchestrator — v6.5 §1.1, §4.1.
 *
 * Computes:
 *   final_confidence = base × confluence × wave × macro × onchain × additional ÷ 100
 *
 *   ↑ `additional` = combineAdditionalModifiers(EntryDecision *Mult fields)
 *     = macd × orderBlock × funding × breadth
 *
 * Clamped to `[0, 100]`. Combined with the regime gates (run before
 * BBDX trigger) and the runtime 7-dimension assertion to produce the
 * full v6.5 entry decision.
 *
 * Pure: takes inputs, returns the result. Real source-fed inputs
 * land in PR-2; for now this can be called with stubbed `mult=1.0`
 * values from any caller.
 */
import type { EntryPath } from "@shared/types";
import type { MacroLiquidityResult, MacroRegime } from "../macro/liquidity";
import type { OnchainRegime, OnchainScoreResult } from "../onchain/score";
import type { WaveAlignmentResult } from "../trend/wave-alignment";
import { type SizeFactor } from "./size-factor";
import { type RegimeGateResult } from "./regime-gates";
export interface ConfidenceInputs {
    /** BBDX path that fires for this signal. */
    path: EntryPath | string;
    /** Other concurrent paths (deduplicated downstream). */
    concurrentPaths?: readonly (EntryPath | string)[];
    /** Base strength from the v6.2 category-weighted model, 0–100. */
    baseStrength: number;
    /** Macro liquidity result (pass `MACRO_DEFAULT` if unavailable). */
    macro: MacroLiquidityResult;
    /** Korea modifier (`+0.05` / `-0.05` / `0`). */
    koreaModifier?: number;
    /** Onchain composite. */
    onchain: OnchainScoreResult;
    /** Wave alignment across timeframes. */
    wave: WaveAlignmentResult;
    /** Optional regime-gate overrides (see `regime-gates.ts`). */
    tightAllowList?: readonly string[];
    strongDistAllowList?: readonly string[];
    /**
     * Additional Strategies multiplier.
     *
     * Combined product of MACD Divergence × Order Block ×
     * Funding Extreme × Market Breadth multipliers.
     *
     * Pass the `combineAdditionalModifiers(decision)` result. If omitted,
     * defaults to `1.0` (no effect — backward compat).
     *
     * 헌장 규칙 3 준수: modifier 단독 시그널 X. base BBDX path trigger 후
     * 가중치로만 사용.
     */
    additional?: number;
}
export interface ConfidenceBreakdown {
    base: number;
    confluence: number;
    wave: number;
    macro: number;
    onchain: number;
    /** Additional Strategies (combineAdditionalModifiers) — defaults 1.0. */
    additional: number;
    /** Multiplied product before clamp, useful for telemetry. */
    raw: number;
}
export interface ConfidenceDecision {
    blocked: boolean;
    /** Reason when blocked; null otherwise. */
    blockReason?: RegimeGateResult;
    finalConfidence: number;
    sizeFactor: SizeFactor;
    breakdown: ConfidenceBreakdown;
    /** Macro/onchain regimes for FE display. */
    macroRegime: MacroRegime;
    onchainRegime: OnchainRegime;
}
/**
 * Orchestrate the v6.5 confidence formula end-to-end.
 *
 * 1. Run hard regime gates. If blocked → return immediately.
 * 2. Compose multipliers: confluence × wave × (macro × Korea) × onchain.
 * 3. Multiply by `base_strength`, divide by 100, clamp to [0, 100].
 * 4. Map to size factor.
 *
 * NOTE: This module does NOT run the 7-dim charter assertion — that
 * lives in `assertSevenDimensions` and should be called by the
 * higher-level entry decider once the indicator set is known.
 */
export declare function computeFinalConfidence(inputs: ConfidenceInputs): ConfidenceDecision;
