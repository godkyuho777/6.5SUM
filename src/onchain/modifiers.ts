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

// ──────────────────────────────────────────────────────────────────
// 2.1 Exchange Netflow — Part III.2 §2.1
// ──────────────────────────────────────────────────────────────────

/**
 * Netflow z-score → modifier.
 *   z < -2  → +0.20  (heavy outflow, accumulation)
 *   z < -1  → +0.10
 *   z > +2  → -0.25  (heavy inflow, distribution prep)
 *   z > +1  → -0.10
 */
export function netflowModifier(zscore: number): number {
  if (!Number.isFinite(zscore)) return 0;
  if (zscore < -2) return 0.2;
  if (zscore < -1) return 0.1;
  if (zscore > 2) return -0.25;
  if (zscore > 1) return -0.1;
  return 0;
}

// ──────────────────────────────────────────────────────────────────
// 2.2 Whale Alert — Part III.2 §2.2
// ──────────────────────────────────────────────────────────────────

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
export function whaleModifier(input?: WhaleNetUsd): number {
  if (!input || !Number.isFinite(input.netUsd)) return 0;
  const netHundredsM = input.netUsd / 100_000_000;
  if (netHundredsM > 3) return 0.15;
  if (netHundredsM > 1) return 0.07;
  if (netHundredsM < -3) return -0.2;
  if (netHundredsM < -1) return -0.07;
  return 0;
}

// ──────────────────────────────────────────────────────────────────
// 2.3 Stablecoin Supply Ratio (SSR) — Part III.2 §2.3
// ──────────────────────────────────────────────────────────────────

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
export function ssrModifier(zscore?: number): number {
  if (zscore == null || !Number.isFinite(zscore)) return 0;
  if (zscore < -1.5) return 0.15;
  if (zscore < -0.5) return 0.05;
  if (zscore > 1.5) return -0.2;
  if (zscore > 0.5) return -0.05;
  return 0;
}

// ──────────────────────────────────────────────────────────────────
// 2.4 Coinbase Premium — Part III.2 §2.4
// ──────────────────────────────────────────────────────────────────

/**
 * Coinbase premium = (coinbase_price / binance_price) - 1.
 *   > +0.20% → +0.15  (US institutional bid)
 *   > +0.05% → +0.05
 *   < -0.20% → -0.20
 *   < -0.05% → -0.05
 */
export function coinbasePremiumModifier(premium: number): number {
  if (!Number.isFinite(premium)) return 0;
  if (premium > 0.002) return 0.15;
  if (premium > 0.0005) return 0.05;
  if (premium < -0.002) return -0.2;
  if (premium < -0.0005) return -0.05;
  return 0;
}

// ──────────────────────────────────────────────────────────────────
// 2.5 ETF Flow — Part III.2 §2.5
// ──────────────────────────────────────────────────────────────────

/**
 * ETF 3-day cumulative net flow (USD).
 *   > +$1.5B → +0.20
 *   > +$500M → +0.10
 *   < -$1B   → -0.25
 *   < -$300M → -0.10
 */
export function etfFlowModifier(threeDayNetUsd: number): number {
  if (!Number.isFinite(threeDayNetUsd)) return 0;
  if (threeDayNetUsd > 1_500_000_000) return 0.2;
  if (threeDayNetUsd > 500_000_000) return 0.1;
  if (threeDayNetUsd < -1_000_000_000) return -0.25;
  if (threeDayNetUsd < -300_000_000) return -0.1;
  return 0;
}

// ──────────────────────────────────────────────────────────────────
// 2.6 Miner Outflow — Part III.2 §2.6 (BTC only)
// ──────────────────────────────────────────────────────────────────

/**
 * Miner outflow z-score (90d).
 *   z > +2 → -0.15  (miner selling pressure)
 *   z > +1 → -0.05
 *   z < -1.5 → +0.10
 *
 * Stub for B.2.
 */
export function minerOutflowModifier(zscore?: number): number {
  if (zscore == null || !Number.isFinite(zscore)) return 0;
  if (zscore > 2) return -0.15;
  if (zscore > 1) return -0.05;
  if (zscore < -1.5) return 0.1;
  return 0;
}

// ──────────────────────────────────────────────────────────────────
// 2.7 Long-Term Holder Supply — Part III.2 §2.7
// ──────────────────────────────────────────────────────────────────

/**
 * 30-day LTH supply change (fraction).
 *   > +2%  → +0.10  (accumulation)
 *   < -2%  → -0.15  (distribution)
 *
 * Stub for B.2.
 */
export function lthSupplyModifier(thirtyDayChange?: number): number {
  if (thirtyDayChange == null || !Number.isFinite(thirtyDayChange)) return 0;
  if (thirtyDayChange > 0.02) return 0.1;
  if (thirtyDayChange < -0.02) return -0.15;
  return 0;
}

// ──────────────────────────────────────────────────────────────────
// Modifier registry — used by score composer
// ──────────────────────────────────────────────────────────────────

/**
 * Per-modifier max absolute contribution, used to normalize the
 * sum into `[-1, 1]`. Matches the v6.5 §3.1.1 denominator of 1.35.
 */
export const MODIFIER_MAX_ABS: Readonly<Record<string, number>> = {
  netflow: 0.25,
  whale: 0.2,
  ssr: 0.2,
  coinbasePremium: 0.2,
  etfFlow: 0.25,
  minerOutflow: 0.15,
  lthSupply: 0.15,
};

export type ModifierName = keyof typeof MODIFIER_MAX_ABS;

export const ALL_MODIFIERS: readonly ModifierName[] = [
  "netflow",
  "whale",
  "ssr",
  "coinbasePremium",
  "etfFlow",
  "minerOutflow",
  "lthSupply",
];
