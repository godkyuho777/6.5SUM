/**
 * Engine B — Multi-strategy DSL backtest.
 *
 * DUAL_BACKTEST_ENGINE_PLAN §3 + MACRO_LIQUIDITY_TRACKER_v2 §4.4.
 *
 * 사용자 정의 조합 (AND/OR/NOT + WeightedNode) 을 재귀 평가.
 * 헌장 매핑 자동 검증.
 *
 * 헌장 (CLAUDE.md 금지사항): Charter R3 = 단독 시그널 X.
 * 본 엔진은 backtest 평가 도구이므로 조합 자체가 multi-dimensional → R3 위반 X.
 * 단일 ConditionNode 조합도 사용자 정의 검증 도구로 허용.
 */

import type {
  LayeredSnapshot,
  Timeline,
} from "../timeline-types";
import { buildTimeline } from "../timeline-builder";
import {
  getIndicatorValue,
  type IndicatorLayer,
  type ExitCondition,
  type SingleIndicatorResult,
  type SampleSufficiency,
  classifySampleSufficiency,
  binomialPValue,
} from "./single-indicator";
import { wilsonScoreInterval } from "../calibration";
import type { FredMode } from "../../macro/sources/fred";

// ─────────────────────────────────────────────────────────
// DSL Types
// ─────────────────────────────────────────────────────────

export type ConditionOperator =
  | "lt"
  | "gt"
  | "between"
  | "crosses_below"
  | "crosses_above"
  | "eq";

export interface ConditionNode {
  type: "condition";
  indicator: string;
  operator: ConditionOperator;
  value: number | [number, number] | string;
  layer: IndicatorLayer;
}

export interface LogicNode {
  type: "logic";
  operator: "AND" | "OR" | "NOT";
  children: StrategyExpression[];
}

export interface WeightedNode {
  type: "weighted";
  weights: Array<{ weight: number; child: StrategyExpression }>;
  threshold: number;
}

export type StrategyExpression = ConditionNode | LogicNode | WeightedNode;

export interface MultiStrategyConfig {
  expression: StrategyExpression;
  exit_condition: ExitCondition;
  symbol: string;
  tf: "4h" | "1d" | "1w";
  start_ms: number;
  end_ms: number;
  mode?: FredMode;
  fee_pct?: number;
  slippage_pct?: number;
}

// ─────────────────────────────────────────────────────────
// INDICATOR_TO_DIMENSION (MACRO_v2 §4.4 + DUAL_BACKTEST §3.3)
// ─────────────────────────────────────────────────────────

export type Dimension =
  | "momentum"
  | "volatility"
  | "trend"
  | "volume"
  | "structure"
  | "macro"
  | "onchain";

export const ALL_DIMENSIONS: readonly Dimension[] = [
  "momentum",
  "volatility",
  "trend",
  "volume",
  "structure",
  "macro",
  "onchain",
] as const;

export const INDICATOR_TO_DIMENSION: Readonly<Record<string, Dimension>> = {
  // Signal layer
  rsi: "momentum",
  macd_histogram: "momentum",
  bb_position_pct: "volatility",
  bb_upper: "volatility",
  bb_middle: "volatility",
  bb_lower: "volatility",
  atr: "volatility",
  adx: "trend",
  diPlus: "trend",
  diMinus: "trend",
  volume_ratio: "volume",

  // Wave layer
  current_fib_position: "structure",
  alignment_score: "structure",
  uptrend_strength: "structure",
  swing_high: "structure",
  swing_low: "structure",
  wave_progress_pct: "structure",

  // Macro layer
  sofr_iorb_spread_bp: "macro",
  yield_curve_10_2: "macro",
  walcl_change_30d_pct: "macro",
  rrp_tga_change_30d_pct: "macro",
  real_rate: "macro",
  dxy_change_30d_pct: "macro",
  vix: "macro",
  bok_rate_change_90d: "macro",
  krw_change_30d_pct: "macro",
  c1_crisis: "macro",
  c2_riskOn: "macro",
  c3_net_liquidity_30d_pct: "macro",
  c4_cycle_phase: "macro",
  macro_score: "macro",
  macro_regime: "macro",
};

