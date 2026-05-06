/**
 * Indicator → dimension mapping.
 *
 * Per spec Part II.2 §8: this table stays human-curated. LLM auto-mapping
 * is unreliable. Add a new indicator here when you implement it; the
 * validator uses this table to detect duplicate-dimension violations.
 */

import type { Dimension } from "./charter";

export interface IndicatorMeta {
  /** Canonical indicator id used in code. */
  name: string;
  /** Primary dimension this indicator covers. */
  dimension: Dimension;
  /**
   * Optional secondary dimensions. When set, the indicator is treated
   * as cross-dimensional (e.g. ATR is volatility-primary but feeds
   * trend-quality scoring). Duplicate-dimension check ignores secondary
   * mappings unless they're the primary for two indicators in the same
   * strategy.
   */
  secondary?: Dimension[];
  /**
   * Some indicators measure a different angle of the same dimension and
   * are explicitly allowed to coexist (charter Rule 1 exception).
   * Example: MACD_histogram + RSI are both momentum but measure
   * different angles, so both can appear in one strategy.
   */
  allowsSameDimensionPair?: string[];
}

export const INDICATOR_REGISTRY: Readonly<Record<string, IndicatorMeta>> = {
  // ── 1. Momentum
  RSI: {
    name: "RSI",
    dimension: "momentum",
    allowsSameDimensionPair: ["MACD_histogram"],
  },
  MACD_histogram: {
    name: "MACD_histogram",
    dimension: "momentum",
    allowsSameDimensionPair: ["RSI"],
  },
  ROC: { name: "ROC", dimension: "momentum" },

  // ── 2. Volatility
  BB: { name: "BB", dimension: "volatility" },
  ATR: { name: "ATR", dimension: "volatility", secondary: ["trend"] },
  BB_width: { name: "BB_width", dimension: "volatility" },

  // ── 3. Trend
  ADX: { name: "ADX", dimension: "trend" },
  "DI+/-": { name: "DI+/-", dimension: "trend" },
  EMA_Ribbon: { name: "EMA_Ribbon", dimension: "trend" },
  EMA: { name: "EMA", dimension: "trend" },
  EMA_9_21_50: { name: "EMA_9_21_50", dimension: "trend" },

  // ── 4. Volume / liquidity
  Volume_zscore: { name: "Volume_zscore", dimension: "volume" },
  OBV: { name: "OBV", dimension: "volume" },
  CVD: { name: "CVD", dimension: "volume" },
  VWAP: { name: "VWAP", dimension: "volume" },
  Volume_Profile: { name: "Volume_Profile", dimension: "volume" },

  // ── 5. Structure
  Fibonacci: { name: "Fibonacci", dimension: "structure" },
  Trendline: { name: "Trendline", dimension: "structure" },
  Order_Block: { name: "Order_Block", dimension: "structure" },
  Liquidity_Pool: { name: "Liquidity_Pool", dimension: "structure" },
  Wave_Tracker: { name: "Wave_Tracker", dimension: "structure" },
  Candle_Pattern: { name: "Candle_Pattern", dimension: "structure" },

  // ── 6. Macro
  DXY: { name: "DXY", dimension: "macro" },
  "SOFR-IORB": { name: "SOFR-IORB", dimension: "macro" },
  "Fear&Greed": { name: "Fear&Greed", dimension: "macro" },
  BTC_dominance: { name: "BTC_dominance", dimension: "macro" },
  Macro_Liquidity: { name: "Macro_Liquidity", dimension: "macro" },

  // ── 7. Onchain
  Exchange_Netflow: { name: "Exchange_Netflow", dimension: "onchain" },
  Whale_Alert: { name: "Whale_Alert", dimension: "onchain" },
  Stablecoin_Supply: { name: "Stablecoin_Supply", dimension: "onchain" },
  Coinbase_Premium: { name: "Coinbase_Premium", dimension: "onchain" },
  ETF_Flow: { name: "ETF_Flow", dimension: "onchain" },
  Miner_Outflow: { name: "Miner_Outflow", dimension: "onchain" },
  LTH_Supply: { name: "LTH_Supply", dimension: "onchain" },
};

export function getIndicatorMeta(name: string): IndicatorMeta | undefined {
  return INDICATOR_REGISTRY[name];
}
