/**
 * Composite Backtest Runner — Phase A-2 (2026-05-11).
 *
 * 기존 runBacktest 와 별도 path. 3-Layer composite config 받아서
 * fetchHistoricalCandles → extractCompositeAllSignals → computeMetrics.
 */

import type { TimeframeValue } from "@shared/types";
import { fetchHistoricalKlines } from "../data-loader";
import {
  computeMetrics,
  computeMetricsBySymbol,
} from "../metrics";
import type { BacktestMetrics, BacktestTrade } from "../types";
import {
  extractCompositeAllSignals,
  computeLayerStats,
} from "./composite-strategy";
import type {
  CompositeBacktestResult,
  CompositeEvaluation,
  CompositeStrategyConfig,
} from "./types";

export interface RunCompositeBacktestArgs {
  symbols: string[];
  tf: TimeframeValue;
  startDate: Date;
  endDate: Date;
  outcomeWindowCandles?: number;
  cooldownCandles?: number;
  minWarmupCandles?: number;
  config: CompositeStrategyConfig;
  /** Macro snapshot — backtest 전체 동안 freeze (시간 의존성 X, v1 단순화). */
  macroSnapshot?: {
    regime?: "flooded" | "easy" | "neutral" | "tight" | "crisis";
    score?: number;
    mult?: number;
    koreaModifier?: number;
  };
  /** Wave snapshot — symbol 무관 (BTC cycle 만 — 다른 wave 는 per-candle 미구현). */
  waveSnapshot?: {
    alignment?:
      | "perfect_up"
      | "partial_up"
      | "mixed"
      | "opposing"
      | "perfect_down";
    mult?: number;
    btcCycleRegime?: "bull" | "bear" | "neutral";
    trendDirection?: "BULLISH" | "BEARISH" | "SIDEWAYS";
    trendAdx?: number;
  };
}

/**
 * Composite 백테스트 실행.
 *
 * 흐름:
 *   1. Bybit 캔들 fetch (data-loader.ts 재사용)
 *   2. 각 symbol 마다 composite signal extraction
 *   3. 전체 trades 로 metrics 계산
 *   4. Layer 통계 (어느 layer 가 가장 많이 거름)
 *
 * Production 차단: Composite 는 backtest 전용 — live signal scanner 와 분리.
 */
export async function runCompositeBacktest(
  args: RunCompositeBacktestArgs,
): Promise<CompositeBacktestResult> {
  const start = Date.now();
  const {
    symbols,
    tf,
    startDate,
    endDate,
    outcomeWindowCandles = 42,
    cooldownCandles = 5,
    minWarmupCandles = 60,
    config,
    macroSnapshot,
    waveSnapshot,
  } = args;

  console.log(
    `[CompositeBacktest] ${symbols.length} symbols / ${tf} / ` +
      `${startDate.toISOString().slice(0, 10)} ~ ${endDate.toISOString().slice(0, 10)}`,
  );

  // 1. Fetch historical candles
  const symbolCandles = new Map<string, any[]>();
  for (const symbol of symbols) {
    try {
      const candles = await fetchHistoricalKlines({
        symbol,
        tf,
        startMs: startDate.getTime(),
        endMs: endDate.getTime(),
      });
      symbolCandles.set(symbol, candles);
    } catch (err) {
      console.warn(`[CompositeBacktest] ${symbol} fetch failed:`, err);
    }
  }

  // 2. Extract composite signals
  const { allTrades, perSymbolEvaluations } = extractCompositeAllSignals(
    symbolCandles,
    tf,
    { config, macroSnapshot, waveSnapshot },
    outcomeWindowCandles,
    cooldownCandles,
    minWarmupCandles,
  );

  // 3. Metrics
  const overall = computeMetrics(allTrades);
  const bySymbol = computeMetricsBySymbol(allTrades);

  // 4. Layer stats — 모든 평가를 합쳐서
  const allEvaluations: CompositeEvaluation[] = [];
  for (const evals of perSymbolEvaluations.values()) {
    allEvaluations.push(...evals);
  }
  const layerStats = computeLayerStats(allEvaluations);

  const durationMs = Date.now() - start;

  console.log(
    `[CompositeBacktest] complete: ${allTrades.length} trades / ` +
      `winRate ${(overall.winRate * 100).toFixed(1)}% / PF ${overall.profitFactor.toFixed(2)}`,
  );
  console.log(
    `[CompositeBacktest] layer pass: signal ${(layerStats.signalPassRate * 100).toFixed(1)}% / ` +
      `macro ${(layerStats.macroPassRate * 100).toFixed(1)}% / ` +
      `wave ${(layerStats.wavePassRate * 100).toFixed(1)}% / ` +
      `all ${(layerStats.allPassRate * 100).toFixed(1)}%`,
  );

  return {
    config,
    overall,
    bySymbol,
    trades: allTrades,
    runAt: new Date().toISOString(),
    durationMs,
    layerStats,
  };
}