export function mapIndicatorToDimension(name: string): Dimension | null {
  return INDICATOR_TO_DIMENSION[name] ?? null;
}

// ─────────────────────────────────────────────────────────
// Recursive evaluator
// ─────────────────────────────────────────────────────────

function evalCondition(
  cond: ConditionNode,
  snapshot: LayeredSnapshot,
  prev: LayeredSnapshot | null,
): boolean {
  const v = getIndicatorValue(snapshot, cond.indicator, cond.layer);
  const prevV = prev
    ? getIndicatorValue(prev, cond.indicator, cond.layer)
    : null;
  if (v == null) return false;
  if (cond.operator === "eq") return v === cond.value;
  if (typeof v !== "number") return false;
  if (cond.operator === "lt" && typeof cond.value === "number") return v < cond.value;
  if (cond.operator === "gt" && typeof cond.value === "number") return v > cond.value;
  if (cond.operator === "between" && Array.isArray(cond.value)) {
    return v >= cond.value[0] && v <= cond.value[1];
  }
  if (cond.operator === "crosses_below" && typeof cond.value === "number") {
    if (typeof prevV !== "number") return false;
    return prevV >= cond.value && v < cond.value;
  }
  if (cond.operator === "crosses_above" && typeof cond.value === "number") {
    if (typeof prevV !== "number") return false;
    return prevV <= cond.value && v > cond.value;
  }
  return false;
}

export function evaluateStrategy(
  expr: StrategyExpression,
  snapshot: LayeredSnapshot,
  prev: LayeredSnapshot | null = null,
): { triggered: boolean } {
  if (expr.type === "condition") {
    return { triggered: evalCondition(expr, snapshot, prev) };
  }
  if (expr.type === "logic") {
    const results = expr.children.map((c) => evaluateStrategy(c, snapshot, prev));
    if (expr.operator === "AND") {
      return { triggered: results.every((r) => r.triggered) };
    }
    if (expr.operator === "OR") {
      return { triggered: results.some((r) => r.triggered) };
    }
    if (expr.operator === "NOT") {
      if (results.length === 0) return { triggered: false };
      return { triggered: !results[0].triggered };
    }
  }
  if (expr.type === "weighted") {
    let sum = 0;
    for (const w of expr.weights) {
      if (evaluateStrategy(w.child, snapshot, prev).triggered) sum += w.weight;
    }
    return { triggered: sum >= expr.threshold };
  }
  return { triggered: false };
}

// ─────────────────────────────────────────────────────────
// Charter validation (§3.3)
// ─────────────────────────────────────────────────────────

export function extractDimensionsCovered(
  expr: StrategyExpression,
): Set<Dimension> {
  const out = new Set<Dimension>();
  const traverse = (node: StrategyExpression) => {
    if (node.type === "condition") {
      const d = mapIndicatorToDimension(node.indicator);
      if (d) out.add(d);
    } else if (node.type === "logic") {
      node.children.forEach(traverse);
    } else if (node.type === "weighted") {
      node.weights.forEach((w) => traverse(w.child));
    }
  };
  traverse(expr);
  return out;
}

export interface CharterValidation {
  passed: boolean;
  covered: Dimension[];
  missing: Dimension[];
  warnings: string[];
}

export function validateAgainstCharter(
  expr: StrategyExpression,
): CharterValidation {
  const covered = extractDimensionsCovered(expr);
  const missing = ALL_DIMENSIONS.filter((d) => !covered.has(d));
  const warnings: string[] = [];
  if (missing.length > 0) {
    warnings.push(`헌장 미준수: ${missing.join(", ")} 차원 부재`);
  }
  // 알려지지 않은 indicator 경고
  const traverse = (node: StrategyExpression) => {
    if (node.type === "condition") {
      if (!INDICATOR_TO_DIMENSION[node.indicator]) {
        warnings.push(`unknown indicator: ${node.indicator}`);
      }
    } else if (node.type === "logic") {
      node.children.forEach(traverse);
    } else if (node.type === "weighted") {
      node.weights.forEach((w) => traverse(w.child));
    }
  };
  traverse(expr);

  return {
    passed: missing.length === 0,
    covered: [...covered],
    missing,
    warnings,
  };
}

