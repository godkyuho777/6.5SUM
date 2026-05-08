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
export declare const INDICATOR_REGISTRY: Readonly<Record<string, IndicatorMeta>>;
export declare function getIndicatorMeta(name: string): IndicatorMeta | undefined;
