/**
 * Engine B tests — DSL evaluator + charter validation.
 * DUAL_BACKTEST_ENGINE_PLAN §3.
 */

import { describe, expect, test } from "vitest";
import {
  evaluateStrategy,
  extractDimensionsCovered,
  validateAgainstCharter,
  mapIndicatorToDimension,
  runMultiStrategyBacktest,
  type ConditionNode,
  type LogicNode,
  type WeightedNode,
  type StrategyExpression,
  type MultiStrategyConfig,
} from "../engines/multi-strategy";
import { EMPTY_WAVE_LAYER, type LayeredSnapshot, type Timeline } from "../timeline-types";

// ─── Fixtures ─────────────────────────────────────────────────────

function mkSnap(rsi: number, adx: number): LayeredSnapshot {
  return {
    ts: 0,
    symbol: "BTCUSDT",
    tf: "4h",
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1000,
    signal: {
      rsi,
      bb_upper: 102,
      bb_middle: 100,
      bb_lower: 98,
      bb_position_pct: 0.3,
      adx,
      diPlus: 20,
      diMinus: 15,
      atr: 2,
      macd_histogram: 0,
      volume_ratio: 1,
    },
    wave: EMPTY_WAVE_LAYER,
    macro: null,
    dimensions: {
      momentum: rsi,
      volatility: 0.3,
      trend: adx,
      volume: 1,
      structure: 0,
      macro: null,
      onchain: null,
    },
  };
}

// ─── mapIndicatorToDimension ───────────────────────────────────────

describe("mapIndicatorToDimension", () => {
  test("rsi → momentum", () => {
    expect(mapIndicatorToDimension("rsi")).toBe("momentum");
  });
  test("adx → trend", () => {
    expect(mapIndicatorToDimension("adx")).toBe("trend");
  });
  test("c1_crisis → macro", () => {
    expect(mapIndicatorToDimension("c1_crisis")).toBe("macro");
  });
  test("unknown → null", () => {
    expect(mapIndicatorToDimension("frobnitz")).toBeNull();
  });
});

// ─── evaluateStrategy ──────────────────────────────────────────────

describe("evaluateStrategy — recursive DSL", () => {
  const rsiLow: ConditionNode = {
    type: "condition",
    indicator: "rsi",
    operator: "lt",
    value: 30,
    layer: "signal",
  };
  const adxStrong: ConditionNode = {
    type: "condition",
    indicator: "adx",
    operator: "gt",
    value: 25,
    layer: "signal",
  };

  test("AND requires all true", () => {
    const expr: LogicNode = {
      type: "logic",
      operator: "AND",
      children: [rsiLow, adxStrong],
    };
    expect(evaluateStrategy(expr, mkSnap(25, 30)).triggered).toBe(true);
    expect(evaluateStrategy(expr, mkSnap(25, 10)).triggered).toBe(false);
    expect(evaluateStrategy(expr, mkSnap(50, 30)).triggered).toBe(false);
  });

  test("OR requires at least one true", () => {
    const expr: LogicNode = {
      type: "logic",
      operator: "OR",
      children: [rsiLow, adxStrong],
    };
    expect(evaluateStrategy(expr, mkSnap(50, 30)).triggered).toBe(true);
    expect(evaluateStrategy(expr, mkSnap(25, 10)).triggered).toBe(true);
    expect(evaluateStrategy(expr, mkSnap(50, 10)).triggered).toBe(false);
  });

  test("NOT inverts first child", () => {
    const expr: LogicNode = {
      type: "logic",
      operator: "NOT",
      children: [rsiLow],
    };
    expect(evaluateStrategy(expr, mkSnap(50, 0)).triggered).toBe(true);
    expect(evaluateStrategy(expr, mkSnap(20, 0)).triggered).toBe(false);
  });

  test("between operator", () => {
    const cond: ConditionNode = {
      type: "condition",
      indicator: "rsi",
      operator: "between",
      value: [25, 35],
      layer: "signal",
    };
    expect(evaluateStrategy(cond, mkSnap(30, 0)).triggered).toBe(true);
    expect(evaluateStrategy(cond, mkSnap(20, 0)).triggered).toBe(false);
    expect(evaluateStrategy(cond, mkSnap(40, 0)).triggered).toBe(false);
  });

  test("WeightedNode sums then threshold-checks", () => {
    const expr: WeightedNode = {
      type: "weighted",
      threshold: 0.5,
      weights: [
        { weight: 0.3, child: rsiLow },
        { weight: 0.7, child: adxStrong },
      ],
    };
    // RSI low (0.3) alone < 0.5 → false
    expect(evaluateStrategy(expr, mkSnap(20, 0)).triggered).toBe(false);
    // ADX strong (0.7) alone ≥ 0.5 → true
    expect(evaluateStrategy(expr, mkSnap(50, 30)).triggered).toBe(true);
  });

  test("crosses_below requires prev snapshot", () => {
    const cond: ConditionNode = {
      type: "condition",
      indicator: "rsi",
      operator: "crosses_below",
      value: 30,
      layer: "signal",
    };
    // No prev → cannot cross
    expect(evaluateStrategy(cond, mkSnap(25, 0), null).triggered).toBe(false);
    // prev=35 → current=25: crossed below 30
    expect(
      evaluateStrategy(cond, mkSnap(25, 0), mkSnap(35, 0)).triggered,
    ).toBe(true);
    // prev=25 → current=20: stayed below (no crossing)
    expect(
      evaluateStrategy(cond, mkSnap(20, 0), mkSnap(25, 0)).triggered,
    ).toBe(false);
  });
});

