/**
 * Tests for Engine B — multi-strategy DSL backtest + charter validation.
 * DUAL_BACKTEST_ENGINE_PLAN §3.
 */

import { describe, expect, test } from "vitest";
import type { Timeline, LayeredSnapshot } from "../../timeline-types";
import { EMPTY_WAVE_LAYER, mapToDimensions } from "../../timeline-types";
import {
  evaluateStrategy,
  extractDimensionsCovered,
  validateAgainstCharter,
  mapIndicatorToDimension,
  runMultiStrategyBacktest,
  type StrategyExpression,
} from "../multi-strategy";

function snap(
  ts: number,
  rsi: number,
  bbPos: number,
  adx: number,
): LayeredSnapshot {
  const close = 100;
  const signal = {
    rsi,
    bb_upper: close * 1.02,
    bb_middle: close,
    bb_lower: close * 0.98,
    bb_position_pct: bbPos,
    adx,
    diPlus: 25,
    diMinus: 20,
    atr: 1,
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

// ─── DSL evaluator ─────────────────────────────────────────────────────

describe("evaluateStrategy — ConditionNode", () => {
  test("lt", () => {
    const s = snap(0, 25, 0.5, 20);
    const expr: StrategyExpression = {
      type: "condition", indicator: "rsi", operator: "lt", value: 30, layer: "signal",
    };
    expect(evaluateStrategy(expr, s).triggered).toBe(true);
  });

  test("gt + not matched", () => {
    const s = snap(0, 25, 0.5, 20);
    expect(
      evaluateStrategy(
        { type: "condition", indicator: "rsi", operator: "gt", value: 30, layer: "signal" },
        s,
      ).triggered,
    ).toBe(false);
  });

  test("between range", () => {
    const s = snap(0, 28, 0.5, 20);
    expect(
      evaluateStrategy(
        { type: "condition", indicator: "rsi", operator: "between", value: [25, 30], layer: "signal" },
        s,
      ).triggered,
    ).toBe(true);
  });

  test("eq for string (cycle_phase) — null macro returns false", () => {
    const s = snap(0, 50, 0.5, 20);
    expect(
      evaluateStrategy(
        {
          type: "condition", indicator: "c4_cycle_phase",
          operator: "eq", value: "crypto_rally", layer: "macro",
        },
        s,
      ).triggered,
    ).toBe(false);
  });

  test("crosses_below — uses prev value", () => {
    const prev = snap(0, 35, 0.5, 20);
    const curr = snap(1, 28, 0.5, 20);
    expect(
      evaluateStrategy(
        { type: "condition", indicator: "rsi", operator: "crosses_below", value: 30, layer: "signal" },
        curr, prev,
      ).triggered,
    ).toBe(true);
  });
});

describe("evaluateStrategy — LogicNode", () => {
  test("AND — all true", () => {
    const s = snap(0, 25, 0.95, 15);
    const expr: StrategyExpression = {
      type: "logic", operator: "AND",
      children: [
        { type: "condition", indicator: "rsi", operator: "between", value: [25, 38], layer: "signal" },
        { type: "condition", indicator: "bb_position_pct", operator: "lt", value: 1.02, layer: "signal" },
        { type: "condition", indicator: "adx", operator: "lt", value: 20, layer: "signal" },
      ],
    };
    expect(evaluateStrategy(expr, s).triggered).toBe(true);
  });

  test("AND — one false → not triggered", () => {
    const s = snap(0, 25, 0.95, 30); // adx > 20
    const expr: StrategyExpression = {
      type: "logic", operator: "AND",
      children: [
        { type: "condition", indicator: "rsi", operator: "between", value: [25, 38], layer: "signal" },
        { type: "condition", indicator: "adx", operator: "lt", value: 20, layer: "signal" },
      ],
    };
    expect(evaluateStrategy(expr, s).triggered).toBe(false);
  });

  test("OR — any true", () => {
    const s = snap(0, 50, 0.95, 30);
    const expr: StrategyExpression = {
      type: "logic", operator: "OR",
      children: [
        { type: "condition", indicator: "rsi", operator: "lt", value: 30, layer: "signal" },
        { type: "condition", indicator: "adx", operator: "gt", value: 25, layer: "signal" },
      ],
    };
    expect(evaluateStrategy(expr, s).triggered).toBe(true);
  });

  test("NOT", () => {
    const s = snap(0, 50, 0.5, 20);
    const expr: StrategyExpression = {
      type: "logic", operator: "NOT",
      children: [
        { type: "condition", indicator: "rsi", operator: "lt", value: 30, layer: "signal" },
      ],
    };
    expect(evaluateStrategy(expr, s).triggered).toBe(true);
  });

  test("nested AND inside OR", () => {
    const s = snap(0, 28, 0.5, 15);
    const expr: StrategyExpression = {
      type: "logic", operator: "OR",
      children: [
        {
          type: "logic", operator: "AND",
          children: [
            { type: "condition", indicator: "rsi", operator: "lt", value: 30, layer: "signal" },
            { type: "condition", indicator: "adx", operator: "lt", value: 20, layer: "signal" },
          ],
        },
        { type: "condition", indicator: "rsi", operator: "gt", value: 70, layer: "signal" },
      ],
    };
    expect(evaluateStrategy(expr, s).triggered).toBe(true);
  });
});

describe("evaluateStrategy — WeightedNode", () => {
  test("threshold met", () => {
    const s = snap(0, 28, 0.5, 15);
    const expr: StrategyExpression = {
      type: "weighted", threshold: 0.5,
      weights: [
        { weight: 0.3, child: { type: "condition", indicator: "rsi", operator: "lt", value: 30, layer: "signal" } },
        { weight: 0.3, child: { type: "condition", indicator: "adx", operator: "lt", value: 20, layer: "signal" } },
        { weight: 0.4, child: { type: "condition", indicator: "rsi", operator: "gt", value: 70, layer: "signal" } },
      ],
    };
    // 0.3 + 0.3 = 0.6 >= 0.5
    expect(evaluateStrategy(expr, s).triggered).toBe(true);
  });

  test("threshold not met", () => {
    const s = snap(0, 50, 0.5, 30);
    const expr: StrategyExpression = {
      type: "weighted", threshold: 0.5,
      weights: [
        { weight: 0.2, child: { type: "condition", indicator: "rsi", operator: "lt", value: 30, layer: "signal" } },
        { weight: 0.2, child: { type: "condition", indicator: "adx", operator: "lt", value: 20, layer: "signal" } },
      ],
    };
    expect(evaluateStrategy(expr, s).triggered).toBe(false);
  });
});

// ─── Charter validation ────────────────────────────────────────────────

describe("extractDimensionsCovered & validateAgainstCharter", () => {
  test("3 차원 사용 → 4 missing", () => {
    const expr: StrategyExpression = {
      type: "logic", operator: "AND",
      children: [
        { type: "condition", indicator: "rsi", operator: "lt", value: 30, layer: "signal" }, // momentum
        { type: "condition", indicator: "bb_position_pct", operator: "lt", value: 0.2, layer: "signal" }, // volatility
        { type: "condition", indicator: "adx", operator: "lt", value: 20, layer: "signal" }, // trend
      ],
    };
    const dims = extractDimensionsCovered(expr);
    expect(dims.has("momentum")).toBe(true);
    expect(dims.has("volatility")).toBe(true);
    expect(dims.has("trend")).toBe(true);
    expect(dims.size).toBe(3);

    const v = validateAgainstCharter(expr);
    expect(v.passed).toBe(false);
    expect(v.missing).toEqual(
      expect.arrayContaining(["volume", "structure", "macro", "onchain"]),
    );
    expect(v.warnings.length).toBeGreaterThan(0);
  });

  test("7 차원 모두 사용 → passed (onchain 제외하면 6, 본 환경 onchain 미연결)", () => {
    const expr: StrategyExpression = {
      type: "logic", operator: "AND",
      children: [
        { type: "condition", indicator: "rsi", operator: "lt", value: 30, layer: "signal" },
        { type: "condition", indicator: "bb_position_pct", operator: "lt", value: 0.2, layer: "signal" },
        { type: "condition", indicator: "adx", operator: "lt", value: 20, layer: "signal" },
        { type: "condition", indicator: "volume_ratio", operator: "gt", value: 1, layer: "signal" },
        { type: "condition", indicator: "alignment_score", operator: "gt", value: 0, layer: "wave" },
        { type: "condition", indicator: "macro_score", operator: "gt", value: -50, layer: "macro" },
      ],
    };
    const v = validateAgainstCharter(expr);
    // onchain 차원 없음 → still false but missing only ['onchain']
    expect(v.missing).toEqual(["onchain"]);
    expect(v.passed).toBe(false);
  });

  test("3 layer 조합 (DUAL_BACKTEST §3.1 예시 2 단순화)", () => {
    const expr: StrategyExpression = {
      type: "logic", operator: "AND",
      children: [
        {
          type: "logic", operator: "OR",
          children: [
            { type: "condition", indicator: "macro_regime", operator: "eq", value: "neutral", layer: "macro" },
            { type: "condition", indicator: "macro_regime", operator: "eq", value: "easy", layer: "macro" },
          ],
        },
        { type: "condition", indicator: "alignment_score", operator: "gt", value: 0.3, layer: "wave" },
        { type: "condition", indicator: "rsi", operator: "between", value: [25, 38], layer: "signal" },
      ],
    };
    const dims = extractDimensionsCovered(expr);
    expect(dims.has("macro")).toBe(true);
    expect(dims.has("structure")).toBe(true);
    expect(dims.has("momentum")).toBe(true);
  });
});

describe("mapIndicatorToDimension", () => {
  test("known indicators mapped", () => {
    expect(mapIndicatorToDimension("rsi")).toBe("momentum");
    expect(mapIndicatorToDimension("vix")).toBe("macro");
    expect(mapIndicatorToDimension("c1_crisis")).toBe("macro");
    expect(mapIndicatorToDimension("alignment_score")).toBe("structure");
  });
  test("unknown → null", () => {
    expect(mapIndicatorToDimension("xyz123")).toBeNull();
  });
});

// ─── End-to-end ───────────────────────────────────────────────────────

describe("runMultiStrategyBacktest — BBDX NUM path representation", () => {
  test("triggers AND-combination, records by_layer stats", async () => {
    // 시점 5: 진입 조건 모두 만족 / 다른 시점은 미충족
    const tl: Timeline = [];
    for (let i = 0; i < 30; i++) {
      const isEntry = i === 5;
      tl.push(snap(i * 1000, isEntry ? 28 : 50, isEntry ? 0.1 : 0.5, isEntry ? 15 : 30));
    }
    const r = await runMultiStrategyBacktest(
      {
        expression: {
          type: "logic", operator: "AND",
          children: [
            { type: "condition", indicator: "rsi", operator: "between", value: [25, 38], layer: "signal" },
            { type: "condition", indicator: "bb_position_pct", operator: "lt", value: 0.2, layer: "signal" },
            { type: "condition", indicator: "adx", operator: "lt", value: 20, layer: "signal" },
          ],
        },
        exit_condition: { type: "fixed_return", params: { target_pct: 0.005, stop_pct: 0.02, max_bars: 10 } },
        symbol: "BTC",
        tf: "4h",
        start_ms: 0,
        end_ms: 30_000,
        mode: "realtime",
      },
      { timelineOverride: tl },
    );
    expect(r.total_signals).toBe(1);
    expect(r.dimensions_covered).toEqual(
      expect.arrayContaining(["momentum", "volatility", "trend"]),
    );
    expect(r.charter_validation.passed).toBe(false); // 4 차원 missing
    expect(r.by_layer.signal_layer.rsi_buckets.length).toBeGreaterThan(0);
  });
});
