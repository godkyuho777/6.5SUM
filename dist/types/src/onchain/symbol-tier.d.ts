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
export type OnchainTier = "btc" | "eth" | "major_alt" | "small_alt";
/**
 * Classify a symbol into its onchain tier. Unknown symbols default
 * to `small_alt` so the modifier pipeline always returns *something*
 * — surface "data sparse" in the UI rather than silently zeroing.
 */
export declare function getOnchainTier(symbol: string): OnchainTier;
/** Modifier names enabled for a tier. Drives `composeOnchainScore`. */
export declare const TIER_MODIFIERS: Readonly<Record<OnchainTier, readonly string[]>>;
/**
 * Coverage label used by the FE. "data sparse" tells the user that
 * fewer modifiers fed the score, so confidence is lower.
 */
export declare function tierCoverageLabel(tier: OnchainTier): string;
/** Whether a known symbol is in our scan universe. Used by tests. */
export declare function isKnownSymbol(symbol: string): boolean;
