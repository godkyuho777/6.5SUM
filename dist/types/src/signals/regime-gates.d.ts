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
export type RegimeBlockReason = "MACRO_CRISIS_BLOCK" | "MACRO_TIGHT_BLOCK" | "ONCHAIN_STRONG_DISTRIBUTION_BLOCK";
export interface RegimeGateResult {
    blocked: boolean;
    reason?: RegimeBlockReason;
    message?: string;
}
export declare function evaluateRegimeGates(ctx: RegimeGateInputs): RegimeGateResult;
