/**
 * v6.5 §5.2 / §5.3 — macro/onchain boost on EXIT-B reversal score.
 *
 * Verifies the worked example: a base reversal of 0.138 (under
 * v6.3 alone, no exit) gains +0.10 from `tight` macro and +0.10
 * from `distribution` onchain → 0.338, crossing the 0.30 partial
 * threshold and triggering a 50% partial exit.
 */

import { describe, expect, test } from "vitest";
import type {
  CandlePatternMatch,
  TechnicalIndicators,
} from "@shared/types";

import { computeReversalScore, decideReversal } from "../reversal";

const baseInd: TechnicalIndicators = {
  rsi: 50,
  bbUpper: 110,
  bbMiddle: 100,
  bbLower: 90,
  adx: 22,
  plusDi: 22,
  minusDi: 19,
};

describe("v6.5 §5.3 worked example — boosts cross partial threshold", () => {
  test("base 0.138 + tight (+0.10) + distribution (+0.10) → 0.338 → partial 50%", () => {
    // Base reversal: minor DI cross, no ADX confirmation, no bearish
    // patterns. Construct an indicator state that produces ~0.13–0.14
    // base score: -DI just over +DI by ~10pts → diCross ≈ (10/30)×0.4 = 0.133.
    const ind: TechnicalIndicators = {
      ...baseInd,
      plusDi: 19,
      minusDi: 29, // (29-19)/30 = 0.333 → diCross 0.4×0.333 = 0.133
      adx: 20, // < 25 → no adxConfirmation
    };
    const noBearish: CandlePatternMatch[] = [];

    const baseResult = computeReversalScore({
      indicators: ind,
      bearishPatterns: noBearish,
    });
    expect(baseResult.score).toBeCloseTo(0.133, 2);

    const boosted = computeReversalScore({
      indicators: ind,
      bearishPatterns: noBearish,
      macroRegime: "tight",
      onchainRegime: "distribution",
    });
    expect(boosted.score).toBeCloseTo(0.333, 2);

    // The decision uses 0.50 / 0.30 thresholds — boosted should be
    // partial_exit; the un-boosted base should be null.
    const baseDecision = decideReversal({
      indicators: ind,
      bearishPatterns: noBearish,
    });
    expect(baseDecision.action).toBe(null);

    const boostedDecision = decideReversal({
      indicators: ind,
      bearishPatterns: noBearish,
      macroRegime: "tight",
      onchainRegime: "distribution",
    });
    expect(boostedDecision.action).toBe("partial_exit");
    expect(boostedDecision.ratio).toBe(0.5);
  });
});

describe("v6.5 §5.2 macro boost values", () => {
  test("crisis adds +0.20", () => {
    const r = computeReversalScore({
      indicators: baseInd,
      bearishPatterns: [],
      macroRegime: "crisis",
    });
    expect(r.breakdown.macroBoost).toBe(0.2);
  });

  test("flooded subtracts 0.10 (EXIT damped in bull environment)", () => {
    const r = computeReversalScore({
      indicators: { ...baseInd, plusDi: 19, minusDi: 25 }, // produce some base score
      bearishPatterns: [],
      macroRegime: "flooded",
    });
    expect(r.breakdown.macroBoost).toBe(-0.1);
    // base ≈ (25-19)/30 × 0.4 = 0.08 ; total = 0.08 - 0.10 = -0.02 (allowed; calculator doesn't clamp)
    expect(r.score).toBeLessThan(0);
  });

  test("neutral / easy → macroBoost 0", () => {
    const r1 = computeReversalScore({
      indicators: baseInd,
      bearishPatterns: [],
      macroRegime: "neutral",
    });
    const r2 = computeReversalScore({
      indicators: baseInd,
      bearishPatterns: [],
      macroRegime: "easy",
    });
    expect(r1.breakdown.macroBoost).toBe(0);
    expect(r2.breakdown.macroBoost).toBe(0);
  });
});

describe("v6.5 §5.2 onchain boost values", () => {
  test("strong_distribution adds +0.20", () => {
    const r = computeReversalScore({
      indicators: baseInd,
      bearishPatterns: [],
      onchainRegime: "strong_distribution",
    });
    expect(r.breakdown.onchainBoost).toBe(0.2);
  });

  test("distribution adds +0.10", () => {
    const r = computeReversalScore({
      indicators: baseInd,
      bearishPatterns: [],
      onchainRegime: "distribution",
    });
    expect(r.breakdown.onchainBoost).toBe(0.1);
  });

  test("strong_accumulation damps weak reversals (rs<0.7) by ×0.8", () => {
    // Build a base ~0.20 reversal then verify damp produces ~0.16.
    const ind: TechnicalIndicators = {
      ...baseInd,
      plusDi: 18,
      minusDi: 33, // (33-18)/30 = 0.5 → diCross 0.4×0.5 = 0.2
      adx: 20,
    };
    const undamped = computeReversalScore({
      indicators: ind,
      bearishPatterns: [],
    });
    expect(undamped.score).toBeCloseTo(0.2, 2);

    const damped = computeReversalScore({
      indicators: ind,
      bearishPatterns: [],
      onchainRegime: "strong_accumulation",
    });
    // 0.20 × 0.8 = 0.16
    expect(damped.score).toBeCloseTo(0.16, 2);
  });

  test("strong_accumulation does NOT damp strong reversals (rs >= 0.7)", () => {
    const strongInd: TechnicalIndicators = {
      ...baseInd,
      plusDi: 5,
      minusDi: 35, // diCross close to 0.40
      adx: 35,
    };
    const bearish: CandlePatternMatch[] = [
      {
        name: "bearishEngulfing",
        bias: "bearish",
        candlesAgo: 0,
        strength: 90,
      },
    ];
    const r = computeReversalScore({
      indicators: strongInd,
      bearishPatterns: bearish,
      onchainRegime: "strong_accumulation",
      trendlineState: "broken",
    });
    // Strong base; ×0.8 damp not applied.
    expect(r.score).toBeGreaterThanOrEqual(0.7);
  });

  test("neutral / accumulation → onchainBoost 0", () => {
    const r1 = computeReversalScore({
      indicators: baseInd,
      bearishPatterns: [],
      onchainRegime: "neutral",
    });
    const r2 = computeReversalScore({
      indicators: baseInd,
      bearishPatterns: [],
      onchainRegime: "accumulation",
    });
    expect(r1.breakdown.onchainBoost).toBe(0);
    expect(r2.breakdown.onchainBoost).toBe(0);
  });
});

describe("v6.5 boost breakdown shape", () => {
  test("breakdown carries macroBoost / onchainBoost fields", () => {
    const r = computeReversalScore({
      indicators: baseInd,
      bearishPatterns: [],
      macroRegime: "tight",
      onchainRegime: "distribution",
    });
    expect(r.breakdown).toHaveProperty("macroBoost");
    expect(r.breakdown).toHaveProperty("onchainBoost");
    expect(r.breakdown.total).toBeCloseTo(0.2, 5);
  });
});
