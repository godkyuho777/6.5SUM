/**
 * Onchain Score — 7개 modifier 합산 → 정규화 → regime 분류.
 *
 * 명세서 ONCHAIN_INTEGRATION.md §3 그대로 구현:
 *   total = sum(modifiers)               // ~ -1.75 ~ +1.40
 *   normalized = clamp(total / 1.4, -1, +1)
 *
 *   regime = strong_accumulation  if score > 0.6
 *          = accumulation         if score > 0.2
 *          = neutral              if score > -0.2
 *          = distribution         if score > -0.6
 *          = strong_distribution  otherwise
 */

import {
  MODIFIER_BOUNDS,
  REGIME_THRESHOLDS,
  type OnchainModifierResult,
  type OnchainRegime,
  type OnchainScore,
} from "./types";
import { computeCoinbasePremium } from "./coinbase-premium";
import { computeSSR } from "./ssr";
import {
  computeEtfFlow,
  computeExchangeNetflow,
  computeLthSupply,
  computeMinerOutflow,
  computeWhaleAlert,
} from "./stub-modifiers";

export function classifyRegime(score: number): OnchainRegime {
  if (score > REGIME_THRESHOLDS.strongAccumulation) return "strong_accumulation";
  if (score > REGIME_THRESHOLDS.accumulation) return "accumulation";
  if (score > REGIME_THRESHOLDS.distribution) return "neutral";
  if (score > REGIME_THRESHOLDS.strongDistribution) return "distribution";
  return "strong_distribution";
}

/** Compute onchain score for a symbol. Runs all 7 modifiers in parallel. */
export async function computeOnchainScore(symbol: string): Promise<OnchainScore> {
  const [netflow, whale, ssr, premium, etf, miner, lth] = await Promise.all([
    computeExchangeNetflow(symbol),
    computeWhaleAlert(symbol),
    computeSSR(),
    computeCoinbasePremium(symbol),
    computeEtfFlow(symbol),
    computeMinerOutflow(symbol),
    computeLthSupply(symbol),
  ]);

  const modifiers: OnchainModifierResult[] = [netflow, whale, ssr, premium, etf, miner, lth];

  const total = modifiers.reduce((s, m) => s + m.value, 0);
  const normalized = Math.max(-1, Math.min(1, total / MODIFIER_BOUNDS.normalizationDenom));
  const regime = classifyRegime(normalized);

  return {
    symbol,
    score: normalized,
    regime,
    modifiers,
    computedAt: new Date().toISOString(),
  };
}
