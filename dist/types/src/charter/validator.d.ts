/**
 * Strategy Charter validator.
 *
 * Implements the Part II.2 §3.1 contract: given a strategy definition
 * (indicator list + new indicators with backtest evidence flags),
 * return whether it passes the 7-dimension coverage check and the
 * three operating rules.
 *
 * Used by:
 *   - Test fixtures (validator.test.ts)
 *   - CI script BE/scripts/charter-validate.ts (added in B.1.a)
 *   - Runtime: every signal decision can be tagged with its
 *     coverage outcome for UI display.
 */
import { type Dimension, type RuleId } from "./charter";
export interface IndicatorRef {
    /** Indicator id matching keys in INDICATOR_REGISTRY. */
    name: string;
    /** Has this indicator been backtested for alpha? Charter rule 2. */
    hasBacktestEvidence?: boolean;
    /** Does this indicator emit a standalone signal? Charter rule 3. */
    emitsStandaloneSignal?: boolean;
    /**
     * Set this true for indicators newly added in the current PR.
     * Rule 2 only checks new indicators (existing ones are grandfathered).
     */
    isNew?: boolean;
}
export interface StrategyDefinition {
    name: string;
    /** All indicators consumed by this strategy. */
    indicators: IndicatorRef[];
}
export interface Violation {
    rule: RuleId;
    severity: "blocking" | "critical" | "warning";
    message: string;
    /** Optional hints for the offending indicators or dimensions. */
    context?: Record<string, unknown>;
}
export interface MissingDimension {
    dimension: Dimension;
    ko: string;
    suggested: readonly string[];
}
export interface ValidationResult {
    passed: boolean;
    charterVersion: string;
    strategy: string;
    /** Map of dimension → indicators that cover it in this strategy. */
    dimensionsCovered: Record<Dimension, string[]>;
    missingDimensions: MissingDimension[];
    violations: Violation[];
    /** Coverage count, e.g. `6/7`. */
    coverage: {
        covered: number;
        total: number;
    };
}
/**
 * Validate a strategy definition against the Charter.
 *
 * Returns `passed: true` only when:
 *   - all 7 dimensions are covered
 *   - no rule 1 / 2 / 3 violations
 *
 * `passed: false` with empty violations means coverage gap only —
 * the strategy can run with a UI warning but should add the missing
 * dimensions before being treated as production-ready.
 */
export declare function validateAgainstCharter(strategy: StrategyDefinition): ValidationResult;
/** Build a yaml-style string for CI / PR comments per Part II.2 §3.2. */
export declare function formatValidationReport(result: ValidationResult): string;
