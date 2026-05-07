/**
 * 7-dimension runtime assertion — v6.5 §4.1 Step 9.
 *
 * Every emitted signal must cover all 7 charter dimensions. Throws
 * a `CharterAssertionError` when any dimension is missing — calls
 * upstream catch and either downgrade to a warning or drop the
 * signal entirely depending on policy.
 *
 * Wraps `validateAgainstCharter` from B.1.a so the runtime path
 * shares the same registry as CI / PR validation.
 */

import {
  validateAgainstCharter,
  type IndicatorRef,
  type ValidationResult,
} from "../charter";

export class CharterAssertionError extends Error {
  readonly result: ValidationResult;
  constructor(message: string, result: ValidationResult) {
    super(message);
    this.name = "CharterAssertionError";
    this.result = result;
  }
}

export interface RuntimeIndicatorSet {
  strategy: string;
  indicators: IndicatorRef[];
}

/**
 * Throws when any of the 7 dimensions is uncovered or any rule
 * fires a critical/blocking violation. Warning-severity violations
 * (e.g. unknown indicators) are returned in the `result` so the
 * caller can log them but don't trip the assertion.
 */
export function assertSevenDimensions(
  set: RuntimeIndicatorSet
): ValidationResult {
  const result = validateAgainstCharter(set);

  if (result.missingDimensions.length > 0) {
    const dims = result.missingDimensions.map((m) => m.dimension).join(", ");
    throw new CharterAssertionError(
      `Charter violation: ${result.coverage.covered}/${result.coverage.total} dimensions covered, missing: ${dims}.`,
      result
    );
  }

  const blocking = result.violations.filter(
    (v) => v.severity === "blocking" || v.severity === "critical"
  );
  if (blocking.length > 0) {
    throw new CharterAssertionError(
      `Charter violation: ${blocking.length} blocking/critical rule violation(s) on '${set.strategy}'.`,
      result
    );
  }

  return result;
}