// ─────────────────────────────────────────────────────────
// Result type
// ─────────────────────────────────────────────────────────

export interface MultiStrategyResult extends SingleIndicatorResult {
  expression: StrategyExpression;
  dimensions_covered: Dimension[];
  charter_validation: CharterValidation;

  by_layer: {
    signal_layer: { rsi_buckets: BucketStat[]; bb_buckets: BucketStat[]; adx_buckets: BucketStat[] };
    wave_layer: { alignment_buckets: BucketStat[]; fib_buckets: BucketStat[] };
    macro_layer: { regime_buckets: RegimeBucketStat[]; c4_buckets: RegimeBucketStat[] };
  };
  cross_layer: {
    top_combinations: Array<{
      macro_regime: string;
      wave_alignment: string;
      fib_zone: string;
      count: number;
      win_rate: number;
      ci: [number, number];
    }>;
  };
}

export interface BucketStat {
  label: string;
  bucket: [number, number];
  n: number;
  win_rate: number;
  ci: [number, number];
}

export interface RegimeBucketStat {
  label: string;
  n: number;
  win_rate: number;
  ci: [number, number];
}

// ─────────────────────────────────────────────────────────
// Exit sim (reused from single-indicator behaviour, local copy)
// ─────────────────────────────────────────────────────────

function simulateExitLocal(
  timeline: Timeline,
  entryIdx: number,
  entryPrice: number,
  exit: ExitCondition,
): { exitIdx: number; exitPrice: number } {
  const params = exit.params;
  const maxBars = params.max_bars ?? 50;
  const endIdx = Math.min(entryIdx + maxBars, timeline.length - 1);
  for (let i = entryIdx + 1; i <= endIdx; i++) {
    const c = timeline[i];
    if (exit.type === "fixed_return" && params.target_pct != null) {
      const tp = entryPrice * (1 + params.target_pct);
      if (c.high >= tp) return { exitIdx: i, exitPrice: tp };
    }
    if (
      (exit.type === "fixed_loss" || exit.type === "fixed_return") &&
      params.stop_pct != null
    ) {
      const sp = entryPrice * (1 - params.stop_pct);
      if (c.low <= sp) return { exitIdx: i, exitPrice: sp };
    }
  }
  return { exitIdx: endIdx, exitPrice: timeline[endIdx].close };
}

// ─────────────────────────────────────────────────────────
// Main runner
// ─────────────────────────────────────────────────────────

export interface RunMultiStrategyOpts {
  timelineOverride?: Timeline;
}

