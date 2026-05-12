import { describe, expect, it } from "vitest";
import { extractScoreComponents } from "../score-components";

const baseInd = {
  rsi: 30,
  bbLower: 100,
  bbMiddle: 110,
  bbUpper: 120,
  adx: 15,
  plusDi: 18,
  minusDi: 22,
};

describe("extractScoreComponents", () => {
  it("LONG: RSI 25 → momentum 1.0", () => {
    const s = extractScoreComponents({
      price: 100,
      indicators: { ...baseInd, rsi: 25 },
      volRatio: 1,
      patternConfluence: 0,
      side: "long",
    });
    expect(s.momentum).toBeCloseTo(1.0, 2);
  });

  it("LONG: RSI 38 → momentum 0", () => {
    const s = extractScoreComponents({
      price: 100,
      indicators: { ...baseInd, rsi: 38 },
      volRatio: 1,
      patternConfluence: 0,
      side: "long",
    });
    expect(s.momentum).toBeCloseTo(0, 2);
  });

  it("SHORT: RSI 75 → momentum 1.0", () => {
    const s = extractScoreComponents({
      price: 120,
      indicators: { ...baseInd, rsi: 75 },
      volRatio: 1,
      patternConfluence: 0,
      side: "short",
    });
    expect(s.momentum).toBeCloseTo(1.0, 2);
  });

  it("LONG: 가격 == BB 하단 → position 1.0", () => {
    const s = extractScoreComponents({
      price: 100, // bbLower
      indicators: baseInd,
      volRatio: 1,
      patternConfluence: 0,
      side: "long",
    });
    expect(s.position).toBeCloseTo(1.0, 2);
  });

  it("SHORT: 가격 == BB 상단 → position 1.0", () => {
    const s = extractScoreComponents({
      price: 120, // bbUpper
      indicators: baseInd,
      volRatio: 1,
      patternConfluence: 0,
      side: "short",
    });
    expect(s.position).toBeCloseTo(1.0, 2);
  });

  it("ADX 0 → trend (weakness) 1.0, ADX 40+ → 0", () => {
    const low = extractScoreComponents({
      price: 100, indicators: { ...baseInd, adx: 0 }, volRatio: 1, patternConfluence: 0, side: "long",
    });
    const high = extractScoreComponents({
      price: 100, indicators: { ...baseInd, adx: 45 }, volRatio: 1, patternConfluence: 0, side: "long",
    });
    expect(low.trend).toBeCloseTo(1.0, 2);
    expect(high.trend).toBeCloseTo(0, 2);
  });

  it("volRatio 2.0 → volume 1.0", () => {
    const s = extractScoreComponents({
      price: 100, indicators: baseInd, volRatio: 2.0, patternConfluence: 0, side: "long",
    });
    expect(s.volume).toBeCloseTo(1.0, 2);
  });

  it("패턴 confluence 그대로 전달", () => {
    const s = extractScoreComponents({
      price: 100, indicators: baseInd, volRatio: 1, patternConfluence: 0.65, side: "long",
    });
    expect(s.action).toBeCloseTo(0.65, 2);
  });

  it("모든 점수 [0, 1] 클립", () => {
    const s = extractScoreComponents({
      price: 90, // BB 하단 아래 (음수 영역)
      indicators: { ...baseInd, rsi: 5, adx: -10 },
      volRatio: 100,
      patternConfluence: 5,
      side: "long",
    });
    for (const v of Object.values(s)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
