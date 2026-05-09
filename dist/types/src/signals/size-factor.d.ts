/**
 * Position size factor — v6.5 §4.1 Step 8.
 *
 * Maps `final_confidence ∈ [0, 100]` to a size class enforced
 * downstream by capital protection.
 *
 *   < 40   → reject (no entry)
 *   40..59 → small  (1% of capital)
 *   ≥ 60   → normal (5% cap)
 *
 * The exact capital fractions live in `charter/limits.ts`; this
 * module only emits the labels.
 */
export type SizeFactor = "reject" | "small" | "normal";
export declare function computeSizeFactor(confidence: number): SizeFactor;
