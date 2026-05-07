/**
 * Per-symbol onchain tier — v6.5 §3.3.
 *
 * Different symbols have different onchain data availability. BTC has
 * the deepest coverage (all 7 modifiers), ETH almost as deep, major
 * alts get only the spot-market modifiers, and small caps have to
 * rely on Netflow + Whale alone.
 *
 * Source-of-truth list of "major alts" lives here for now. Move to a
 * config or env-driven list when symbol coverage stabilizes.
 */

import { TOP_COINS } from "@shared/types";

export type OnchainTier = "btc" | "eth" | "major_alt" | "small_alt";

/** Top-30-ish liquid alts that have decent CEX-flow data and SSR proxies. */
const MAJOR_ALT_SET: ReadonlySet<string> = new Set([
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "ADAUSDT",
  "AVAXUSDT",
  "DOGEUSDT",
  "TONUSDT",
  "LINKUSDT",
  "DOTUSDT",
  "MATICUSDT",
  "POLUSDT",
  "TRXUSDT",
  "LTCUSDT",
  "BCHUSDT",
  "ATOMUSDT",
  "NEARUSDT",
  "APTUSDT",
  "ARBUSDT",
  "OPUSDT",
  "SUIUSDT",
  "INJUSDT",
  "TIAUSDT",
  "SEIUSDT",
  "FILUSDT",
  "RUNEUSDT",
  "ICPUSDT",
  "HBARUSDT",
  "RENDERUSDT",
  "FETUSDT",
  "PEPEUSDT",
  "SHIBUSDT",
]);

/**
 * Classify a symbol into its onchain tier. Unknown symbols default
 * to `small_alt` so the modifier pipeline always returns *something*
 * — surface "data sparse" in the UI rather than silently zeroing.
 */
export function getOnchainTier(symbol: string): OnchainTier {
  const sym = symbol.toUpperCase();
  if (sym === "BTCUSDT" || sym === "BTCUSD") return "btc";
  if (sym === "ETHUSDT" || sym === "ETHUSD") return "eth";
  if (MAJOR_ALT_SET.has(sym)) return "major_alt";
  return "small_alt";
}

/** Modifier names enabled for a tier. Drives `composeOnchainScore`. */
export const TIER_MODIFIERS: Readonly<Record<OnchainTier, readonly string[]>> = {
  btc: [
    "netflow",
    "whale",
    "ssr",
    "coinbasePremium",
    "etfFlow",
    "minerOutflow",
    "lthSupply",
  ],
  eth: ["netflow", "whale", "ssr", "coinbasePremium", "etfFlow", "lthSupply"],
  major_alt: ["netflow", "whale", "ssr", "coinbasePremium"],
  small_alt: ["netflow", "whale"],
};

/**
 * Coverage label used by the FE. "data sparse" tells the user that
 * fewer modifiers fed the score, so confidence is lower.
 */
export function tierCoverageLabel(tier: OnchainTier): string {
  const count = TIER_MODIFIERS[tier].length;
  switch (tier) {
    case "btc":
      return `${count} modifiers (full coverage)`;
    case "eth":
      return `${count} modifiers (no miner outflow)`;
    case "major_alt":
      return `${count} modifiers (CEX flows only)`;
    case "small_alt":
      return `${count} modifiers (data sparse — Netflow + Whale only)`;
  }
}

/** Whether a known symbol is in our scan universe. Used by tests. */
export function isKnownSymbol(symbol: string): boolean {
  return TOP_COINS.includes(symbol.toUpperCase());
}