export async function runMultiStrategyBacktest(
  config: MultiStrategyConfig,
  opts: RunMultiStrategyOpts = {},
): Promise<MultiStrategyResult> {
  const charter = validateAgainstCharter(config.expression);
  const dims = extractDimensionsCovered(config.expression);
  const needMacro = dims.has("macro");

  const timeline =
    opts.timelineOverride ??
    (await buildTimeline({
      symbol: config.symbol,
      tf: config.tf,
      startMs: config.start_ms,
      endMs: config.end_ms,
      mode: config.mode ?? "backtest",
      includeMacro: needMacro,
    }));

  const feePct = config.fee_pct ?? 0.001;
  const slipPct = config.slippage_pct ?? 0.0005;
  const costPct = feePct * 2 + slipPct * 2;

  interface Trade {
    entry_ts: number;
    entry_price: number;
    exit_ts: number;
    exit_price: number;
    return_pct: number;
    win: boolean;
    bars_held: number;
    snapshot: LayeredSnapshot;
  }
  const trades: Trade[] = [];
  let nextEligibleIdx = 0;

  for (let i = 0; i < timeline.length; i++) {
    if (i < nextEligibleIdx) continue;
    const prev = i > 0 ? timeline[i - 1] : null;
    const { triggered } = evaluateStrategy(config.expression, timeline[i], prev);
    if (!triggered) continue;

    const entryPrice = timeline[i].close;
    const sim = simulateExitLocal(timeline, i, entryPrice, config.exit_condition);
    const ret = ((sim.exitPrice - entryPrice) / entryPrice) * 100 - costPct * 100;
    trades.push({
      entry_ts: timeline[i].ts,
      entry_price: entryPrice,
      exit_ts: timeline[sim.exitIdx].ts,
      exit_price: sim.exitPrice,
      return_pct: ret,
      win: ret > 0,
      bars_held: sim.exitIdx - i,
      snapshot: timeline[i],
    });
    nextEligibleIdx = sim.exitIdx + 1;
  }

  const n = trades.length;
  const wins = trades.filter((t) => t.win).length;
  const winRate = n > 0 ? wins / n : 0;
  const ci = wilsonScoreInterval(wins, n);
  const returns = trades.map((t) => t.return_pct);
  const avgReturn = n > 0 ? returns.reduce((s, v) => s + v, 0) / n : 0;
  const sharpe = computeSharpe(returns);
  const mdd = computeMdd(returns);
  const baseline = computeBaseline(timeline, config.exit_condition, costPct);
  const pValue = binomialPValue(wins, n, baseline);
  const sufficiency: SampleSufficiency = classifySampleSufficiency(n, winRate);
  const alphaSignificant =
    pValue < 0.05 && winRate > baseline && sufficiency !== "insufficient";

  // by_layer buckets
  const rsiVals = trades.map((t) => ({ v: t.snapshot.signal.rsi, win: t.win }));
  const bbVals = trades.map((t) => ({ v: t.snapshot.signal.bb_position_pct, win: t.win }));
  const adxVals = trades.map((t) => ({ v: t.snapshot.signal.adx, win: t.win }));
  const alignVals = trades.map((t) => ({ v: t.snapshot.wave.alignment_score, win: t.win }));
  const fibVals = trades.map((t) => ({
    v: t.snapshot.wave.current_fib_position ?? 0,
    win: t.win,
  }));

  const by_layer = {
    signal_layer: {
      rsi_buckets: bucketStats(rsiVals, [0, 30, 50, 70, 100]),
      bb_buckets: bucketStats(bbVals, [0, 0.2, 0.4, 0.6, 0.8, 1.0]),
      adx_buckets: bucketStats(adxVals, [0, 15, 25, 40, 100]),
    },
    wave_layer: {
      alignment_buckets: bucketStats(alignVals, [-1, -0.3, 0, 0.3, 1.0]),
      fib_buckets: bucketStats(fibVals, [0, 0.382, 0.5, 0.618, 0.786, 1.5]),
    },
    macro_layer: {
      regime_buckets: regimeBuckets(trades.map((t) => ({
        key: t.snapshot.macro?.regime ?? "none",
        win: t.win,
      }))),
      c4_buckets: regimeBuckets(trades.map((t) => ({
        key: t.snapshot.macro?.c4_cycle_phase ?? "none",
        win: t.win,
      }))),
    },
  };

  // cross_layer top combos
  const combo = new Map<string, { count: number; wins: number; meta: any }>();
  for (const t of trades) {
    const m = t.snapshot.macro?.regime ?? "none";
    const a =
      t.snapshot.wave.alignment_score > 0.3
        ? "up"
        : t.snapshot.wave.alignment_score < -0.3
          ? "down"
          : "flat";
    const f = (() => {
      const p = t.snapshot.wave.current_fib_position ?? 0;
      if (p < 0.382) return "0-0.382";
      if (p < 0.618) return "0.382-0.618";
      if (p < 1) return "0.618-1.0";
      return "1.0+";
    })();
    const key = `${m}|${a}|${f}`;
    const cur = combo.get(key) ?? {
      count: 0,
      wins: 0,
      meta: { macro_regime: m, wave_alignment: a, fib_zone: f },
    };
    cur.count++;
    if (t.win) cur.wins++;
    combo.set(key, cur);
  }
  const topCombos = [...combo.entries()]
    .map(([, v]) => {
      const wci = wilsonScoreInterval(v.wins, v.count);
      return {
        macro_regime: v.meta.macro_regime,
        wave_alignment: v.meta.wave_alignment,
        fib_zone: v.meta.fib_zone,
        count: v.count,
        win_rate: wci.point,
        ci: [wci.lower, wci.upper] as [number, number],
      };
    })
    .sort((a, b) => b.win_rate - a.win_rate)
    .slice(0, 10);

  return {
    config: {
      indicator: "(multi)",
      layer: "signal",
      entry_condition: { type: "less_than", threshold: 0 },
      exit_condition: config.exit_condition,
      symbol: config.symbol,
      tf: config.tf,
      start_ms: config.start_ms,
      end_ms: config.end_ms,
      mode: config.mode,
    },
    total_signals: n,
    win_rate: winRate,
    ci: [ci.lower, ci.upper],
    avg_return_pct: avgReturn,
    mdd_pct: mdd,
    sharpe,
    trades: trades.map((t) => ({
      entry_ts: t.entry_ts,
      entry_price: t.entry_price,
      exit_ts: t.exit_ts,
      exit_price: t.exit_price,
      return_pct: t.return_pct,
      win: t.win,
      bars_held: t.bars_held,
    })),
    by_value_bucket: [], // multi-strategy aggregates per-layer instead
    alpha_significant: alphaSignificant,
    baseline_winrate: baseline,
    p_value: pValue,
    sample_sufficiency: sufficiency,
    expression: config.expression,
    dimensions_covered: [...dims],
    charter_validation: charter,
    by_layer,
    cross_layer: { top_combinations: topCombos },
  };
}