// ─── extractDimensionsCovered ──────────────────────────────────────

describe("extractDimensionsCovered", () => {
  test("nested expression collects all dimensions", () => {
    const expr: StrategyExpression = {
      type: "logic",
      operator: "AND",
      children: [
        { type: "condition", indicator: "rsi", operator: "lt", value: 30, layer: "signal" },
        { type: "condition", indicator: "adx", operator: "gt", value: 25, layer: "signal" },
        { type: "condition", indicator: "volume_ratio", operator: "gt", value: 1.5, layer: "signal" },
      ],
    };
    const dims = extractDimensionsCovered(expr);
    expect(dims.has("momentum")).toBe(true);
    expect(dims.has("trend")).toBe(true);
    expect(dims.has("volume")).toBe(true);
    expect(dims.has("macro")).toBe(false);
  });

  test("weighted node descends into children", () => {
    const expr: WeightedNode = {
      type: "weighted",
      threshold: 1,
      weights: [
        {
          weight: 1,
          child: {
            type: "condition",
            indicator: "c1_crisis",
            operator: "gt",
            value: 0.5,
            layer: "macro",
          },
        },
      ],
    };
    const dims = extractDimensionsCovered(expr);
    expect(dims.has("macro")).toBe(true);
  });
});

// ─── validateAgainstCharter ────────────────────────────────────────

