/**
 * Aggregator confluence — Part III.1 §5.4.
 *
 * - Multi-pattern detection at the same bar must produce all matches
 *   (no priority dedup).
 * - aggregatePatternScore returns max + bonus, capped at 1.0.
 * - Volume + prior-trend context multipliers should boost matches
 *   that occur after a downtrend with strong volume.
 */

import { describe, expect, test } from "vitest";
import type { Candle } from "@shared/types";

import { aggregatePatternScore, detectPatternsAtIndex } from "../aggregator";
import { countByBias } from "../aggregator";

const candle = (
  open: number,
  high: number,
  low: number,
  close: number,
  volume = 1000,
  openTime = 0
): Candle => ({ openTime, closeTime: openTime, open, high, low, close, volume });

describe("detectPatternsAtIndex — confluence", () => {
  test("returns multiple matches when more than one pattern fires", () => {
    // Build a fixture where a hammer can also be the third candle of
    // a three-white-soldiers pattern, then verify both are reported.
    // c1: strong bull, c2: strong bull, c3: strong bull
    // The third candle alone shouldn't be a hammer (body/range moderate),
    // but engulfing + morning star aren't applicable here. Use simpler
    // dual: bullish engulfing + hammer-shaped curr (not actually a
    // hammer because body is too large) — instead pair engulfing with
    // a doji at a different recent bar.
    const cs: Candle[] = [
      // a doji at idx 0
      candle(100, 101, 99, 100.05),
      // bear at idx 1
      candle(100, 101, 95, 96),
      // bullish engulf at idx 2
      candle(95, 102, 94, 101, 1500),
    ];
    const matches = detectPatternsAtIndex(cs, 2, 5);
    const names = matches.map((m) => m.name);
    expect(names).toContain("doji"); // from idx 0, candlesAgo=2
    expect(names).toContain("engulfing"); // from idx 2, candlesAgo=0
  });

  test("strength is in 0..100 range", () => {
    const cs: Candle[] = [
      candle(100, 101, 95, 96),
      candle(95, 102, 94, 101, 1500),
    ];
    const matches = detectPatternsAtIndex(cs, 1);
    for (const m of matches) {
      expect(m.strength).toBeGreaterThanOrEqual(0);
      expect(m.strength).toBeLessThanOrEqual(100);
    }
  });

  test("respects lookback parameter", () => {
    // Place a doji at idx 0, then 5 plain candles. With lookback=3
    // the doji (candlesAgo=5) must not appear; with lookback=10 it
    // must.
    const cs: Candle[] = [
      candle(100, 101, 99, 100.05), // doji at 0
      ...Array.from({ length: 5 }, (_, i) => candle(100, 102, 99, 102, 1000, i + 1)),
    ];
    const lastIdx = cs.length - 1;
    const tightMatches = detectPatternsAtIndex(cs, lastIdx, 3);
    const wideMatches = detectPatternsAtIndex(cs, lastIdx, 10);
    expect(tightMatches.find((m) => m.name === "doji")).toBeUndefined();
    expect(wideMatches.find((m) => m.name === "doji")).toBeDefined();
  });
});

describe("aggregatePatternScore", () => {
  test("returns 0 when no patterns detected", () => {
    expect(aggregatePatternScore([])).toBe(0);
  });

  test("single pattern equals base × ageDiscount, no bonus", () => {
    const score = aggregatePatternScore([
      { name: "engulfing", bias: "bullish", candlesAgo: 0, strength: 80 },
    ]);
    // 0.80 × exp(0) = 0.80
    expect(score).toBeCloseTo(0.8, 5);
  });

  test("two patterns at same bar add 0.10 bonus on top of max", () => {
    const score = aggregatePatternScore([
      { name: "hammer", bias: "bullish", candlesAgo: 0, strength: 70 },
      { name: "engulfing", bias: "bullish", candlesAgo: 0, strength: 80 },
    ]);
    // primary = 0.80, bonus = 0.10 → 0.90
    expect(score).toBeCloseTo(0.9, 5);
  });

  test("three patterns add 0.20 bonus capped", () => {
    const score = aggregatePatternScore([
      { name: "hammer", bias: "bullish", candlesAgo: 0, strength: 70 },
      { name: "engulfing", bias: "bullish", candlesAgo: 0, strength: 80 },
      { name: "morningStar", bias: "bullish", candlesAgo: 0, strength: 85 },
    ]);
    // primary = 0.85, bonus = 0.20 → 1.05 capped at 1.0
    expect(score).toBeCloseTo(1.0, 5);
  });

  test("ageDiscount drops contribution of older patterns", () => {
    const fresh = aggregatePatternScore([
      { name: "engulfing", bias: "bullish", candlesAgo: 0, strength: 80 },
    ]);
    const old = aggregatePatternScore([
      { name: "engulfing", bias: "bullish", candlesAgo: 6, strength: 80 },
    ]);
    expect(fresh).toBeGreaterThan(old);
  });
});

describe("countByBias", () => {
  test("counts bullish vs bearish matches", () => {
    expect(
      countByBias([
        { name: "engulfing", bias: "bullish", candlesAgo: 0, strength: 80 },
        { name: "hammer", bias: "bullish", candlesAgo: 1, strength: 70 },
        {
          name: "bearishEngulfing",
          bias: "bearish",
          candlesAgo: 2,
          strength: 70,
        },
      ])
    ).toEqual({ bullish: 2, bearish: 1 });
  });
});
