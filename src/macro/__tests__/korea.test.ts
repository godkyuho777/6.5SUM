import { describe, expect, test } from "vitest";

import { applyKoreaModifier, computeKoreaModifier } from "../korea";

describe("computeKoreaModifier", () => {
  test("no inputs → modifier 0, lists missing", () => {
    const r = computeKoreaModifier({});
    expect(r.modifier).toBe(0);
    expect(r.missingInputs).toContain("bok_rate_change_90d");
    expect(r.missingInputs).toContain("krw_usd_change_30d");
  });

  test("BOK tightening > +0.5pp in 90d → -0.05", () => {
    const r = computeKoreaModifier({
      bokRateChange90d: 0.0075, // +0.75pp
      krwUsdChange30d: 0,
    });
    expect(r.modifier).toBe(-0.05);
    expect(r.reasons[0]).toContain("BOK rate up");
  });

  test("KRW weakening > +3% in 30d → +0.05", () => {
    const r = computeKoreaModifier({
      bokRateChange90d: 0,
      krwUsdChange30d: 0.04, // +4%
    });
    expect(r.modifier).toBe(0.05);
    expect(r.reasons[0]).toContain("KRW weakened");
  });

  test("both fire → cap at ±0.05 (modifiers sum to 0)", () => {
    const r = computeKoreaModifier({
      bokRateChange90d: 0.01,
      krwUsdChange30d: 0.04,
    });
    // -0.05 + 0.05 = 0 (within cap)
    expect(r.modifier).toBe(0);
  });

  test("modest BOK / KRW changes → 0 modifier", () => {
    const r = computeKoreaModifier({
      bokRateChange90d: 0.002, // below +0.5pp threshold
      krwUsdChange30d: 0.01, // below +3% threshold
    });
    expect(r.modifier).toBe(0);
  });
});

describe("applyKoreaModifier", () => {
  test("base 1.0 + modifier 0.05 → 1.05", () => {
    expect(applyKoreaModifier(1.0, 0.05)).toBeCloseTo(1.05, 5);
  });

  test("base 0.65 (tight) + modifier -0.05 → 0.6175", () => {
    expect(applyKoreaModifier(0.65, -0.05)).toBeCloseTo(0.6175, 5);
  });

  test("base 1.4 (flooded) + 0 → unchanged", () => {
    expect(applyKoreaModifier(1.4, 0)).toBe(1.4);
  });
});
