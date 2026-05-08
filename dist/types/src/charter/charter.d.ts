/**
 * Strategy Charter — 7 information dimensions × 3 operating rules.
 *
 * Single source of truth for what every BBDX signal, indicator, and
 * strategy must adhere to. See repo-root STRATEGY_CHARTER.md for the
 * narrative version. This module is the runtime/programmatic mirror.
 */
export declare const DIMENSIONS: readonly ["momentum", "volatility", "trend", "volume", "structure", "macro", "onchain"];
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
export declare const DIMENSION_META: Readonly<Record<Dimension, DimensionMeta>>;
/**
 * Capital protection limits — Part I §V. These are non-negotiable
 * regardless of signal strength or backtest results.
 */
export declare const CAPITAL_LIMITS: {
    readonly perTradeMaxRisk: 0.01;
    readonly positionMax: 0.05;
    readonly dailyLossLimit: 0.03;
    readonly dryRunDays: 30;
    readonly circuitBreakerPauseMs: number;
};
/** Operating rule identifiers. Used by the validator and audit log. */
export declare const RULES: {
    readonly R1_DIMENSION_DUPLICATE: 1;
    readonly R2_BACKTEST_ALPHA: 2;
    readonly R3_NO_STANDALONE_SIGNAL: 3;
};
export type RuleId = (typeof RULES)[keyof typeof RULES];
/** Charter document version. Bump on any narrative change. */
export declare const CHARTER_VERSION = "v1.0";
