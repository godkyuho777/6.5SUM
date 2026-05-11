/**
 * Engine A — Single indicator backtest.
 *
 * DUAL_BACKTEST_ENGINE_PLAN §2.
 *
 * 한 지표 + 단순 entry/exit 룰로 alpha 측정.
 * 사용자: "RSI 30 매수가 BTC 4H 에서 진짜 작동?"
 *
 * 핵심 보장:
 *   - Look-ahead-free: 진입 결정은 snapshot[i], 청산 평가는 [i+1..i+window].
 *   - Wilson 95% CI (calibration.ts 의 함수 재사용).
 *   - Baseline winrate vs 결과 → binomial p-value.
 *   - Sample sufficiency 분류 (§6.1).
 */

import type { Timeline, LayeredSnapshot } from "../timeline-types";
import { buildTimeline } from "../timeline-builder";
import { wilsonScoreInterval } from "../calibration";
import type { FredMode } from "../../macro/sources/fred";

// ─────────────────────────────────────────────────────────
// Indicator value accessor
// ─────────────────────────────────────────────────────────

export type IndicatorLayer = "signal" | "wave" | "macro";

/**
 * snapshot 에서 indicator 값을 추출. 미지의 indicator → null.
 *
 * Macro 지표는 MACRO_v2 §4.3 의 routing 따른다.
 */
export function getIndicatorValue(
  snapshot: LayeredSnapshot,
  indicator: string,
  layer: IndicatorLayer,
): number | string | null {
  if (layer === "signal") {
    const s = snapshot.signal;
    const map: Record<string, number> = {
      rsi: s.rsi,
      bb_upper: s.bb_upper,
      bb_middle: s.bb_middle,
      bb_lower: s.bb_lower,
      bb_position_pct: s.bb_position_pct,
      adx: s.adx,
      diPlus: s.diPlus,
      diMinus: s.diMinus,
      atr: s.atr,
      macd_histogram: s.macd_histogram,
      volume_ratio: s.volume_ratio,
    };
    return indicator in map ? map[indicator] : null;
  }
  if (layer === "wave") {
    const w = snapshot.wave;
    const map: Record<string, number | null> = {
      wave_progress_pct: w.wave_progress_pct,
      alignment_score: w.alignment_score,
      uptrend_strength: w.uptrend_strength,
      current_fib_position: w.current_fib_position,
      swing_high: w.swing_high,
      swing_low: w.swing_low,
    };
    return indicator in map ? (map[indicator] ?? null) : null;
  }
  if (layer === "macro") {
    if (!snapshot.macro) return null;
    const m = snapshot.macro;
    const map: Record<string, number | string> = {
      sofr_iorb_spread_bp: m.sofr_iorb_spread_bp,
      yield_curve_10_2: m.yield_curve_10_2,
      walcl_change_30d_pct: m.walcl_change_30d_pct,
      rrp_tga_change_30d_pct: m.rrp_tga_change_30d_pct,
      real_rate: m.real_rate,
      dxy_change_30d_pct: m.dxy_change_30d_pct,
      vix: m.vix,
      bok_rate_change_90d: m.bok_rate_change_90d ?? 0,
      krw_change_30d_pct: m.krw_change_30d_pct ?? 0,
      c1_crisis: m.c1_crisis,
      c2_riskOn: m.c2_riskOn,
      c3_net_liquidity_30d_pct: m.c3_net_liquidity_30d_pct,
      c4_cycle_phase: m.c4_cycle_phase,
      macro_score: m.score,
      macro_regime: m.regime,
    };
    return indicator in map ? map[indicator] : null;
  }
  return null;
}

// ─────────────────────────────────────────────────────────
// Config / Result types
// ─────────────────────────────────────────────────────────

export type EntryConditionType =
  | "less_than"
  | "greater_than"
  | "between"
  | "crosses_below"
  | "crosses_above"
  | "equals";

export interface EntryCondition {
  type: EntryConditionType;
  threshold: number | [number, number] | string;
}

export interface ExitConditionParams {
  /** Fixed return target as fraction (0.03 = +3%). */
  target_pct?: number;
  /** Fixed loss stop as positive fraction (0.02 = -2%). */
  stop_pct?: number;
  /** Time stop in bars. */
  max_bars?: number;
  /** Indicator-based exit threshold (number 또는 string). */
  indicator?: string;
  indicator_layer?: IndicatorLayer;
  indicator_threshold?: number;
  indicator_direction?: "greater_than" | "less_than";
}

