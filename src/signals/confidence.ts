/**
 * v6.5 confidence pipeline orchestrator — v6.5 §1.1, §4.1.
 *
 * Computes:
 *   final_confidence = base × confluence × wave × macro × onchain ÷ 100
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

import { applyKoreaModifier } from "../macro/korea";
import type { MacroLiquidityResult, MacroRegime } from "../macro/liquidity";
import type { OnchainRegime, OnchainScoreResult } from "../onchain/score";
import type { WaveAlignmentResult } from "../trend/wave-alignment";

import { computeConfluence } from "./multi-path-confluence";
import { computeSizeFactor, type SizeFactor } from "./size-factor";
import { evaluateRegimeGates, type RegimeGateResult } from "./regime-gates";

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
}

export interface ConfidenceBreakdown {
  base: number;
  confluence: number;
  wave: number;
  macro: number;
  onchain: number;
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

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
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
export function computeFinalConfidence(
  inputs: ConfidenceInputs
): ConfidenceDecision {
  // 1. Gate first — saves compute when blocked.
  const gate = evaluateRegimeGates({
    macroRegime: inputs.macro.regime,
    onchainRegime: inputs.onchain.regime,
    path: inputs.path,
    tightAllowList: inputs.tightAllowList,
    strongDistAllowList: inputs.strongDistAllowList,
  });

  // 2. Multipliers.
  const allPaths = [inputs.path, ...(inputs.concurrentPaths ?? [])];
  const confluence = computeConfluence(allPaths);
  const wave = inputs.wave.mult;
  const macroBase = inputs.macro.mult;
  const macro = applyKoreaModifier(macroBase, inputs.koreaModifier ?? 0);
  const onchain = inputs.onchain.mult;
  const base = inputs.baseStrength;

  // 3. Formula: `base × confluence × wave × macro × onchain`,
  //    clamped to [0, 100]. The spec writes "÷ 100" because base is
  //    already on a 0–100 scale and the multipliers are unitless,
  //    so the product is already on the right scale.
  const raw = base * confluence * wave * macro * onchain;
  const finalConfidence = clamp(raw, 0, 100);

  const breakdown: ConfidenceBreakdown = {
    base,
    confluence,
    wave,
    macro,
    onchain,
    raw,
  };

  if (gate.blocked) {
    return {
      blocked: true,
      blockReason: gate,
      finalConfidence: 0,
      sizeFactor: "reject",
      breakdown,
      macroRegime: inputs.macro.regime,
      onchainRegime: inputs.onchain.regime,
    };
  }

  return {
    blocked: false,
    finalConfidence,
    sizeFactor: computeSizeFactor(finalConfidence),
    breakdown,
    macroRegime: inputs.macro.regime,
    onchainRegime: inputs.onchain.regime,
  };
}
