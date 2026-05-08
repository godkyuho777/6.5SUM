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
    ratio: number;
    tier: 1 | 2 | 3 | null;
    reason: string;
}
export declare function checkProfitTarget(ctx: ProfitTargetContext): ProfitTargetResult;
