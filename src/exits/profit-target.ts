/**
 * [EXIT-A] Profit target — Part II.1 §1.2.
 *
 * Tiered partial exits as the position works:
 *   Tier 1: BB middle reached → 50% partial exit
 *   Tier 2: Fib 100% (anchor + range) reached → +30% partial exit
 *   Tier 3: Fib 161.8% extension reached → full exit
 *
 * For B.1 we wire Tier 1 only. Tiers 2/3 require Fib anchor data
 * which lives in a separate engine (FE/src/lib/fibonacci-engine.ts).
 * Plumb that through in B.2 once the BE has a unified Fib snapshot.
 */

import type { TechnicalIndicators } from "@shared/types";

export interface ProfitTargetContext {
  price: number;
  indicators: TechnicalIndicators;
  /** Optional Fib levels for tiers 2 and 3 (B.2 wiring). */
  fib100?: number;
  fib161_8?: number;
  /** Has tier-1 (BB middle) already triggered for this position? */
  tier1Already?: boolean;
}

export interface ProfitTargetResult {
  triggered: boolean;
  ratio: number; // 0.5 / 0.3 / 1.0
  tier: 1 | 2 | 3 | null;
  reason: string;
}

export function checkProfitTarget(
  ctx: ProfitTargetContext
): ProfitTargetResult {
  const { price, indicators } = ctx;

  // Tier 3: Fib 161.8% extension — full exit.
  if (ctx.fib161_8 != null && price >= ctx.fib161_8) {
    return {
      triggered: true,
      ratio: 1.0,
      tier: 3,
      reason: `Fib 161.8% extension reached at ${ctx.fib161_8.toFixed(2)} — full exit.`,
    };
  }

  // Tier 2: Fib 100% — additional 30% partial exit.
  if (ctx.fib100 != null && price >= ctx.fib100) {
    return {
      triggered: true,
      ratio: 0.3,
      tier: 2,
      reason: `Fib 100% reached at ${ctx.fib100.toFixed(2)} — additional 30% partial exit.`,
    };
  }

  // Tier 1: BB middle — 50% partial exit (only first time).
  if (!ctx.tier1Already && price >= indicators.bbMiddle) {
    return {
      triggered: true,
      ratio: 0.5,
      tier: 1,
      reason: `Price recovered to BB middle (${indicators.bbMiddle.toFixed(2)}) — 50% partial exit.`,
    };
  }

  return {
    triggered: false,
    ratio: 0,
    tier: null,
    reason: "",
  };
}
