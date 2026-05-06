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

import {
  CHARTER_VERSION,
  DIMENSIONS,
  DIMENSION_META,
  RULES,
  type Dimension,
  type RuleId,
} from "./charter";
import { getIndicatorMeta, INDICATOR_REGISTRY } from "./dimension-mapping";

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
  coverage: { covered: number; total: number };
}

function buildDimensionCoverage(
  indicators: IndicatorRef[]
): { coverage: Record<Dimension, string[]>; unknown: string[] } {
  const coverage = Object.fromEntries(
    DIMENSIONS.map((d) => [d, [] as string[]])
  ) as Record<Dimension, string[]>;
  const unknown: string[] = [];

  for (const ind of indicators) {
    const meta = getIndicatorMeta(ind.name);
    if (!meta) {
      unknown.push(ind.name);
      continue;
    }
    coverage[meta.dimension].push(ind.name);
  }

  return { coverage, unknown };
}

function checkRule1(coverage: Record<Dimension, string[]>): Violation[] {
  const violations: Violation[] = [];

  for (const dim of DIMENSIONS) {
    const indicators = coverage[dim];
    if (indicators.length <= 1) continue;

    // Pair-up exception: explicit allowsSameDimensionPair
    const pairs = new Set<string>();
    for (const name of indicators) {
      const meta = INDICATOR_REGISTRY[name];
      if (!meta?.allowsSameDimensionPair) continue;
      for (const allowed of meta.allowsSameDimensionPair) {
        if (indicators.includes(allowed)) {
          pairs.add([name, allowed].sort().join("+"));
        }
      }
    }

    // Number of indicators not covered by an explicit allowed-pair entry
    const allowedNames = new Set<string>();
    for (const pair of pairs) {
      for (const n of pair.split("+")) allowedNames.add(n);
    }
    const offending = indicators.filter((n) => !allowedNames.has(n));

    if (offending.length + (allowedNames.size > 0 ? 1 : 0) > 1) {
      violations.push({
        rule: RULES.R1_DIMENSION_DUPLICATE,
        severity: "critical",
        message: `Dimension '${dim}' has multiple indicators without an allowed-pair exception: ${indicators.join(", ")}`,
        context: { dimension: dim, indicators },
      });
    }
  }

  return violations;
}

function checkRule2(indicators: IndicatorRef[]): Violation[] {
  return indicators
    .filter((ind) => ind.isNew && !ind.hasBacktestEvidence)
    .map<Violation>((ind) => ({
      rule: RULES.R2_BACKTEST_ALPHA,
      severity: "blocking",
      message: `New indicator '${ind.name}' lacks backtest alpha evidence (Wilson 95% CI vs baseline, ≥100 signals, 365d window).`,
      context: { indicator: ind.name },
    }));
}

function checkRule3(indicators: IndicatorRef[]): Violation[] {
  return indicators
    .filter((ind) => ind.emitsStandaloneSignal)
    .map<Violation>((ind) => ({
      rule: RULES.R3_NO_STANDALONE_SIGNAL,
      severity: "critical",
      message: `Indicator '${ind.name}' emits a standalone signal. All non-BBDX indicators must operate as weight modifiers only.`,
      context: { indicator: ind.name },
    }));
}

function buildMissing(coverage: Record<Dimension, string[]>): MissingDimension[] {
  return DIMENSIONS.filter((d) => coverage[d].length === 0).map((d) => ({
    dimension: d,
    ko: DIMENSION_META[d].ko,
    suggested: DIMENSION_META[d].fallback,
  }));
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
export function validateAgainstCharter(
  strategy: StrategyDefinition
): ValidationResult {
  const { coverage, unknown } = buildDimensionCoverage(strategy.indicators);
  const violations: Violation[] = [
    ...checkRule1(coverage),
    ...checkRule2(strategy.indicators),
    ...checkRule3(strategy.indicators),
  ];

  if (unknown.length > 0) {
    violations.push({
      rule: RULES.R1_DIMENSION_DUPLICATE,
      severity: "warning",
      message: `Unknown indicators (not in registry): ${unknown.join(", ")}. Add them to dimension-mapping.ts.`,
      context: { unknown },
    });
  }

  const missingDimensions = buildMissing(coverage);
  const covered = DIMENSIONS.filter((d) => coverage[d].length > 0).length;
  const passed = violations.length === 0 && missingDimensions.length === 0;

  return {
    passed,
    charterVersion: CHARTER_VERSION,
    strategy: strategy.name,
    dimensionsCovered: coverage,
    missingDimensions,
    violations,
    coverage: { covered, total: DIMENSIONS.length },
  };
}

/** Build a yaml-style string for CI / PR comments per Part II.2 §3.2. */
export function formatValidationReport(result: ValidationResult): string {
  const lines: string[] = [];
  lines.push(`PR validation: ${result.strategy}`);
  lines.push(
    `Result: ${result.passed ? "✓ pass" : "⚠️ partial"} (charter ${result.charterVersion})`
  );
  lines.push("");

  for (const ruleId of [
    RULES.R1_DIMENSION_DUPLICATE,
    RULES.R2_BACKTEST_ALPHA,
    RULES.R3_NO_STANDALONE_SIGNAL,
  ] as const) {
    const ruleViolations = result.violations.filter((v) => v.rule === ruleId);
    const status = ruleViolations.length === 0 ? "✓" : "✗";
    const label =
      ruleId === RULES.R1_DIMENSION_DUPLICATE
        ? "rule 1 (dimension duplicate)"
        : ruleId === RULES.R2_BACKTEST_ALPHA
          ? "rule 2 (backtest alpha)"
          : "rule 3 (no standalone signal)";
    lines.push(`  ${status} ${label}`);
    for (const v of ruleViolations) {
      lines.push(`      - ${v.message}`);
    }
  }

  lines.push("");
  lines.push(
    `  ${result.coverage.covered === DIMENSIONS.length ? "✓" : "⚠️"} 7-dimension coverage: ${result.coverage.covered}/${result.coverage.total}`
  );
  for (const d of DIMENSIONS) {
    const inds = result.dimensionsCovered[d];
    const mark = inds.length > 0 ? "✓" : "⚠️";
    lines.push(
      `      ${mark} ${DIMENSION_META[d].ko} (${d}): ${inds.length > 0 ? inds.join(", ") : "absent"}`
    );
  }

  if (result.missingDimensions.length > 0) {
    lines.push("");
    lines.push("  📋 Recommendations:");
    for (const m of result.missingDimensions) {
      lines.push(`      - ${m.ko}: try ${m.suggested.join(" or ")}`);
    }
  }

  return lines.join("\n");
}
