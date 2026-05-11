/**
 * Backtesting Metrics Calculator
 *
 * BacktestTrade[] → BacktestMetrics
 * MD 파일 Section 2.2 기반 통계:
 *  - winRate, avgReturn, stdReturn, Sharpe
 *  - maxDrawdown (equity curve peak-to-trough)
 *  - profitFactor, expectancy
 */

import type { BacktestTrade, BacktestMetrics } from "./types";
import { wilsonScoreInterval } from "./calibration";

// ─────────────────────────────────────────────────────────
// Transaction cost model (P1.G fix — DUAL_BACKTEST §6.x)
// ─────────────────────────────────────────────────────────

/** Default trading cost assumptions. Override via `applyCostModel` opts. */
export const DEFAULT_COST_MODEL = {
  /** Taker fee per side, fraction. Bybit Spot 0.1%. */
  fee_pct: 0.001,
  /** Estimated slippage per side, fraction. */
  slippage_pct: 0.0005,
} as const;

export interface CostModel {
  fee_pct: number;
  slippage_pct: number;
}

/** Adjust a raw returnPct by round-trip fee + slippage. Pure helper. */
export function applyCostModel(
  rawReturnPct: number,
  model: CostModel = DEFAULT_COST_MODEL,
): number {
  // round-trip cost in %: (fee + slippage) × 2
  const cost = (model.fee_pct + model.slippage_pct) * 2 * 100;
  return rawReturnPct - cost;
}

// ─────────────────────────────────────────────────────────
// Sample sufficiency classifier (P1.G — DUAL_BACKTEST §6.1)
// ─────────────────────────────────────────────────────────

export type SampleSufficiencyLabel =
  | "sufficient"
  | "marginal"
  | "insufficient";

/**
 * 표본 충분성 분류. 신뢰구간 폭과 표본 크기 둘 다 검사.
 *   n>=100 + CI width <0.15 → sufficient
 *   n>=30  + CI width <0.25 → marginal
 *   else                     → insufficient
 */
export function classifySampleSufficiency(
  n: number,
  winRate: number,
): SampleSufficiencyLabel {
  if (n <= 0) return "insufficient";
  const wins = Math.round(winRate * n);
  const { lower, upper } = wilsonScoreInterval(wins, n);
  const width = upper - lower;
  if (n >= 100 && width < 0.15) return "sufficient";
  if (n >= 30 && width < 0.25) return "marginal";
  return "insufficient";
}

/**
 * Wilson CI 를 winRate 옆에 부착한 확장 메트릭.
 * 기존 BacktestMetrics 를 확장하므로 backward-compat 유지.
 */
export interface BacktestMetricsExt extends BacktestMetrics {
  ci_low: number;
  ci_high: number;
  sample_sufficiency: SampleSufficiencyLabel;
}

