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

import {
  coinbasePremiumModifier,
  etfFlowModifier,
  lthSupplyModifier,
  minerOutflowModifier,
  netflowModifier,
  ssrModifier,
  whaleModifier,
  type ModifierName,
} from "./modifiers";
import { getOnchainTier, TIER_MODIFIERS, type OnchainTier } from "./symbol-tier";

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

export type OnchainRegime =
  | "strong_accumulation"
  | "accumulation"
  | "neutral"
  | "distribution"
  | "strong_distribution";

/** v6.5 §3.1.2 multiplier table. Tagged "beta — calibration pending". */
export const ONCHAIN_MULTIPLIERS: Readonly<Record<OnchainRegime, number>> = {
  strong_accumulation: 1.3,
  accumulation: 1.15,
  neutral: 1.0,
  distribution: 0.85,
  strong_distribution: 0.7,
};

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

/** v6.5 §3.1.1 normalization denominator — accommodates the maximum possible sum of all 7. */
const NORMALIZATION_DENOMINATOR = 1.35;

/** v6.5 §3.1.2 regime boundaries. */
function classifyRegime(score: number): OnchainRegime {
  if (score > 0.6) return "strong_accumulation";
  if (score > 0.2) return "accumulation";
  if (score > -0.2) return "neutral";
  if (score > -0.6) return "distribution";
  return "strong_distribution";
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

/**
 * Compute the full onchain score for a symbol given raw inputs.
 *
 * Modifiers not enabled for the symbol's tier are recorded as `0`
 * in the breakdown. This way the FE can show "5/7 enabled — small
 * cap" without separate logic for each tier.
 */
export function computeOnchainScore(
  symbol: string,
  inputs: OnchainInputs = {}
): OnchainScoreResult {
  const tier = getOnchainTier(symbol);
  const enabled = new Set(TIER_MODIFIERS[tier]);

  const breakdown: OnchainBreakdown = {
    netflow: enabled.has("netflow") ? netflowModifier(inputs.netflowZscore ?? 0) : 0,
    whale: enabled.has("whale")
      ? whaleModifier(inputs.whaleNetUsd != null ? { netUsd: inputs.whaleNetUsd } : undefined)
      : 0,
    ssr: enabled.has("ssr") ? ssrModifier(inputs.ssrZscore) : 0,
    coinbasePremium: enabled.has("coinbasePremium")
      ? coinbasePremiumModifier(inputs.coinbasePremium ?? 0)
      : 0,
    etfFlow: enabled.has("etfFlow")
      ? etfFlowModifier(inputs.etfFlowThreeDayUsd ?? 0)
      : 0,
    minerOutflow: enabled.has("minerOutflow")
      ? minerOutflowModifier(inputs.minerOutflowZscore)
      : 0,
    lthSupply: enabled.has("lthSupply")
      ? lthSupplyModifier(inputs.lthSupplyThirtyDayChange)
      : 0,
  };

  const total =
    breakdown.netflow +
    breakdown.whale +
    breakdown.ssr +
    breakdown.coinbasePremium +
    breakdown.etfFlow +
    breakdown.minerOutflow +
    breakdown.lthSupply;

  const score = clamp(total / NORMALIZATION_DENOMINATOR, -1, 1);
  const regime = classifyRegime(score);
  const mult = ONCHAIN_MULTIPLIERS[regime];

  return {
    symbol,
    tier,
    score,
    regime,
    mult,
    breakdown,
    enabledModifiers: TIER_MODIFIERS[tier] as readonly ModifierName[],
  };
}
