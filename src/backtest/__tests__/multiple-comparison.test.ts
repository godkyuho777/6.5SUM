/**
 * Multiple-comparison correction tests — BH FDR + sample sufficiency.
 * DUAL_BACKTEST_ENGINE_PLAN §2.3 / §6.1.
 */

import { describe, expect, test } from "vitest";
import {
  benjaminiHochberg,
  applyMultipleComparisonCorrection,
  type UserHypothesis,
} from "../statistics/multiple-comparison";
import { classifySampleSufficiency } from "../engines/single-indicator";

describe("benjaminiHochberg — FDR control", () => {
  test("empty array returns empty", () => {
    expect(benjaminiHochberg([])).toEqual([]);
  });

  test("all p-values 1.0 → none significant", () => {
    const r = benjaminiHochberg([1, 1, 1, 1, 1], 0.1);
    expect(r.every((b) => b === false)).toBe(true);
  });

  test("all p-values 0 → all significant", () => {
    const r = benjaminiHochberg([0, 0, 0, 0], 0.1);
    expect(r.every((b) => b === true)).toBe(true);
  });

  test("classic example — 4 hypotheses, q=0.1", () => {
    // p-values [0.008, 0.039, 0.041, 0.9]; m=4, q=0.1
    // critical_i = (i/4)*0.1 = [0.025, 0.05, 0.075, 0.1]
    // sorted p: 0.008, 0.039, 0.041, 0.9
    // 0.008 ≤ 0.025 ✓, 0.039 ≤ 0.05 ✓, 0.041 ≤ 0.075 ✓, 0.9 ≤ 0.1 ✗
    // → 3 significant (the first 3)
    const r = benjaminiHochberg([0.008, 0.039, 0.041, 0.9], 0.1);
    expect(r).toEqual([true, true, true, false]);
  });

  test("preserves original input order", () => {
    // shuffled input
    const r = benjaminiHochberg([0.9, 0.008, 0.041, 0.039], 0.1);
    // index 0 is p=0.9 (not significant), others significant
    expect(r[0]).toBe(false);
    expect(r[1]).toBe(true);
    expect(r[2]).toBe(true);
    expect(r[3]).toBe(true);
  });

  test("stricter q produces fewer discoveries", () => {
    const ps = [0.04, 0.045, 0.05, 0.5];
    const lenient = benjaminiHochberg(ps, 0.2).filter(Boolean).length;
    const strict = benjaminiHochberg(ps, 0.05).filter(Boolean).length;
    expect(strict).toBeLessThanOrEqual(lenient);
  });
});

describe("applyMultipleComparisonCorrection — wraps single result", () => {
  test("single result with no prior hypotheses passes through", () => {
    const out = applyMultipleComparisonCorrection(
      { p_value: 0.01, alpha_significant: true },
      [],
    );
    expect(out.total_hypotheses).toBe(1);
    // single hypothesis: 0.01 ≤ (1/1)*0.1 = 0.1 ✓
    expect(out.alpha_significant_after_correction).toBe(true);
  });

  test("inflated false-positive risk — many prior tests reduce significance", () => {
    // 19 prior tested hypotheses with high p-values + our shiny p=0.04
    const prior: UserHypothesis[] = Array.from({ length: 19 }, (_, i) => ({
      user_id: "u",
      hypothesis_id: `h${i}`,
      registered_at: 0,
      description: "",
      status: "tested" as const,
      test_count: 1,
      p_value: 0.9, // all bad
    }));
    const out = applyMultipleComparisonCorrection(
      { p_value: 0.04, alpha_significant: true },
      prior,
      0.1,
    );
    // 20 total, sorted: 0.04, then nineteen 0.9s
    // critical_1 = 1/20 * 0.1 = 0.005 → 0.04 > 0.005 → NOT significant after BH
    expect(out.alpha_significant_after_correction).toBe(false);
  });

  test("ignores prior hypotheses that have not been tested", () => {
    const prior: UserHypothesis[] = [
      {
        user_id: "u",
        hypothesis_id: "h-unused",
        registered_at: 0,
        description: "",
        status: "registered" as const,
        test_count: 0,
      },
    ];
    const out = applyMultipleComparisonCorrection(
      { p_value: 0.01, alpha_significant: true },
      prior,
    );
    // only this result counts (others not tested) → m=1
    expect(out.total_hypotheses).toBe(1);
    expect(out.alpha_significant_after_correction).toBe(true);
  });
});

describe("classifySampleSufficiency — DUAL_BACKTEST §6.1", () => {
  test("n=0 → insufficient", () => {
    expect(classifySampleSufficiency(0, 0)).toBe("insufficient");
  });

  test("n=10 → insufficient (CI too wide)", () => {
    expect(classifySampleSufficiency(10, 0.5)).toBe("insufficient");
  });

  test("n=50 winRate at extreme (0.85) → marginal (narrow CI)", () => {
    // Wilson CI width near extreme winRate is narrower than mid-range.
    // n=50, p=0.85 → CI width ≈ 0.18 < 0.25 → marginal
    expect(classifySampleSufficiency(50, 0.85)).toBe("marginal");
  });

  test("n=50 winRate near 0.5 → insufficient (CI too wide)", () => {
    // n=50, p=0.6 → CI width ≈ 0.26 > 0.25 → insufficient per spec.
    expect(classifySampleSufficiency(50, 0.6)).toBe("insufficient");
  });

  test("n=200 winRate≈0.6 → sufficient", () => {
    // Wilson CI width at n=200, p=0.6 ≈ 0.135 < 0.15 → sufficient
    expect(classifySampleSufficiency(200, 0.6)).toBe("sufficient");
  });

  test("extreme winRate widens CI → may downgrade", () => {
    // n=50, winRate=0.95: CI width small at extremes
    const c = classifySampleSufficiency(50, 0.95);
    expect(["sufficient", "marginal"]).toContain(c);
  });
});
