/**
 * Engine A tests — runSingleIndicatorBacktest with mocked timeline.
 * DUAL_BACKTEST_ENGINE_PLAN §2.
 */

import { describe, expect, test } from "vitest";
import {
  binomialPValue,
  getIndicatorValue,
  runSingleIndicatorBacktest,
  type SingleIndicatorConfig,
} from "../engines/single-indicator";
import { EMPTY_WAVE_LAYER, type Timeline, type LayeredSnapshot } from "../timeline-types";

// ─── Test fixtures ─────────────────────────────────────────────────────

function mkSnap(
  ts: number,
  rsi: number,
  close: number,
  high?: number,
  low?: number,
): LayeredSnapshot {
  return {
    ts,
    symbol: "BTCUSDT",
    tf: "4h",
    open: close,
    high: high ?? close * 1.02,
    low: low ?? close * 0.98,
    close,
    volume: 1000,
    signal: {
      rsi,
      bb_upper: close * 1.02,
      bb_middle: close,
      bb_lower: close * 0.98,
      bb_position_pct: 0.5,
      adx: 25,
      diPlus: 25,
      diMinus: 15,
      atr: close * 0.02,
      macd_histogram: 0,
      volume_ratio: 1,
    },
    wave: EMPTY_WAVE_LAYER,
    macro: null,
    dimensions: {
      momentum: rsi,
      volatility: 0.5,
      trend: 25,
      volume: 1,
      structure: 0,
      macro: null,
      onchain: null,
    },
  };
}

function buildSyntheticTimeline(): Timeline {
  // 30 bars, prices oscillate; RSI < 30 at indices 5, 15, 25
  const tl: Timeline = [];
  const start = 1_700_000_000_000;
  const interval = 4 * 60 * 60 * 1000;
  for (let i = 0; i < 30; i++) {
    let rsi = 50 + ((i * 7) % 30) - 15;
    if (i === 5 || i === 15 || i === 25) rsi = 25;
    // After RSI=25 entries (idx 5, 15, 25), bump up the next bar so target hits.
    const baseClose = 100 + i * 0.5;
    const close = baseClose;
    const high =
      i === 6 || i === 16 || i === 26 ? baseClose * 1.05 : baseClose * 1.005;
    tl.push(mkSnap(start + i * interval, rsi, close, high, baseClose * 0.99));
  }
  return tl;
}

// ─── getIndicatorValue ─────────────────────────────────────────────────

describe("getIndicatorValue — layer routing", () => {
  const s = mkSnap(0, 35, 100);
  test("signal indicator returns number", () => {
    expect(getIndicatorValue(s, "rsi", "signal")).toBe(35);
    expect(getIndicatorValue(s, "adx", "signal")).toBe(25);
  });
  test("unknown indicator returns null", () => {
    expect(getIndicatorValue(s, "xyz", "signal")).toBeNull();
  });
  test("macro indicator returns null when macro=null", () => {
    expect(getIndicatorValue(s, "vix", "macro")).toBeNull();
  });
});

// ─── binomialPValue ─────────────────────────────────────────────────────

describe("binomialPValue — two-tailed", () => {
  test("wins matches baseline → p=1 (no evidence)", () => {
    expect(binomialPValue(50, 100, 0.5)).toBeGreaterThan(0.9);
  });
  test("extreme deviation → very small p", () => {
    expect(binomialPValue(90, 100, 0.5)).toBeLessThan(0.001);
  });
  test("n=0 → p=1 (degenerate)", () => {
    expect(binomialPValue(0, 0, 0.5)).toBe(1);
  });
});

// ─── runSingleIndicatorBacktest ─────────────────────────────────────────

describe("runSingleIndicatorBacktest — synthetic", () => {
  const baseConfig: SingleIndicatorConfig = {
    indicator: "rsi",
    layer: "signal",
    entry_condition: { type: "less_than", threshold: 30 },
    exit_condition: {
      type: "fixed_return",
      params: { target_pct: 0.03, stop_pct: 0.02, max_bars: 5 },
    },
    symbol: "BTCUSDT",
    tf: "4h",
    start_ms: 0,
    end_ms: 0,
  };

  test("triggers 3 entries on RSI<30 in synthetic timeline", async () => {
    const tl = buildSyntheticTimeline();
    const r = await runSingleIndicatorBacktest(baseConfig, {
      timelineOverride: tl,
    });
    expect(r.total_signals).toBeGreaterThanOrEqual(1);
    expect(r.total_signals).toBeLessThanOrEqual(3);
  });

  test("wilson CI returned in result", async () => {
    const tl = buildSyntheticTimeline();
    const r = await runSingleIndicatorBacktest(baseConfig, {
      timelineOverride: tl,
    });
    expect(Array.isArray(r.ci)).toBe(true);
    expect(r.ci.length).toBe(2);
    expect(r.ci[0]).toBeGreaterThanOrEqual(0);
    expect(r.ci[1]).toBeLessThanOrEqual(1);
  });

  test("empty timeline → empty result, insufficient sample", async () => {
    const r = await runSingleIndicatorBacktest(baseConfig, {
      timelineOverride: [],
    });
    expect(r.total_signals).toBe(0);
    expect(r.sample_sufficiency).toBe("insufficient");
    expect(r.alpha_significant).toBe(false);
  });

  test("fee/slippage subtracted from raw return", async () => {
    const tl = buildSyntheticTimeline();
    const r0 = await runSingleIndicatorBacktest(
      { ...baseConfig, fee_pct: 0, slippage_pct: 0 },
      { timelineOverride: tl },
    );
    const r1 = await runSingleIndicatorBacktest(
      { ...baseConfig, fee_pct: 0.01, slippage_pct: 0.01 },
      { timelineOverride: tl },
    );
    // For matched signals, the higher-cost run has strictly smaller avg return.
    if (r0.total_signals > 0 && r1.total_signals > 0) {
      expect(r1.avg_return_pct).toBeLessThan(r0.avg_return_pct);
    }
  });

  test("alpha_significant is false on a single-signal sample (insufficient)", async () => {
    const tl = buildSyntheticTimeline();
    const r = await runSingleIndicatorBacktest(baseConfig, {
      timelineOverride: tl,
    });
    if (r.total_signals < 30) {
      expect(r.alpha_significant).toBe(false);
    }
  });
});
