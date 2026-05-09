/**
 * Coinbase premium source — `(coinbase / binance) - 1`.
 *
 * STUB FOR PR-1. Will hit Coinbase public ticker + reuse the
 * existing Bybit/Binance feed in PR-2.
 *
 * Spec: Part III.2 §2.4.
 */

export interface CoinbasePremiumSnapshot {
  symbol: string;
  /** (coinbase_price / binance_or_bybit_price) - 1, dimensionless. */
  premium: number;
  asOf: number;
}

export async function fetchCoinbasePremium(
  _symbol: string
): Promise<CoinbasePremiumSnapshot | null> {
  // TODO PR-2: pull Coinbase public ticker (no auth required) and
  // pair-divide against the existing Bybit feed in `bybit.ts`.
  return null;
}
