/**
 * Async onchain-score fetcher used by the v6.5 routers and lite-mode.
 *
 * Coexists with the synchronous, pure `score.ts` pipeline (v6.5 §3.1) that
 * the BBDX confidence orchestrator (`signals/confidence.ts`) consumes via
 * raw zscore inputs. This file fans out to the v6.5 modifier fetchers
 * (which handle stub/mock fallbacks and produce UI-ready
 * `OnchainModifierResult` objects), sums their already-converted
 * contributions, and classifies the regime via `REGIME_THRESHOLDS`.
 *
 * Why two pipelines: the pure `computeOnchainScore(symbol, inputs)` in
 * `score.ts` operates on raw metrics (zscores, USD net, %), while the
 * v6.5 fetchers expose pre-bucketed contributions plus status/detail
 * metadata the workstation panels need. Reconciling the two scoring
 * formulas is deferred — both pipelines run independently in their
 * respective callers (confidence.ts vs routers.ts).
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

/** Fetch onchain modifiers for a symbol and return the v6.5 router contract. */
export async function fetchOnchainScore(symbol: string): Promise<OnchainScore> {
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
