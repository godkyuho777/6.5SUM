import { describe, expect, test } from "vitest";

import { computeOnchainScore, ONCHAIN_MULTIPLIERS } from "../score";

describe("computeOnchainScore — composition", () => {
  test("zero inputs → score 0, neutral regime, mult 1.0", () => {
    const r = computeOnchainScore("BTCUSDT", {});
    expect(r.score).toBe(0);
    expect(r.regime).toBe("neutral");
    expect(r.mult).toBe(1.0);
  });

  test("v6.5 §3.4 BTC accumulation worked example reproduces", () => {
    // Inputs from the spec example (Part 3.4):
    //   netflow z=-2.4   → +0.20
    //   whale net=+$180M → +0.07
    //   ssr z=-1.8       → +0.15
    //   coinbase +0.08%  → +0.05
    //   etf 3d=+$650M    → +0.10
    //   miner z=+0.3     → 0
    //   lth +1.5%        → 0
    // total = 0.57 → score = 0.57 / 1.35 ≈ 0.422 → accumulation regime → 1.15
    const r = computeOnchainScore("BTCUSDT", {
      netflowZscore: -2.4,
      whaleNetUsd: 180_000_000,
      ssrZscore: -1.8,
      coinbasePremium: 0.0008,
      etfFlowThreeDayUsd: 650_000_000,
      minerOutflowZscore: 0.3,
      lthSupplyThirtyDayChange: 0.015,
    });

    expect(r.score).toBeCloseTo(0.422, 2);
    expect(r.regime).toBe("accumulation");
    expect(r.mult).toBe(ONCHAIN_MULTIPLIERS.accumulation);
  });

  test("score is clamped to [-1, 1]", () => {
    const veryBullish = computeOnchainScore("BTCUSDT", {
      netflowZscore: -10,
      whaleNetUsd: 5_000_000_000,
      ssrZscore: -10,
      coinbasePremium: 0.05,
      etfFlowThreeDayUsd: 10_000_000_000,
      minerOutflowZscore: -10,
      lthSupplyThirtyDayChange: 1,
    });
    expect(veryBullish.score).toBeLessThanOrEqual(1);
    expect(veryBullish.score).toBeGreaterThanOrEqual(-1);

    const veryBearish = computeOnchainScore("BTCUSDT", {
      netflowZscore: 10,
      whaleNetUsd: -5_000_000_000,
      ssrZscore: 10,
      coinbasePremium: -0.05,
      etfFlowThreeDayUsd: -10_000_000_000,
      minerOutflowZscore: 10,
      lthSupplyThirtyDayChange: -1,
    });
    expect(veryBearish.score).toBeLessThanOrEqual(1);
    expect(veryBearish.score).toBeGreaterThanOrEqual(-1);
  });
});

describe("computeOnchainScore — regime boundaries", () => {
  // The boundary inputs are ones where the v6.5 §3.1.2 thresholds
  // (0.6 / 0.2 / -0.2 / -0.6) are crossed by carefully chosen inputs.

  test("score > 0.6 → strong_accumulation", () => {
    // netflow +0.2 + ssr +0.15 + coinbase +0.15 + etf +0.20 + whale +0.15 = 0.85
    // 0.85 / 1.35 ≈ 0.63 → strong_accumulation
    const r = computeOnchainScore("BTCUSDT", {
      netflowZscore: -3,
      whaleNetUsd: 500_000_000,
      ssrZscore: -2,
      coinbasePremium: 0.005,
      etfFlowThreeDayUsd: 2_000_000_000,
    });
    expect(r.regime).toBe("strong_accumulation");
    expect(r.mult).toBe(1.3);
  });

  test("score < -0.6 → strong_distribution", () => {
    const r = computeOnchainScore("BTCUSDT", {
      netflowZscore: 3,
      whaleNetUsd: -500_000_000,
      ssrZscore: 2,
      coinbasePremium: -0.005,
      etfFlowThreeDayUsd: -2_000_000_000,
    });
    expect(r.regime).toBe("strong_distribution");
    expect(r.mult).toBe(0.7);
  });
});

describe("computeOnchainScore — tier-aware enabled modifiers", () => {
  test("BTC enables all 7 — every breakdown slot can be non-zero", () => {
    const r = computeOnchainScore("BTCUSDT", {
      netflowZscore: -3,
      whaleNetUsd: 500_000_000,
      ssrZscore: -2,
      coinbasePremium: 0.005,
      etfFlowThreeDayUsd: 2_000_000_000,
      minerOutflowZscore: -2,
      lthSupplyThirtyDayChange: 0.05,
    });
    expect(r.tier).toBe("btc");
    expect(r.breakdown.netflow).not.toBe(0);
    expect(r.breakdown.whale).not.toBe(0);
    expect(r.breakdown.ssr).not.toBe(0);
    expect(r.breakdown.coinbasePremium).not.toBe(0);
    expect(r.breakdown.etfFlow).not.toBe(0);
    expect(r.breakdown.minerOutflow).not.toBe(0);
    expect(r.breakdown.lthSupply).not.toBe(0);
  });

  test("ETH zeroes the minerOutflow slot (not enabled for tier)", () => {
    const r = computeOnchainScore("ETHUSDT", {
      netflowZscore: -3,
      minerOutflowZscore: 5, // would otherwise produce -0.15
    });
    expect(r.tier).toBe("eth");
    expect(r.breakdown.minerOutflow).toBe(0);
    expect(r.breakdown.netflow).toBeGreaterThan(0);
  });

  test("major_alt zeroes etfFlow / minerOutflow / lthSupply slots", () => {
    const r = computeOnchainScore("SOLUSDT", {
      netflowZscore: -2.5,
      etfFlowThreeDayUsd: 3_000_000_000, // ignored
      lthSupplyThirtyDayChange: 0.1, // ignored
      minerOutflowZscore: -2, // ignored
    });
    expect(r.tier).toBe("major_alt");
    expect(r.breakdown.etfFlow).toBe(0);
    expect(r.breakdown.minerOutflow).toBe(0);
    expect(r.breakdown.lthSupply).toBe(0);
  });

  test("small_alt zeroes ssr / coinbase / etf / miner / lth slots", () => {
    const r = computeOnchainScore("VIRTUALUSDT", {
      netflowZscore: -2.5,
      whaleNetUsd: 200_000_000,
      ssrZscore: -2, // ignored
      coinbasePremium: 0.005, // ignored
      etfFlowThreeDayUsd: 2_000_000_000, // ignored
    });
    expect(r.tier).toBe("small_alt");
    expect(r.breakdown.netflow).toBeGreaterThan(0);
    expect(r.breakdown.whale).toBeGreaterThan(0);
    expect(r.breakdown.ssr).toBe(0);
    expect(r.breakdown.coinbasePremium).toBe(0);
    expect(r.breakdown.etfFlow).toBe(0);
  });
});