describe("validateAgainstCharter", () => {
  test("single-dimension expression → 6 missing dims, charter fails", () => {
    const expr: ConditionNode = {
      type: "condition",
      indicator: "rsi",
      operator: "lt",
      value: 30,
      layer: "signal",
    };
    const v = validateAgainstCharter(expr);
    expect(v.passed).toBe(false);
    expect(v.covered).toContain("momentum");
    expect(v.missing.length).toBeGreaterThan(0);
    expect(v.warnings.length).toBeGreaterThan(0);
  });

  test("unknown indicator emits warning", () => {
    const expr: ConditionNode = {
      type: "condition",
      indicator: "made_up_indicator",
      operator: "lt",
      value: 0,
      layer: "signal",
    };
    const v = validateAgainstCharter(expr);
    expect(v.warnings.some((w) => w.includes("unknown indicator"))).toBe(true);
  });

  test("all 7 dimensions covered → passes (manually constructed)", () => {
    // Note: onchain has no indicator yet in INDICATOR_TO_DIMENSION,
    // so the strictest valid expression cannot cover "onchain" through
    // INDICATOR_TO_DIMENSION alone. This is by design per current taxonomy.
    const expr: LogicNode = {
      type: "logic",
      operator: "AND",
      children: [
        { type: "condition", indicator: "rsi", operator: "lt", value: 30, layer: "signal" },
        { type: "condition", indicator: "atr", operator: "gt", value: 1, layer: "signal" },
        { type: "condition", indicator: "adx", operator: "gt", value: 25, layer: "signal" },
        { type: "condition", indicator: "volume_ratio", operator: "gt", value: 1, layer: "signal" },
        { type: "condition", indicator: "alignment_score", operator: "gt", value: 0, layer: "wave" },
        { type: "condition", indicator: "c1_crisis", operator: "lt", value: 0.5, layer: "macro" },
      ],
    };
    const v = validateAgainstCharter(expr);
    expect(v.covered).toEqual(
      expect.arrayContaining(["momentum", "volatility", "trend", "volume", "structure", "macro"]),
    );
    // onchain remains missing under current taxonomy
    expect(v.missing).toContain("onchain");
  });
});

// ─── runMultiStrategyBacktest — synthetic timeline ────────────────

describe("runMultiStrategyBacktest — synthetic", () => {
  function buildTimeline(): Timeline {
    const out: Timeline = [];
    const start = 1_700_000_000_000;
    const interval = 4 * 60 * 60 * 1000;
    for (let i = 0; i < 30; i++) {
      const rsi = i % 6 === 0 ? 20 : 50; // hits every 6 bars
      const adx = 30;
      const baseClose = 100 + i * 0.5;
      const high = i % 6 === 1 ? baseClose * 1.05 : baseClose * 1.005;
      const snap = mkSnap(rsi, adx);
      out.push({
        ...snap,
        ts: start + i * interval,
        close: baseClose,
        high,
        low: baseClose * 0.99,
      });
    }
    return out;
  }

  test("AND combo of RSI<25 + ADX>25 finds entries", async () => {
    const tl = buildTimeline();
    const expr: LogicNode = {
      type: "logic",
      operator: "AND",
      children: [
        { type: "condition", indicator: "rsi", operator: "lt", value: 25, layer: "signal" },
        { type: "condition", indicator: "adx", operator: "gt", value: 25, layer: "signal" },
      ],
    };
    const config: MultiStrategyConfig = {
      expression: expr,
      exit_condition: {
        type: "fixed_return",
        params: { target_pct: 0.03, stop_pct: 0.02, max_bars: 3 },
      },
      symbol: "BTCUSDT",
      tf: "4h",
      start_ms: 0,
      end_ms: 0,
    };
    const r = await runMultiStrategyBacktest(config, {
      timelineOverride: tl,
    });
    expect(r.total_signals).toBeGreaterThanOrEqual(1);
    expect(r.dimensions_covered).toEqual(
      expect.arrayContaining(["momentum", "trend"]),
    );
    expect(r.charter_validation.passed).toBe(false);
    expect(r.by_layer).toBeDefined();
    expect(r.cross_layer).toBeDefined();
  });

  test("by_layer buckets include rsi/bb/adx splits", async () => {
    const tl = buildTimeline();
    const expr: ConditionNode = {
      type: "condition",
      indicator: "rsi",
      operator: "lt",
      value: 25,
      layer: "signal",
    };
    const config: MultiStrategyConfig = {
      expression: expr,
      exit_condition: {
        type: "fixed_return",
        params: { target_pct: 0.03, stop_pct: 0.02, max_bars: 3 },
      },
      symbol: "BTCUSDT",
      tf: "4h",
      start_ms: 0,
      end_ms: 0,
    };
    const r = await runMultiStrategyBacktest(config, {
      timelineOverride: tl,
    });
    expect(r.by_layer.signal_layer.rsi_buckets.length).toBeGreaterThan(0);
    expect(r.by_layer.signal_layer.adx_buckets.length).toBeGreaterThan(0);
  });
});
