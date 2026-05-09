/**
 * Hard regime gates — v6.5 §4.1 Step 1, Step 5, Step 6.
 *
 * Run BEFORE the BBDX trigger so we don't waste compute on signals
 * that the macro/onchain environment has already disqualified.
 *
 * The `tight` regime path filter is deliberately conservative:
 * v6.5 §4.2 calls out that `BB:Lower Bounce` is also a mean-reversion
 * path, so the default allow-list under `tight` is `['BB:Riding',
 * 'BB:Squeeze']` only. Override via `tightAllowList` if review
 * decides `BB:Lower Bounce` should also pass.
 */

import type { EntryPath } from "@shared/types";

import type { MacroRegime } from "../macro/liquidity";
import type { OnchainRegime } from "../onchain/score";

export interface RegimeGateInputs {
  macroRegime: MacroRegime;
  onchainRegime: OnchainRegime;
  /** BBDX path that the trigger evaluation produced. */
  path: EntryPath | string;
  /**
   * Override the conservative `tight`-regime allow-list. The default
   * (only `BB:Riding`, `BB:Squeeze`) treats `BB:Lower Bounce` as
   * mean-reversion, per v6.5 §4.2's flagged ambiguity.
   */
  tightAllowList?: readonly string[];
  /**
   * Override the `strong_distribution` allow-list. Default is just
   * `BB:Riding`.
   */
  strongDistAllowList?: readonly string[];
}

export type RegimeBlockReason =
  | "MACRO_CRISIS_BLOCK"
  | "MACRO_TIGHT_BLOCK"
  | "ONCHAIN_STRONG_DISTRIBUTION_BLOCK";

export interface RegimeGateResult {
  blocked: boolean;
  reason?: RegimeBlockReason;
  message?: string;
}

const DEFAULT_TIGHT_ALLOW: readonly string[] = ["BB:Riding", "BB:Squeeze"];
const DEFAULT_STRONG_DIST_ALLOW: readonly string[] = ["BB:Riding"];

export function evaluateRegimeGates(
  ctx: RegimeGateInputs
): RegimeGateResult {
  // 1. Macro crisis blocks all longs unconditionally.
  if (ctx.macroRegime === "crisis") {
    return {
      blocked: true,
      reason: "MACRO_CRISIS_BLOCK",
      message:
        "Macro liquidity in crisis regime — all long entries blocked (capital protection).",
    };
  }

  // 2. Tight macro blocks mean-reversion paths.
  if (ctx.macroRegime === "tight") {
    const allow = ctx.tightAllowList ?? DEFAULT_TIGHT_ALLOW;
    if (!allow.includes(ctx.path)) {
      return {
        blocked: true,
        reason: "MACRO_TIGHT_BLOCK",
        message: `Macro tight — path '${ctx.path}' is mean-reversion, blocked. Allowed: ${allow.join(", ")}.`,
      };
    }
  }

  // 3. Strong distribution onchain blocks mean-reversion paths.
  if (ctx.onchainRegime === "strong_distribution") {
    const allow = ctx.strongDistAllowList ?? DEFAULT_STRONG_DIST_ALLOW;
    if (!allow.includes(ctx.path)) {
      return {
        blocked: true,
        reason: "ONCHAIN_STRONG_DISTRIBUTION_BLOCK",
        message: `Onchain strong distribution — path '${ctx.path}' is mean-reversion, blocked. Allowed: ${allow.join(", ")}.`,
      };
    }
  }

  return { blocked: false };
}
