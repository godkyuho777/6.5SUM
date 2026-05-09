/**
 * CryptoQuant source — Exchange Netflow fetcher.
 *
 * STUB FOR PR-1. The function shape is final, but the body returns
 * `null` until PR-2 wires the real CryptoQuant Free API endpoint
 * and computes the 24h-vs-30d-baseline z-score.
 *
 * Spec: Part III.2 §1 (CryptoQuant Free, 1h cadence).
 */

export interface NetflowSnapshot {
  /** Symbol (e.g. "BTCUSDT"). */
  symbol: string;
  /** Z-score of the 24h netflow vs the 30d rolling baseline. */
  zscore: number;
  /** UNIX seconds timestamp of the source data. */
  asOf: number;
}

/**
 * Fetch the latest exchange netflow z-score for a symbol.
 *
 * @returns null when the source is unavailable; null also during PR-1
 *          before the real fetcher is wired.
 */
export async function fetchExchangeNetflow(
  _symbol: string
): Promise<NetflowSnapshot | null> {
  // TODO PR-2: hit CryptoQuant Free API, compute z-score from a
  // rolling 30-day window of net (deposits - withdrawals).
  return null;
}
