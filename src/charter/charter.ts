/**
 * Strategy Charter — 7 information dimensions × 3 operating rules.
 *
 * Single source of truth for what every BBDX signal, indicator, and
 * strategy must adhere to. See repo-root STRATEGY_CHARTER.md for the
 * narrative version. This module is the runtime/programmatic mirror.
 */

export const DIMENSIONS = [
  "momentum",
  "volatility",
  "trend",
  "volume",
  "structure",
  "macro",
  "onchain",
] as const;

export type Dimension = (typeof DIMENSIONS)[number];

export interface DimensionMeta {
  id: Dimension;
  /** Korean name from the charter text. */
  ko: string;
  /** What this dimension measures. */
  measures: string;
  /** Standard indicators that cover this dimension. */
  standardIndicators: readonly string[];
  /** Tradelab-recommended fallback when missing. */
  fallback: readonly string[];
}

export const DIMENSION_META: Readonly<Record<Dimension, DimensionMeta>> = {
  momentum: {
    id: "momentum",
    ko: "모멘텀",
    measures: "Direction and strength of price movement",
    standardIndicators: ["RSI", "MACD_histogram", "ROC"],
    fallback: ["RSI(14)"],
  },
  volatility: {
    id: "volatility",
    ko: "변동성",
    measures: "Magnitude of price fluctuation",
    standardIndicators: ["Bollinger_Bands", "ATR", "BB_width"],
    fallback: ["BB(20,2)"],
  },
  trend: {
    id: "trend",
    ko: "추세",
    measures: "Trend strength and direction",
    standardIndicators: ["ADX", "+DI/-DI", "EMA_Ribbon"],
    fallback: ["ADX(14)", "EMA(50/200)"],
  },
  volume: {
    id: "volume",
    ko: "거래량/유동성",
    measures: "Real buyer/seller commitment",
    standardIndicators: ["Volume_zscore", "OBV", "CVD"],
    fallback: ["Volume_zscore (EMA50 baseline)"],
  },
  structure: {
    id: "structure",
    ko: "시장 구조",
    measures: "Meaningful support/resistance levels",
    standardIndicators: ["Fibonacci", "Trendline", "Order_Block", "Liquidity_Pool"],
    fallback: ["Fibonacci", "Trendline"],
  },
  macro: {
    id: "macro",
    ko: "거시 컨텍스트",
    measures: "Market-wide risk appetite",
    standardIndicators: ["DXY", "SOFR-IORB", "Fear&Greed", "BTC_dominance"],
    fallback: ["Fear&Greed", "DXY"],
  },
  onchain: {
    id: "onchain",
    ko: "온체인",
    measures: "Real coin movement and whale behavior",
    standardIndicators: [
      "Exchange_Netflow",
      "Whale_Alert",
      "Stablecoin_Supply",
      "Coinbase_Premium",
    ],
    fallback: ["Exchange_Netflow", "Whale_Alert"],
  },
};

/**
 * Capital protection limits — Part I §V. These are non-negotiable
 * regardless of signal strength or backtest results.
 */
export const CAPITAL_LIMITS = {
  perTradeMaxRisk: 0.01, // 1% of capital
  positionMax: 0.05, // 5% of capital
  dailyLossLimit: 0.03, // 3% — triggers 24h re-entry block
  dryRunDays: 30, // bots must dry-run 30 days before going live
  circuitBreakerPauseMs: 30 * 60 * 1000, // 30 min freeze on triple-axis trigger
} as const;

/** Operating rule identifiers. Used by the validator and audit log. */
export const RULES = {
  R1_DIMENSION_DUPLICATE: 1,
  R2_BACKTEST_ALPHA: 2,
  R3_NO_STANDALONE_SIGNAL: 3,
} as const;

export type RuleId = (typeof RULES)[keyof typeof RULES];

/** Charter document version. Bump on any narrative change. */
export const CHARTER_VERSION = "v1.0";