export interface ExitCondition {
  type: "fixed_return" | "fixed_loss" | "time_stop" | "indicator_threshold";
  params: ExitConditionParams;
}

export interface SingleIndicatorConfig {
  indicator: string;
  layer: IndicatorLayer;
  entry_condition: EntryCondition;
  exit_condition: ExitCondition;
  symbol: string;
  tf: "4h" | "1d" | "1w";
  start_ms: number;
  end_ms: number;
  mode?: FredMode;
  /** 트랜잭션 비용: taker fee + slippage (default Bybit Spot 0.1% + 0.05%). */
  fee_pct?: number;
  slippage_pct?: number;
}

export interface SingleIndicatorTrade {
  entry_ts: number;
  entry_price: number;
  exit_ts: number;
  exit_price: number;
  return_pct: number;
  win: boolean;
  bars_held: number;
}

export interface ValueBucketStat {
  bucket: [number, number];
  n: number;
  wins: number;
  win_rate: number;
  ci: [number, number];
}

export type SampleSufficiency = "sufficient" | "marginal" | "insufficient";

export interface SingleIndicatorResult {
  config: SingleIndicatorConfig;
  total_signals: number;
  win_rate: number;
  ci: [number, number];
  avg_return_pct: number;
  mdd_pct: number;
  sharpe: number;
  trades: SingleIndicatorTrade[];
  by_value_bucket: ValueBucketStat[];

  // alpha verification
  alpha_significant: boolean;
  baseline_winrate: number;
  p_value: number;
  sample_sufficiency: SampleSufficiency;
}

// ─────────────────────────────────────────────────────────
// Entry evaluation
// ─────────────────────────────────────────────────────────

function evaluateEntry(
  cond: EntryCondition,
  value: number | string | null,
  prevValue: number | string | null,
): boolean {
  if (value == null) return false;
  if (cond.type === "equals") {
    return value === cond.threshold;
  }
  if (typeof value !== "number") return false;
  const t = cond.threshold;
  if (cond.type === "less_than" && typeof t === "number") return value < t;
  if (cond.type === "greater_than" && typeof t === "number") return value > t;
  if (cond.type === "between" && Array.isArray(t))
    return value >= t[0] && value <= t[1];
  if (cond.type === "crosses_below" && typeof t === "number") {
    if (typeof prevValue !== "number") return false;
    return prevValue >= t && value < t;
  }
  if (cond.type === "crosses_above" && typeof t === "number") {
    if (typeof prevValue !== "number") return false;
    return prevValue <= t && value > t;
  }
  return false;
}

// ─────────────────────────────────────────────────────────
// Exit simulation (lookahead-free — uses [i+1..])
// ─────────────────────────────────────────────────────────

function simulateExit(
  timeline: Timeline,
  entryIdx: number,
  entryPrice: number,
  exit: ExitCondition,
): { exitIdx: number; exitPrice: number; reason: string } {
  const params = exit.params;
  const maxBars = params.max_bars ?? 50;
  const endIdx = Math.min(entryIdx + maxBars, timeline.length - 1);

  for (let i = entryIdx + 1; i <= endIdx; i++) {
    const c = timeline[i];

    // fixed_return — target hit
    if (exit.type === "fixed_return" && params.target_pct != null) {
      const targetPrice = entryPrice * (1 + params.target_pct);
      if (c.high >= targetPrice) {
        return { exitIdx: i, exitPrice: targetPrice, reason: "target" };
      }
    }

    // fixed_loss — stop hit
    if ((exit.type === "fixed_loss" || exit.type === "fixed_return") && params.stop_pct != null) {
      const stopPrice = entryPrice * (1 - params.stop_pct);
      if (c.low <= stopPrice) {
        return { exitIdx: i, exitPrice: stopPrice, reason: "stop" };
      }
    }

    // indicator_threshold
    if (exit.type === "indicator_threshold" && params.indicator) {
      const v = getIndicatorValue(
        c,
        params.indicator,
        params.indicator_layer ?? "signal",
      );
      if (typeof v === "number" && params.indicator_threshold != null) {
        const t = params.indicator_threshold;
        if (
          (params.indicator_direction === "greater_than" && v > t) ||
          (params.indicator_direction === "less_than" && v < t)
        ) {
          return { exitIdx: i, exitPrice: c.close, reason: "indicator" };
        }
      }
    }
  }

  // time stop
  return {
    exitIdx: endIdx,
    exitPrice: timeline[endIdx].close,
    reason: "time_stop",
  };
}

