/**
 * Onchain composite score — v6.5 §3.1.
 *
 * Combines per-modifier contributions into a single normalized
 * score in `[-1, 1]`, classifies the regime, and emits the
 * multiplier the entry orchestrator consumes.
 *
 * Pure: takes raw inputs, returns the result. Source fetchers in
 * `sources/*.ts` populate the inputs.
 */
import { type ModifierName } from "./modifiers";
import { type OnchainTier } from "./symbol-tier";
/** Raw inputs collected by `sources/*.ts`. All optional — modifier returns 0 when absent. */
export interface OnchainInputs {
    /** Exchange netflow z-score over the last 24h (negative = outflow = bullish). */
    netflowZscore?: number;
    /** Whale Alert net USD over last ~12h (signed). */
    whaleNetUsd?: number;
    /** SSR z-score over last 90d. */
    ssrZscore?: number;
    /** Coinbase / Binance price ratio - 1, dimensionless. */
    coinbasePremium?: number;
    /** ETF 3-day cumulative net flow in USD. */
    etfFlowThreeDayUsd?: number;
    /** Miner outflow z-score over 90d. */
    minerOutflowZscore?: number;
    /** Long-term holder supply 30d change as a fraction. */
    lthSupplyThirtyDayChange?: number;
}
export type OnchainRegime = "strong_accumulation" | "accumulation" | "neutral" | "distribution" | "strong_distribution";
/** v6.5 §3.1.2 multiplier table. Tagged "beta — calibration pending". */
export declare const ONCHAIN_MULTIPLIERS: Readonly<Record<OnchainRegime, number>>;
export interface OnchainBreakdown {
    netflow: number;
    whale: number;
    ssr: number;
    coinbasePremium: number;
    etfFlow: number;
    minerOutflow: number;
    lthSupply: number;
}
export interface OnchainScoreResult {
    symbol: string;
    tier: OnchainTier;
    /** Sum of enabled modifiers, normalized to [-1, 1]. */
    score: number;
    regime: OnchainRegime;
    /** Multiplier applied to base_strength downstream. */
    mult: number;
    breakdown: OnchainBreakdown;
    /** Names of modifiers that were enabled by the tier. */
    enabledModifiers: readonly ModifierName[];
}
/**
 * Compute the full onchain score for a symbol given raw inputs.
 *
 * Modifiers not enabled for the symbol's tier are recorded as `0`
 * in the breakdown. This way the FE can show "5/7 enabled — small
 * cap" without separate logic for each tier.
 */
export declare function computeOnchainScore(symbol: string, inputs?: OnchainInputs): OnchainScoreResult;
