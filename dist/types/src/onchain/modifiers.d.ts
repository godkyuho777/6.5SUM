/**
 * Onchain modifier math — v6.5 §3.1, originally Part III.2 §2.
 *
 * Each modifier consumes a raw input value (z-score, USD flow, etc.)
 * and returns a contribution in `[-0.25, +0.20]` per the spec table.
 * Pure functions — no I/O. The actual data fetching happens in
 * `sources/*.ts` (PR-2 wiring).
 *
 * Stage 1 ships netflow / coinbasePremium / etfFlow live; the other
 * four return 0 until B.3.e fills them in. Keeping them as named
 * exports lets the score composer (`score.ts`) iterate uniformly.
 */
/**
 * Netflow z-score → modifier.
 *   z < -2  → +0.20  (heavy outflow, accumulation)
 *   z < -1  → +0.10
 *   z > +2  → -0.25  (heavy inflow, distribution prep)
 *   z > +1  → -0.10
 */
export declare function netflowModifier(zscore: number): number;
export interface WhaleNetUsd {
    /** Net of (exchange→unknown) bullish flow minus (unknown→exchange) bearish flow, in USD. */
    netUsd: number;
}
/**
 * Whale net flow (USD, last ~12h) → modifier.
 *   net > +$300M  → +0.15
 *   net > +$100M  → +0.07
 *   net < -$300M  → -0.20
 *   net < -$100M  → -0.07
 *
 * Stub for B.2 — returns 0 unless a real net is supplied. Full source
 * wiring is B.3.e.
 */
export declare function whaleModifier(input?: WhaleNetUsd): number;
/**
 * SSR z-score (90d) → modifier. Inverted: low SSR z = lots of stables
 * relative to BTC mcap = buy-side dry powder.
 *   z < -1.5 → +0.15
 *   z < -0.5 → +0.05
 *   z > +1.5 → -0.20
 *   z > +0.5 → -0.05
 *
 * Stub for B.2.
 */
export declare function ssrModifier(zscore?: number): number;
/**
 * Coinbase premium = (coinbase_price / binance_price) - 1.
 *   > +0.20% → +0.15  (US institutional bid)
 *   > +0.05% → +0.05
 *   < -0.20% → -0.20
 *   < -0.05% → -0.05
 */
export declare function coinbasePremiumModifier(premium: number): number;
/**
 * ETF 3-day cumulative net flow (USD).
 *   > +$1.5B → +0.20
 *   > +$500M → +0.10
 *   < -$1B   → -0.25
 *   < -$300M → -0.10
 */
export declare function etfFlowModifier(threeDayNetUsd: number): number;
/**
 * Miner outflow z-score (90d).
 *   z > +2 → -0.15  (miner selling pressure)
 *   z > +1 → -0.05
 *   z < -1.5 → +0.10
 *
 * Stub for B.2.
 */
export declare function minerOutflowModifier(zscore?: number): number;
/**
 * 30-day LTH supply change (fraction).
 *   > +2%  → +0.10  (accumulation)
 *   < -2%  → -0.15  (distribution)
 *
 * Stub for B.2.
 */
export declare function lthSupplyModifier(thirtyDayChange?: number): number;
/**
 * Per-modifier max absolute contribution, used to normalize the
 * sum into `[-1, 1]`. Matches the v6.5 §3.1.1 denominator of 1.35.
 */
export declare const MODIFIER_MAX_ABS: Readonly<Record<string, number>>;
export type ModifierName = keyof typeof MODIFIER_MAX_ABS;
export declare const ALL_MODIFIERS: readonly ModifierName[];
