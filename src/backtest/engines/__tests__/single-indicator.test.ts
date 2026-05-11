/**
 * Tests for Engine A — single indicator backtest.
 * DUAL_BACKTEST_ENGINE_PLAN §2.
 */

import { describe, expect, test } from "vitest";
import type { Timeline, LayeredSnapshot } from "../../timeline-types";
import { EMPTY_WAVE_LAYER, mapToDimensions } from "../../timeline-types";
import {
  classifySampleSufficiency,
  binomialPValue,
  getIndicatorValue,
  runSingleIndicatorBacktest,
} from "../single-indicator";

// ─── helpers ────────────────────────────────────────────────────────────

function snap(
  ts: number,
  close: number,
  rsi: number,
  bbPos = 0.5,
): LayeredSnapshot {
  const signal = {
    rsi,
    bb_upper: close * 1.02,
    bb_middle: close,
    bb_lower: close * 0.98,
    bb_position_pct: bbPos,
    adx: 20,
    diPlus: 25,
    diMinus: 20,
    atr: close * 0.01,
    macd_histogram: 0,
    volume_ratio: 1,
  };
  return {
    ts,
    symbol: "BTC",
    tf: "4h",
    open: close,
    high: close * 1.005,
    low: close * 0.995,
    close,
    volume: 1000,
    signal,
    wave: EMPTY_WAVE_LAYER,
    macro: null,
    dimensions: mapToDimensions(signal, EMPTY_WAVE_LAYER, null),
  };
}

// ─── Wilson CI / sufficiency ───────────────────────────────────────────

describe("classifySampleSufficiency", () => {
  test("n=200, winRate=0.6 → sufficient", () => {
    expect(classifySampleSufficiency(200, 0.6)).toBe("sufficient");
  });

  test("n=10 → insufficient", () => {
    expect(classifySampleSufficiency(10, 0.6)).toBe("insufficient");
  });

  test("n=30, winRate=0.55 → marginal or insufficient (CI width)", () => {
    const result = classifySampleSufficiency(30, 0.55);
    expect(["marginal", "insufficient"]).toContain(result);
  });
});

describe("binomialPValue", () => {
  test("perfect baseline match → high p-value", () => {
    const p = binomialPValue(50, 100, 0.5);
    expect(p).toBeGreaterThan(0.5);
  });

  test("strong deviation → low p-value", () => {
    const p = binomialPValue(80, 100, 0.5);
    expect(p).toBeLessThan(0.01);
  });

  test("zero n → 1.0", () => {
    expect(binomialPValue(0, 0, 0.5)).toBe(1);
  });
});

// ─── getIndicatorValue routing ─────────────────────────────────────────

describe("getIndicatorValue", () => {
  test("signal layer routing", () => {
    const s = snap(0, 100, 30);
    expect(getIndicatorValue(s, "rsi", "signal")).toBe(30);
    expect(getIndicatorValue(s, "adx", "signal")).toBe(20);
    expect(getIndicatorValue(s, "unknown", "signal")).toBeNull();
  });

  test("macro layer with null macro returns null", () => {
    const s = snap(0, 100, 50);
    expect(getIndicatorValue(s, "vix", "macro")).toBeNull();
  });

  test("wave layer routing", () => {
    const s = snap(0, 100, 50);
    expect(getIndicatorValue(s, "alignment_score", "wave")).toBe(0);
  });
});

// ─── Engine A end-to-end with mock timeline ────────────────────────────

describe("runSingleIndicatorBacktest — RSI < 30 strategy", () => {
  test("triggers on RSI < 30 and resolves via time stop", async () => {
    // 시점 0~9: rsi 50, 시점 10: rsi 25 진입, 11+ 상승 → target hit
    const tl: Timeline = [];
    for (let i = 0; i < 30; i++) {
      const rsi = i === 10 ? 25 : 50;
      tl.push(snap(i * 1000, 100 + i * 0.5, rsi));
    }

    const r = await runSingleIndicatorBacktest(
      {
        indicator: "rsi",
        layer: "signal",
        entry_condition: { type: "less_than", threshold: 30 },
        exit_condition: {
          type: "fixed_return",
          params: { target_pct: 0.005, stop_pct: 0.02, max_bars: 15 },
        },
        symbol: "BTC",
        tf: "4h",
        start_ms: 0,
        end_ms: 30_000,
        mode: "realtime",
      },
      { timelineOverride: tl },
    );

    expect(r.total_signals).toBe(1);
    expect(r.trades[0].entry_ts).toBe(10_000);
    expect(typeof r.win_rate).toBe("number");
    expect(r.ci[0]).toBeLessThanOrEqual(r.ci[1]);
  });

  test("no triggers → empty result", async () => {
    const tl: Timeline = [];
    for (let i = 0; i < 20; i++) tl.push(snap(i, 100, 50));

    const r = await runSingleIndicatorBacktest(
      {
        indicator: "rsi",
        layer: "signal",
        entry_condition: { type: "less_than", threshold: 30 },
        exit_condition: { type: "fixed_return", params: { target_pct: 0.03, max_bars: 10 } },
        symbol: "BTC",
        tf: "4h",
        start_ms: 0,
        end_ms: 20,
        mode: "realtime",
      },
      { timelineOverride: tl },
    );
    expect(r.total_signals).toBe(0);
    expect(r.sample_sufficiency).toBe("insufficient");
  });

  test("between condition fires within range", async () => {
    const tl: Timeline = [];
    for (let i = 0; i < 30; i++) {
      tl.push(snap(i * 1000, 100, i === 5 ? 27 : 50));
    }
    const r = await runSingleIndicatorBacktest(
      {
        indicator: "rsi",
        layer: "signal",
        entry_condition: { type: "between", threshold: [25, 30] },
        exit_condition: { type: "fixed_return", params: { target_pct: 0.005, max_bars: 5 } },
        symbol: "BTC",
        tf: "4h",
        start_ms: 0,
        end_ms: 30_000,
        mode: "realtime",
      },
      { timelineOverride: tl },
    );
    expect(r.total_signals).toBe(1);
  });

  test("crosses_below fires only at crossing bar", async () => {
    const tl: Timeline = [
      snap(0, 100, 50),
      snap(1, 100, 35),
      snap(2, 100, 28), // crosses below 30 here
      snap(3, 100, 25),
      snap(4, 100, 22),
      snap(5, 100, 20),
    ];
    // Pad
    for (let i = 6; i < 20; i++) tl.push(snap(i, 100, 25));

    const r = await runSingleIndicatorBacktest(
      {
        indicator: "rsi",
        layer: "signal",
        entry_condition: { type: "crosses_below", threshold: 30 },
        exit_condition: { type: "fixed_return", params: { target_pct: 0.005, max_bars: 5 } },
        symbol: "BTC",
        tf: "4h",
        start_ms: 0,
        end_ms: 100,
        mode: "realtime",
      },
      { timelineOverride: tl },
    );
    // 단 한 번 crossing → 1 signal
    expect(r.total_signals).toBe(1);
    expect(r.trades[0].entry_ts).toBe(2);
  });
});
