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
