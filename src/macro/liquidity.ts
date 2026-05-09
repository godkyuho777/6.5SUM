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
export const MACRO_MULTIPLIERS: Readonly<Record<MacroRegime, number>> = {
  crisis: 0.3,
  tight: 0.65,
  neutral: 1.0,
  easy: 1.2,
  flooded: 1.4,
};

export interface MacroBreakdown {
  spread: number; // contribution from SOFR-IORB spread
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

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

/**
 * Score the SOFR-IORB spread per v6.5 §2.1.2.
 *
 * The §2.4 worked example treats `spread = 2bp` as `-15` (boundary
 * inclusive into the tight zone), so the spec's stair-step is
 * `>=`, not strict `>`.
 *
 *   spread ≥ 5bp  → -40 (liquidity crisis)
 *   spread ≥ 2bp  → -15
 *   spread > 0bp  → 0
 *   spread ≤ 0bp  → +10
 */
function scoreSpread(sofr?: number, iorb?: number): number {
  if (sofr == null || iorb == null) return 0;
  const spreadBp = (sofr - iorb) * 100; // both in %, basis points = ×100
  if (spreadBp >= 5) return -40;
  if (spreadBp >= 2) return -15;
  if (spreadBp > 0) return 0;
  return 10;
}

/** RRP change is an inverse signal — falling RRP balances mean reserves moving back into markets. */
function scoreRrp(rrpChange30d?: number): number {
  if (rrpChange30d == null) return 0;
  if (rrpChange30d < -0.1) return 25;
  if (rrpChange30d > 0.1) return -15;
  return 0;
}

/** TGA change inverse — Treasury drawing down → liquidity into markets. */
function scoreTga(tgaChange30d?: number): number {
  if (tgaChange30d == null) return 0;
  if (tgaChange30d < -0.05) return 20;
  if (tgaChange30d > 0.1) return -20;
  return 0;
}

/** Fed balance — direct proxy for QE/QT. */
function scoreFedBalance(change30d?: number): number {
  if (change30d == null) return 0;
  if (change30d > 0.01) return 25;
  if (change30d < -0.01) return -25;
  return 0;
}

/** Real Fed Funds — negative real rates are risk-on. */
function scoreRealRate(realRate?: number): number {
  if (realRate == null) return 0;
  if (realRate < 0) return 15;
  if (realRate > 2) return -15;
  return 0;
}

/**
 * v6.5 §2.1.3 regime mapping.
 *
 * The §2.4 worked example shows `score = -15` is classified as `tight`
 * ("정확히 경계"), so each region's *upper* bound is inclusive. By
 * symmetry the upper bound +50 belongs to `easy` rather than `flooded`.
 *
 *   score < -50 → crisis
 *   -50 ≤ score ≤ -15 → tight
 *   -15 < score < +15 → neutral
 *   +15 ≤ score ≤ +50 → easy
 *   +50 < score → flooded
 */
function classifyRegime(score: number): MacroRegime {
  if (score < -50) return "crisis";
  if (score <= -15) return "tight";
  if (score < 15) return "neutral";
  if (score <= 50) return "easy";
  return "flooded";
}

/**
 * Compute the macro liquidity score from raw FRED-derived inputs.
 *
 * Missing inputs contribute 0 and are listed in `missingInputs`. A
 * fully-blank input set produces `score=0, regime=neutral, mult=1.0`
 * — safe default that doesn't perturb the trade pipeline when data
 * is unavailable.
 */
export function computeMacroScore(
  inputs: MacroLiquidityInputs = {}
): MacroLiquidityResult {
  const breakdown: MacroBreakdown = {
    spread: scoreSpread(inputs.sofr, inputs.iorb),
    rrp: scoreRrp(inputs.rrpChange30d),
    tga: scoreTga(inputs.tgaChange30d),
    fedBalance: scoreFedBalance(inputs.fedBalanceChange30d),
    realRate: scoreRealRate(inputs.realFedFundsRate),
  };

  const total =
    breakdown.spread +
    breakdown.rrp +
    breakdown.tga +
    breakdown.fedBalance +
    breakdown.realRate;

  const score = clamp(total, -100, 100);
  const regime = classifyRegime(score);
  const mult = MACRO_MULTIPLIERS[regime];

  const missingInputs: string[] = [];
  if (inputs.sofr == null || inputs.iorb == null) missingInputs.push("sofr_iorb_spread");
  if (inputs.rrpChange30d == null) missingInputs.push("rrp_change_30d");
  if (inputs.tgaChange30d == null) missingInputs.push("tga_change_30d");
  if (inputs.fedBalanceChange30d == null) missingInputs.push("fed_balance_change_30d");
  if (inputs.realFedFundsRate == null) missingInputs.push("real_fed_funds_rate");

  return {
    score,
    regime,
    mult,
    breakdown,
    missingInputs,
  };
}