// ─────────────────────────────────────────────────────────
// Local helpers
// ─────────────────────────────────────────────────────────

function bucketStats(
  pairs: Array<{ v: number; win: boolean }>,
  edges: number[],
): BucketStat[] {
  const out: BucketStat[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i];
    const hi = edges[i + 1];
    const last = i === edges.length - 2;
    const inB = pairs.filter((p) =>
      last ? p.v >= lo && p.v <= hi : p.v >= lo && p.v < hi,
    );
    const wins = inB.filter((p) => p.win).length;
    const wci = wilsonScoreInterval(wins, inB.length);
    out.push({
      label: `${lo.toFixed(2)}~${hi.toFixed(2)}`,
      bucket: [lo, hi],
      n: inB.length,
      win_rate: wci.point,
      ci: [wci.lower, wci.upper],
    });
  }
  return out;
}

function regimeBuckets(
  pairs: Array<{ key: string; win: boolean }>,
): RegimeBucketStat[] {
  const groups = new Map<string, { n: number; wins: number }>();
  for (const p of pairs) {
    const g = groups.get(p.key) ?? { n: 0, wins: 0 };
    g.n++;
    if (p.win) g.wins++;
    groups.set(p.key, g);
  }
  return [...groups.entries()].map(([label, g]) => {
    const wci = wilsonScoreInterval(g.wins, g.n);
    return {
      label,
      n: g.n,
      win_rate: wci.point,
      ci: [wci.lower, wci.upper] as [number, number],
    };
  });
}

function computeMdd(returns: number[]): number {
  if (returns.length === 0) return 0;
  let eq = 100;
  let peak = 100;
  let mdd = 0;
  for (const r of returns) {
    eq *= 1 + r / 100;
    if (eq > peak) peak = eq;
    const dd = ((peak - eq) / peak) * 100;
    if (dd > mdd) mdd = dd;
  }
  return mdd;
}

function computeSharpe(returns: number[]): number {
  if (returns.length < 2) return 0;
  const m = returns.reduce((s, v) => s + v, 0) / returns.length;
  const v =
    returns.reduce((s, x) => s + (x - m) ** 2, 0) / returns.length;
  const sd = Math.sqrt(v);
  return sd > 0 ? m / sd : 0;
}

function computeBaseline(
  timeline: Timeline,
  exit: ExitCondition,
  costPct: number,
): number {
  if (timeline.length < 10) return 0.5;
  const step = Math.max(1, Math.floor(timeline.length / 200));
  let wins = 0;
  let total = 0;
  for (let i = 0; i < timeline.length - 1; i += step) {
    const entry = timeline[i].close;
    const sim = simulateExitLocal(timeline, i, entry, exit);
    const ret = ((sim.exitPrice - entry) / entry) * 100 - costPct * 100;
    if (ret > 0) wins++;
    total++;
  }
  return total > 0 ? wins / total : 0.5;
}