export function withCi(metrics: BacktestMetrics): BacktestMetricsExt {
  const { lower, upper } = wilsonScoreInterval(metrics.wins, metrics.totalTrades);
  return {
    ...metrics,
    ci_low: lower,
    ci_high: upper,
    sample_sufficiency: classifySampleSufficiency(
      metrics.totalTrades,
      metrics.winRate,
    ),
  };
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function std(arr: number[], avg?: number): number {
  if (arr.length < 2) return 0;
  const m = avg ?? mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

/**
 * 누적 equity curve (% 기준) 에서 최대 낙폭(MDD) 계산
 * 각 트레이드 returnPct를 순차 적용한 누적 수익률의 peak-to-trough
 */
function calcMaxDrawdown(trades: BacktestTrade[]): number {
  if (trades.length === 0) return 0;

  let equity = 100; // 기준 100으로 시작
  let peak = 100;
  let maxDD = 0;

  for (const t of trades) {
    equity *= 1 + t.returnPct / 100;
    if (equity > peak) peak = equity;
    const dd = ((peak - equity) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }

  return Math.round(maxDD * 100) / 100;
}

/**
 * BacktestTrade 배열에서 통계 지표를 계산한다.
 * 트레이드가 없으면 모든 지표 0 반환.
 */
export function computeMetrics(trades: BacktestTrade[]): BacktestMetrics {
  const n = trades.length;

  if (n === 0) {
    return {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      avgReturn: 0,
      stdReturn: 0,
      sharpe: 0,
      maxDrawdown: 0,
      profitFactor: 0,
      avgWin: 0,
      avgLoss: 0,
      expectancy: 0,
      avgHoldingCandles: 0,
      avgMaxFavorable: 0,
      avgMaxAdverse: 0,
    };
  }

  const wins = trades.filter((t) => t.win);
  const losses = trades.filter((t) => !t.win);

  const winCount = wins.length;
  const lossCount = losses.length;
  const winRate = winCount / n;

  const returns = trades.map((t) => t.returnPct);
  const avgReturn = mean(returns);
  const stdReturn = std(returns, avgReturn);

  // Sharpe (트레이드 단위, 무위험 수익률 0 가정)
  const sharpe = stdReturn > 0 ? avgReturn / stdReturn : 0;

  // Profit Factor: 총 이익 / |총 손실|
  const totalProfit = wins.reduce((s, t) => s + t.returnPct, 0);
  const totalLoss = Math.abs(losses.reduce((s, t) => s + t.returnPct, 0));
  const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0;

  const avgWin = winCount > 0 ? mean(wins.map((t) => t.returnPct)) : 0;
  const avgLoss = lossCount > 0 ? mean(losses.map((t) => t.returnPct)) : 0;

  // Expectancy
  const lossRate = 1 - winRate;
  const expectancy = winRate * avgWin + lossRate * avgLoss;

  const maxDrawdown = calcMaxDrawdown(trades);

  const avgHoldingCandles = Math.round(mean(trades.map((t) => t.holdingCandles)));
  const avgMaxFavorable = mean(trades.map((t) => t.maxFavorable));
  const avgMaxAdverse = mean(trades.map((t) => t.maxAdverse));

  return {
    totalTrades: n,
    wins: winCount,
    losses: lossCount,
    winRate: Math.round(winRate * 10000) / 10000,
    avgReturn: Math.round(avgReturn * 10000) / 10000,
    stdReturn: Math.round(stdReturn * 10000) / 10000,
    sharpe: Math.round(sharpe * 10000) / 10000,
    maxDrawdown,
    profitFactor: Math.round(profitFactor * 100) / 100,
    avgWin: Math.round(avgWin * 10000) / 10000,
    avgLoss: Math.round(avgLoss * 10000) / 10000,
    expectancy: Math.round(expectancy * 10000) / 10000,
    avgHoldingCandles,
    avgMaxFavorable: Math.round(avgMaxFavorable * 10000) / 10000,
    avgMaxAdverse: Math.round(avgMaxAdverse * 10000) / 10000,
  };
}

/**
 * 심볼별 지표 계산
 */
export function computeMetricsBySymbol(
  trades: BacktestTrade[]
): Record<string, BacktestMetrics> {
  const grouped: Record<string, BacktestTrade[]> = {};
  for (const t of trades) {
    (grouped[t.symbol] ??= []).push(t);
  }
  const result: Record<string, BacktestMetrics> = {};
  for (const [sym, ts] of Object.entries(grouped)) {
    result[sym] = computeMetrics(ts);
  }
  return result;
}

/**
 * 타임프레임별 지표 계산
 */
export function computeMetricsByTf(
  trades: BacktestTrade[]
): Record<string, BacktestMetrics> {
  const grouped: Record<string, BacktestTrade[]> = {};
  for (const t of trades) {
    (grouped[t.tf] ??= []).push(t);
  }
  const result: Record<string, BacktestMetrics> = {};
  for (const [tf, ts] of Object.entries(grouped)) {
    result[tf] = computeMetrics(ts);
  }
  return result;
}

/**
 * Side(LONG/SHORT) 별 지표 계산 (P1-#3, 2026-05-10).
 *
 * Audit `01-BBDX-AUDIT.md` S2 권고 — SHORT path 알파 입증을 위해 LONG 과
 * 분리 측정. side 미지정 trade 는 "long" 으로 간주 (backward compat).
 *
 * @returns { long: metrics, short: metrics } — 한쪽 trade 0건이면 totalTrades=0
 */
export function computeMetricsBySide(
  trades: BacktestTrade[],
): { long: BacktestMetrics; short: BacktestMetrics } {
  const longTrades = trades.filter((t) => (t.side ?? "long") === "long");
  const shortTrades = trades.filter((t) => t.side === "short");
  return {
    long: computeMetrics(longTrades),
    short: computeMetrics(shortTrades),
  };
}

/**
 * 표준 편차 export (signal-extractor 등 재사용)
 */
export { mean, std };
