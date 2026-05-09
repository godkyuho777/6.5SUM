/**
 * Macro Liquidity score — v6.5 §2.1.2.
 *
 * Combines five FRED inputs into a single `[-100, +100]` score, then
 * classifies a regime that drives the macro multiplier downstream.
 * Pure: takes raw inputs, returns the result. The FRED fetcher in
 * `sources/fred.ts` populates the inputs (PR-2 wiring).
 */
export interface MacroLiquidityInputs {
    /** SOFR (overnight financing rate), in %. */
    sofr?: number;
    /** IORB (interest on reserve balances), in %. */
    iorb?: number;
    /** RRP balance change over the last 30 days as a fraction (e.g. -0.10 = -10%). */
    rrpChange30d?: number;
    /** Treasury General Account change over 30 days, fraction. */
    tgaChange30d?: number;
    /** Fed balance sheet change over 30 days, fraction. */
    fedBalanceChange30d?: number;
    /** Real Fed Funds Rate (FEDFUNDS - CPI YoY), in %. */
    realFedFundsRate?: number;
}
export type MacroRegime = "crisis" | "tight" | "neutral" | "easy" | "flooded";
/** v6.5 §2.1.3 multiplier table. Tagged "beta — calibration pending". */
export declare const MACRO_MULTIPLIERS: Readonly<Record<MacroRegime, number>>;
export interface MacroBreakdown {
    spread: number;
    rrp: number;
    tga: number;
    fedBalance: number;
    realRate: number;
}
export interface MacroLiquidityResult {
    /** `[-100, +100]` per spec. */
    score: number;
    regime: MacroRegime;
    /** Multiplier applied downstream. */
    mult: number;
    breakdown: MacroBreakdown;
    /** Inputs that were missing — surfaces in the UI as "data sparse". */
    missingInputs: string[];
}
/**
 * Compute the macro liquidity score from raw FRED-derived inputs.
 *
 * Missing inputs contribute 0 and are listed in `missingInputs`. A
 * fully-blank input set produces `score=0, regime=neutral, mult=1.0`
 * — safe default that doesn't perturb the trade pipeline when data
 * is unavailable.
 */
export declare function computeMacroScore(inputs?: MacroLiquidityInputs): MacroLiquidityResult;