// ─────────────────────────────────────────────────────────
// Stats helpers
// ─────────────────────────────────────────────────────────

/**
 * Sample sufficiency 분류 (DUAL_BACKTEST §6.1).
 *   n>=100 && CI width <0.15 → sufficient
 *   n>=30  && CI width <0.25 → marginal
 *   else                     → insufficient
 */
export function classifySampleSufficiency(
  n: number,
  winRate: number,
): SampleSufficiency {
  const wins = Math.round(winRate * n);
  const { lower, upper } = wilsonScoreInterval(wins, n);
  const width = upper - lower;
  if (n >= 100 && width < 0.15) return "sufficient";
  if (n >= 30 && width < 0.25) return "marginal";
  return "insufficient";
}

/**
 * Binomial p-value: H0 = trueWinRate = baseline.
 * Normal approximation 사용 (n >= 30 시 충분히 정확).
 * 양측 검정 — abs(z) 의 표준정규 꼬리 확률 × 2.
 */
export function binomialPValue(
  wins: number,
  n: number,
  baseline: number,
): number {
  if (n <= 0) return 1;
  const p = wins / n;
  const se = Math.sqrt((baseline * (1 - baseline)) / n);
  if (se === 0) return p === baseline ? 1 : 0;
  const z = (p - baseline) / se;
  // 표준정규 분포의 양측 꼬리 — Math.erf 가 ESM 에 없으므로 approx
  // erfc(|z|/sqrt(2)) — Abramowitz & Stegun 7.1.26 근사
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
  const erfApprox =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t -
      0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-((Math.abs(z) / Math.SQRT2) ** 2));
  const oneTail = 0.5 * (1 - erfApprox);
  return Math.min(1, 2 * oneTail);
}

