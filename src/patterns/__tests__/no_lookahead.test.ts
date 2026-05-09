/**
 * Look-ahead bias guard — Pattern Audit critical defect #3.
 *
 * Per Part III.1 §5.5: for any index i, the patterns detected when
 * we slice candles[..i+1] must equal what we detect when we slice
 * candles[..i+10]. If they differ, the predicates are reading future
 * data and every backtest using them is suspect.
 *
 * This test is non-negotiable. Failure indicates a bug in
 * detectPatternsAtIndex or its predicates.
 */

import { describe, expect, test } from "vitest";
import type { Candle } from "@shared/types";

import { detectPatternsAtIndex } from "../aggregator";

/**
 * Pseudo-deterministic candle generator used as the look-ahead fixture.
 * Random-looking but stable, with enough variance to surface a wide
 * mix of patterns over the window. Volume is non-zero so context
 * multipliers can run without zero-baseline fallback.
 */
function generateCandles(count: number): Candle[] {
  const out: Candle[] = [];
  let price = 100;
  let seed = 0xc0ffee;

  const next = () => {
    // xorshift32
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    seed = seed | 0;
    return ((seed >>> 0) % 10000) / 10000;
  };

  for (let i = 0; i < count; i++) {
    const drift = (next() - 0.5) * 4; // -2..+2
    const open = price;
    const close = open + drift;
    const high = Math.max(open, close) + next() * 1.5;
    const low = Math.min(open, close) - next() * 1.5;
    const volume = 1000 + Math.floor(next() * 2000);
    out.push({
      openTime: i * 60_000,
      closeTime: i * 60_000 + 60_000,
      open,
      high,
      low,
      close,
      volume,
    });
    price = close;
  }
  return out;
}

describe("look-ahead bias", () => {
  test("detection at i is identical regardless of future candles available", () => {
    const candles = generateCandles(400);

    for (let i = 50; i < candles.length - 10; i++) {
      const detectedAtI = detectPatternsAtIndex(candles.slice(0, i + 1), i);
      const detectedWithFuture = detectPatternsAtIndex(
        candles.slice(0, i + 10),
        i
      );
      expect(detectedAtI).toEqual(detectedWithFuture);
    }
  });

  test("detection at the last candle equals detection on a longer feed", () => {
    const short = generateCandles(120);
    const long = [...short, ...generateCandles(20)];
    const lastIdx = short.length - 1;
    const fromShort = detectPatternsAtIndex(short, lastIdx);
    const fromLong = detectPatternsAtIndex(long, lastIdx);
    expect(fromShort).toEqual(fromLong);
  });

  test("strength values are stable when more future data exists", () => {
    // Context multipliers (volume baseline, prior trend) must read
    // only past candles. A larger forward window must not change
    // the resulting strength of an existing match.
    const candles = generateCandles(300);
    const idx = 200;
    const slim = detectPatternsAtIndex(candles.slice(0, idx + 1), idx);
    const fat = detectPatternsAtIndex(candles.slice(0, idx + 50), idx);
    expect(slim.map((p) => `${p.name}:${p.candlesAgo}:${p.strength}`)).toEqual(
      fat.map((p) => `${p.name}:${p.candlesAgo}:${p.strength}`)
    );
  });
});
