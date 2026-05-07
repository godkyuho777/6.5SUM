import { describe, expect, test } from "vitest";

import {
  coinbasePremiumModifier,
  etfFlowModifier,
  lthSupplyModifier,
  minerOutflowModifier,
  netflowModifier,
  ssrModifier,
  whaleModifier,
} from "../modifiers";

describe("netflowModifier", () => {
  test("strong outflow (z<-2) → +0.20", () => {
    expect(netflowModifier(-2.5)).toBe(0.2);
  });
  test("moderate outflow (z<-1) → +0.10", () => {
    expect(netflowModifier(-1.5)).toBe(0.1);
  });
  test("strong inflow (z>2) → -0.25", () => {
    expect(netflowModifier(2.5)).toBe(-0.25);
  });
  test("moderate inflow (z>1) → -0.10", () => {
    expect(netflowModifier(1.5)).toBe(-0.1);
  });
  test("neutral z within ±1 → 0", () => {
    expect(netflowModifier(0)).toBe(0);
    expect(netflowModifier(0.9)).toBe(0);
    expect(netflowModifier(-0.9)).toBe(0);
  });
  test("non-finite input → 0", () => {
    expect(netflowModifier(NaN)).toBe(0);
    expect(netflowModifier(Infinity)).toBe(0);
  });
});

describe("whaleModifier", () => {
  test("net > +$300M → +0.15", () => {
    expect(whaleModifier({ netUsd: 350_000_000 })).toBe(0.15);
  });
  test("net > +$100M → +0.07", () => {
    expect(whaleModifier({ netUsd: 150_000_000 })).toBe(0.07);
  });
  test("net < -$300M → -0.20", () => {
    expect(whaleModifier({ netUsd: -350_000_000 })).toBe(-0.2);
  });
  test("undefined input → 0", () => {
    expect(whaleModifier()).toBe(0);
    expect(whaleModifier(undefined)).toBe(0);
  });
});

describe("ssrModifier", () => {
  test("z < -1.5 → +0.15", () => {
    expect(ssrModifier(-2)).toBe(0.15);
  });
  test("z > +1.5 → -0.20", () => {
    expect(ssrModifier(2)).toBe(-0.2);
  });
  test("undefined → 0 (stub for B.2)", () => {
    expect(ssrModifier()).toBe(0);
    expect(ssrModifier(undefined)).toBe(0);
  });
});

describe("coinbasePremiumModifier", () => {
  test(">+0.20% → +0.15", () => {
    expect(coinbasePremiumModifier(0.003)).toBe(0.15);
  });
  test(">+0.05% → +0.05", () => {
    expect(coinbasePremiumModifier(0.001)).toBe(0.05);
  });
  test("<-0.20% → -0.20", () => {
    expect(coinbasePremiumModifier(-0.003)).toBe(-0.2);
  });
  test("near zero → 0", () => {
    expect(coinbasePremiumModifier(0)).toBe(0);
    expect(coinbasePremiumModifier(0.0003)).toBe(0);
  });
});

describe("etfFlowModifier", () => {
  test("> +$1.5B (3d) → +0.20", () => {
    expect(etfFlowModifier(2_000_000_000)).toBe(0.2);
  });
  test("> +$500M → +0.10", () => {
    expect(etfFlowModifier(700_000_000)).toBe(0.1);
  });
  test("< -$1B → -0.25", () => {
    expect(etfFlowModifier(-1_500_000_000)).toBe(-0.25);
  });
  test("zero flow → 0", () => {
    expect(etfFlowModifier(0)).toBe(0);
  });
});

describe("minerOutflowModifier (stub for B.2)", () => {
  test("z > +2 → -0.15 when supplied", () => {
    expect(minerOutflowModifier(2.5)).toBe(-0.15);
  });
  test("undefined → 0", () => {
    expect(minerOutflowModifier()).toBe(0);
  });
});

describe("lthSupplyModifier (stub for B.2)", () => {
  test("> +2% → +0.10 when supplied", () => {
    expect(lthSupplyModifier(0.025)).toBe(0.1);
  });
  test("< -2% → -0.15 when supplied", () => {
    expect(lthSupplyModifier(-0.03)).toBe(-0.15);
  });
  test("undefined → 0", () => {
    expect(lthSupplyModifier()).toBe(0);
  });
});

describe("modifier ranges (per spec ±0.25 max)", () => {
  test("each modifier output is clamped within [-0.25, +0.20] absolute range", () => {
    const samples = [
      netflowModifier(-100),
      netflowModifier(100),
      coinbasePremiumModifier(-1),
      coinbasePremiumModifier(1),
      etfFlowModifier(-1e15),
      etfFlowModifier(1e15),
    ];
    for (const v of samples) {
      expect(v).toBeGreaterThanOrEqual(-0.25);
      expect(v).toBeLessThanOrEqual(0.2);
    }
  });
});