function computeMdd(returns: number[]): number {
  if (returns.length === 0) return 0;
  let equity = 100;
  let peak = 100;
  let mdd = 0;
  for (const r of returns) {
    equity *= 1 + r / 100;
    if (equity > peak) peak = equity;
    const dd = ((peak - equity) / peak) * 100;
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

// ─────────────────────────────────────────────────────────
// Bucketize indicator values
// ─────────────────────────────────────────────────────────

function bucketizeByValue(
  trades: Array<SingleIndicatorTrade & { entryValue: number }>,
  edges: number[],
): ValueBucketStat[] {
  const out: ValueBucketStat[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i];
    const hi = edges[i + 1];
    const last = i === edges.length - 2;
    const inB = trades.filter((t) =>
      last ? t.entryValue >= lo && t.entryValue <= hi : t.entryValue >= lo && t.entryValue < hi,
    );
    const n = inB.length;
    const wins = inB.filter((t) => t.win).length;
    const ci = wilsonScoreInterval(wins, n);
    out.push({
      bucket: [lo, hi],
      n,
      wins,
      win_rate: ci.point,
      ci: [ci.lower, ci.upper],
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────
// Main runner
// ─────────────────────────────────────────────────────────

export interface RunSingleIndicatorOpts {
  /** 사전 빌드된 timeline (테스트 mock 주입용). */
  timelineOverride?: Timeline;
}

export async function runSingleIndicatorBacktest(
  config: SingleIndicatorConfig,
  opts: RunSingleIndicatorOpts = {},
): Promise<SingleIndicatorResult> {
  // ── Timeline 빌드 ─────────────────────────────────────
  const timeline =
    opts.timelineOverride ??
    (await buildTimeline({
      symbol: config.symbol,
      tf: config.tf,
      startMs: config.start_ms,
      endMs: config.end_ms,
      mode: config.mode ?? "backtest",
      includeMacro: config.layer === "macro",
    }));

  if (timeline.length === 0) {
    return emptyResult(config);
  }

  const feePct = config.fee_pct ?? 0.001; // 0.1% taker
  const slipPct = config.slippage_pct ?? 0.0005; // 0.05%
  const costPct = feePct * 2 + slipPct * 2; // round-trip

  const trades: Array<SingleIndicatorTrade & { entryValue: number }> = [];
  const indicatorValuesAll: number[] = [];

  // cooldown — 다음 trade 진입 가능 인덱스
  let nextEligibleIdx = 0;
  let prevValue: number | string | null = null;

  for (let i = 0; i < timeline.length; i++) {
    const v = getIndicatorValue(timeline[i], config.indicator, config.layer);
    if (typeof v === "number") indicatorValuesAll.push(v);

    if (i < nextEligibleIdx) {
      prevValue = v;
      continue;
    }

    const triggered = evaluateEntry(config.entry_condition, v, prevValue);
    prevValue = v;
    if (!triggered) continue;

    const entryPrice = timeline[i].close;
    const sim = simulateExit(timeline, i, entryPrice, config.exit_condition);
    const ret = ((sim.exitPrice - entryPrice) / entryPrice) * 100 - costPct * 100;
    trades.push({
      entry_ts: timeline[i].ts,
      entry_price: entryPrice,
      exit_ts: timeline[sim.exitIdx].ts,
      exit_price: sim.exitPrice,
      return_pct: ret,
      win: ret > 0,
      bars_held: sim.exitIdx - i,
      entryValue: typeof v === "number" ? v : 0,
    });

    nextEligibleIdx = sim.exitIdx + 1;
  }

  const n = trades.length;
  const wins = trades.filter((t) => t.win).length;
  const winRate = n > 0 ? wins / n : 0;
  const ci = wilsonScoreInterval(wins, n);
  const returns = trades.map((t) => t.return_pct);
  const avgReturn = n > 0 ? returns.reduce((s, v) => s + v, 0) / n : 0;
  const mdd = computeMdd(returns);
  const sharpe = computeSharpe(returns);

  // baseline = buy-and-hold winRate (가까이) 또는 0.5
  // 본 구현: 동일 timeline 에서 random entry (모든 bar) 의 평균 승률 — proxy.
  const baselineWinRate = computeBaselineWinRate(
    timeline,
    config.exit_condition,
    costPct,
  );
  const pValue = binomialPValue(wins, n, baselineWinRate);
  const sufficiency = classifySampleSufficiency(n, winRate);
  const alphaSignificant =
    pValue < 0.05 && winRate > baselineWinRate && sufficiency !== "insufficient";

  // value bucket — 분포 자동 추정 (5분위)
  const buckets = bucketsFromIndicatorValues(indicatorValuesAll);
  const byBucket = bucketizeByValue(trades, buckets);

  return {
    config,
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
    by_value_bucket: byBucket,
    alpha_significant: alphaSignificant,
    baseline_winrate: baselineWinRate,
    p_value: pValue,
    sample_sufficiency: sufficiency,
  };
}

// ─────────────────────────────────────────────────────────
// Baseline & helpers
// ─────────────────────────────────────────────────────────

function computeBaselineWinRate(
  timeline: Timeline,
  exit: ExitCondition,
  costPct: number,
): number {
  // 각 bar 시점에 진입했다고 가정한 평균 승률 — random-entry proxy.
  // 모든 인덱스 시뮬레이션은 O(N × max_bars). max_bars 작으므로 OK.
  if (timeline.length < 10) return 0.5;
  const sampleStep = Math.max(1, Math.floor(timeline.length / 200)); // ≤200 시뮬
  let wins = 0;
  let total = 0;
  for (let i = 0; i < timeline.length - 1; i += sampleStep) {
    const entry = timeline[i].close;
    const sim = simulateExit(timeline, i, entry, exit);
    const ret = ((sim.exitPrice - entry) / entry) * 100 - costPct * 100;
    if (ret > 0) wins++;
    total++;
  }
  return total > 0 ? wins / total : 0.5;
}

function bucketsFromIndicatorValues(values: number[]): number[] {
  if (values.length === 0) return [0, 25, 50, 75, 100];
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  if (max === min) return [min - 1, min, min + 1];
  // 5 buckets equal-width
  const step = (max - min) / 5;
  return [min, min + step, min + step * 2, min + step * 3, min + step * 4, max];
}

function emptyResult(config: SingleIndicatorConfig): SingleIndicatorResult {
  return {
    config,
    total_signals: 0,
    win_rate: 0,
    ci: [0, 0],
    avg_return_pct: 0,
    mdd_pct: 0,
    sharpe: 0,
    trades: [],
    by_value_bucket: [],
    alpha_significant: false,
    baseline_winrate: 0,
    p_value: 1,
    sample_sufficiency: "insufficient",
  };
}
