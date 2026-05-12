import { describe, expect, it } from "vitest";
import { computeShortStopIndicator } from "../short-entry";

describe("computeShortStopIndicator", () => {
  const ind = {
    rsi: 70,
    bbLower: 100,
    bbMiddle: 110,
    bbUpper: 120,
    adx: 15,
    plusDi: 18,
    minusDi: 22,
  };

  it("SHORT stop = min(bbUpper × 1.03, entry × 1.02)", () => {
    const stop = computeShortStopIndicator(120, ind);
    // bbUpper × 1.03 = 123.6 / entry × 1.02 = 122.4 → 122.4
    expect(stop).toBeCloseTo(122.4, 2);
  });

  it("좁은 BB (bbUpper close to entry) → bbUpper 기반", () => {
    // bbUpper × 1.03 = 110 × 1.03 = 113.3
    // entry × 1.02 = 120 × 1.02 = 122.4
    // min = 113.3
    const stop = computeShortStopIndicator(120, { ...ind, bbUpper: 110 });
    expect(stop).toBeCloseTo(113.3, 2);
  });

  it("결과는 entry 보다 항상 위", () => {
    const stop = computeShortStopIndicator(120, ind);
    expect(stop).toBeGreaterThan(120);
  });
});
