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
import { type IndicatorRef, type ValidationResult } from "../charter";
export declare class CharterAssertionError extends Error {
    readonly result: ValidationResult;
    constructor(message: string, result: ValidationResult);
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
export declare function assertSevenDimensions(set: RuntimeIndicatorSet): ValidationResult;
