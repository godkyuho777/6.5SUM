/**
 * Per-pattern spec compliance — Part III.1 §5.1.
 *
 * For each predicate: a known-positive fixture and a near-miss that
 * must fail. The hammer test is the spec example (§5.5).
 */

import { describe, expect, test } from "vitest";
import type { Candle } from "@shared/types";

import {
  getMetrics,
  isBearishEngulfing,
  isBullishEngulfing,
  isBullishPinBar,
  isDoji,
  isEveningStar,
  isHammer,
  isInvertedHammer,
  isMorningStar,
  isThreeBlackCrows,
  isThreeWhiteSoldiers,
} from "../definitions";

const candle = (
  open: number,
  high: number,
  low: number,
  close: number,
  volume = 1000,
  openTime = 0
): Candle => ({ openTime, closeTime: openTime, open, high, low, close, volume });

describe("getMetrics", () => {
  test("computes body, range, wicks, and bias", () => {
    const m = getMetrics(candle(100, 105, 95, 103));
    expect(m.body).toBe(3); // |103 - 100|
    expect(m.range).toBe(10); // 105 - 95
    expect(m.upperWick).toBe(2); // 105 - 103
    expect(m.lowerWick).toBe(5); // 100 - 95
    expect(m.isBull).toBe(true);
  });
});

describe("isHammer", () => {
  test("valid hammer (body in upper portion, long lower wick)", () => {
    // open=99.5, close=100 → body=0.5
    // high=100.1, low=95 → range=5.1
    // lowerWick=4.5, upperWick=0.1
    // lowerWick ≥ body × 2 (4.5 ≥ 1) ✓
    // upperWick ≤ body × 0.5 (0.1 ≤ 0.25) ✓
    // 0.05 ≤ body/range ≤ 0.4 (0.098) ✓
    expect(isHammer(candle(99.5, 100.1, 95, 100))).toBe(true);
  });

  test("near-miss with large upper wick fails", () => {
    // upperWick=4.5 vs body × 0.5 → fails upper wick rule
    expect(isHammer(candle(99.5, 105, 95, 100))).toBe(false);
  });

  test("doji-like candle (no body) is not a hammer", () => {
    expect(isHammer(candle(100, 101, 99, 100))).toBe(false);
  });

  test("zero-range candle returns false", () => {
    expect(isHammer(candle(100, 100, 100, 100))).toBe(false);
  });
});

describe("isInvertedHammer", () => {
  test("valid inverted hammer", () => {
    // open=99.5, close=100 → body=0.5
    // high=105, low=99.4 → range=5.6
    // upperWick=5, lowerWick=0.1
    expect(isInvertedHammer(candle(99.5, 105, 99.4, 100))).toBe(true);
  });
  test("hammer is not an inverted hammer", () => {
    expect(isInvertedHammer(candle(99.5, 100.1, 95, 100))).toBe(false);
  });
});

describe("isBullishPinBar", () => {
  test("pin bar with bottom wick dominant", () => {
    // range=10, lowerWick=8, body=1, upperWick=1
    expect(isBullishPinBar(candle(99, 100, 90, 100))).toBe(true);
  });

  test("requires a bullish body", () => {
    // bearish body fails
    expect(isBullishPinBar(candle(100, 100, 90, 99))).toBe(false);
  });
});

describe("isDoji", () => {
  test("body is small fraction of range", () => {
    // body=0.05, range=2 → 0.025 < 0.1
    expect(isDoji(candle(100, 101, 99, 100.05))).toBe(true);
  });

  test("strong body is not a doji", () => {
    expect(isDoji(candle(100, 102, 99, 102))).toBe(false);
  });
});

describe("isBullishEngulfing", () => {
  test("bullish engulfs prior bear", () => {
    const prev = candle(100, 101, 95, 96);
    const curr = candle(95, 102, 94, 101);
    expect(isBullishEngulfing(prev, curr)).toBe(true);
  });

  test("body too small relative to prior fails", () => {
    const prev = candle(100, 101, 95, 96); // body=4
    const curr = candle(96, 97, 95, 96.5); // body=0.5 < 4 × 0.8
    expect(isBullishEngulfing(prev, curr)).toBe(false);
  });

  test("prev candle bullish breaks the pattern", () => {
    const prev = candle(95, 101, 95, 100);
    const curr = candle(95, 102, 94, 101);
    expect(isBullishEngulfing(prev, curr)).toBe(false);
  });
});

describe("isBearishEngulfing", () => {
  test("bearish engulfs prior bull", () => {
    const prev = candle(95, 100, 94, 99);
    const curr = candle(99, 100, 92, 94);
    expect(isBearishEngulfing(prev, curr)).toBe(true);
  });

  test("prev bear breaks the pattern", () => {
    const prev = candle(100, 101, 95, 96);
    const curr = candle(96, 96, 92, 94);
    expect(isBearishEngulfing(prev, curr)).toBe(false);
  });
});

describe("isMorningStar", () => {
  test("strong bear → small body → strong bull crossing midpoint", () => {
    // c1: body=4, range=5 (0.8) — strong bear ✓
    // c2: body=0.1, range=2 (0.05) — small ✓
    // c3: body=4, range=5 (0.8) — strong bull, close=104 > midpoint(100,96)=98 ✓
    const c1 = candle(100, 100.5, 95, 96);
    const c2 = candle(95, 96, 94, 95.1);
    const c3 = candle(95, 105, 95, 104);
    expect(isMorningStar(c1, c2, c3)).toBe(true);
  });

  test("c3 not crossing midpoint fails", () => {
    const c1 = candle(100, 100.5, 95, 96);
    const c2 = candle(95, 96, 94, 95.1);
    const c3 = candle(95, 96.5, 95, 96.5); // close 96.5 < midpoint 98
    expect(isMorningStar(c1, c2, c3)).toBe(false);
  });
});

describe("isEveningStar", () => {
  test("strong bull → small body → strong bear under midpoint", () => {
    const c1 = candle(95, 100, 94.5, 100);
    const c2 = candle(100, 101, 99.9, 100.05);
    const c3 = candle(100, 100, 95, 95.5);
    expect(isEveningStar(c1, c2, c3)).toBe(true);
  });
});

describe("isThreeWhiteSoldiers", () => {
  test("ascending bulls with strong bodies opening inside", () => {
    const c1 = candle(100, 101.5, 99.5, 101);
    const c2 = candle(101, 102.5, 100.5, 102);
    const c3 = candle(102, 103.5, 101.5, 103);
    expect(isThreeWhiteSoldiers(c1, c2, c3)).toBe(true);
  });

  test("weak bodies (body/range < 0.5) fail", () => {
    const c1 = candle(100, 102, 99, 101);
    const c2 = candle(101, 103, 100, 102);
    const c3 = candle(102, 104, 101.5, 103);
    expect(isThreeWhiteSoldiers(c1, c2, c3)).toBe(false);
  });
});

describe("isThreeBlackCrows", () => {
  test("descending bears with strong bodies", () => {
    const c1 = candle(103, 103.5, 101.5, 102);
    const c2 = candle(102, 102.5, 100.5, 101);
    const c3 = candle(101, 101.5, 99.5, 100);
    expect(isThreeBlackCrows(c1, c2, c3)).toBe(true);
  });
});
