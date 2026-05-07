import { describe, expect, test } from "vitest";
import type { Candle } from "@shared/types";

import { classifyMultiTF, classifyTimeframeTrend } from "../multi-tf";

const candle = (
  open: number,
  high: number,
  low: number,
  close: number,
  ts = 0,
  volume = 1000
): Candle => ({ ts, open, high, low, close, volume });

/** Build N strictly-trending candles with a step. step>0 = bullish, <0 = bearish. */
function trendingCandles(n: number, start: number, step: number): Candle[] {
  const out: Candle[] = [];
  let price = start;
  for (let i = 0; i < n; i++) {
    const open = price;
    const close = price + step;
    const high = Math.max(open, close) + Math.abs(step) * 0.3;
    const low = Math.min(open, close) - Math.abs(step) * 0.3;
    out.push(candle(open, high, low, close, i));
    price = close;
  }
  return out;
}

describe("classifyTimeframeTrend", () => {
  test("too-few candles → SIDEWAYS with zero ADX", () => {
    const r = classifyTimeframeTrend(trendingCandles(10, 100, 1), "4h");
    expect(r.direction).toBe("SIDEWAYS");
    expect(r.adx).toBe(0);
  });

  test("strong uptrend → BULLISH with bullish EMA alignment", () => {
    const candles = trendingCandles(80, 100, 0.8);
    const r = classifyTimeframeTrend(candles, "4h");
    expect(r.direction).toBe("BULLISH");
    expect(r.emaAlignment).toBe("bullish");
    expect(r.adx).toBeGreaterThan(20);
    expect(r.plusDi).toBeGreaterThan(r.minusDi);
  });

  test("strong downtrend → BEARISH with bearish EMA alignment", () => {
    const candles = trendingCandles(80, 200, -0.8);
    const r = classifyTimeframeTrend(candles, "4h");
    expect(r.direction).toBe("BEARISH");
    expect(r.emaAlignment).toBe("bearish");
    expect(r.minusDi).toBeGreaterThan(r.plusDi);
  });

  test("flat / sideways candles → SIDEWAYS", () => {
    // Tiny oscillation around a fixed price.
    const candles: Candle[] = [];
    for (let i = 0; i < 80; i++) {
      const close = 100 + (i % 2 === 0 ? 0.05 : -0.05);
      candles.push(candle(100, 100.1, 99.9, close, i));
    }
    const r = classifyTimeframeTrend(candles, "4h");
    expect(r.direction).toBe("SIDEWAYS");
  });
});

describe("classifyMultiTF", () => {
  test("preserves order of TF inputs", () => {
    const result = classifyMultiTF([
      { tf: "15m", candles: trendingCandles(80, 100, 0.5) },
      { tf: "1h", candles: trendingCandles(80, 100, 0.5) },
      { tf: "4h", candles: trendingCandles(80, 100, 0.8) },
      { tf: "1d", candles: trendingCandles(80, 100, 1.2) },
    ]);
    expect(result.map((r) => r.tf)).toEqual(["15m", "1h", "4h", "1d"]);
    expect(result.every((r) => r.direction === "BULLISH")).toBe(true);
  });
});
