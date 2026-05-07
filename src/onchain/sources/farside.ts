/**
 * Farside Investors ETF flow scraper — BTC and ETH spot ETFs.
 *
 * STUB FOR PR-1. PR-2 will scrape the Farside daily-flow tables and
 * cache the 3-day cumulative net.
 *
 * Spec: Part III.2 §2.5. Keep a "stale data" threshold (>48h) in PR-2
 * so a broken scraper doesn't silently zero out the modifier.
 */

export interface EtfFlowSnapshot {
  symbol: "BTCUSDT" | "ETHUSDT";
  /** Cumulative net flow in USD over the last 3 trading days. */
  threeDayNetUsd: number;
  /** UNIX seconds; check freshness in caller. */
  asOf: number;
}

export async function fetchEtfFlow(
  _symbol: "BTCUSDT" | "ETHUSDT"
): Promise<EtfFlowSnapshot | null> {
  // TODO PR-2: scrape Farside Investors HTML, sum last 3 trading days.
  return null;
}
