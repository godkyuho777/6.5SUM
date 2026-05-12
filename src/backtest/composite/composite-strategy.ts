/**
 * Composite Strategy — 3-Layer (Signal + Macro + Wave) 조합 백테스트.
 *
 * Phase A-2 (2026-05-11). 사용자 요구 #2 의 구현체.
 *
 * 기존 single-strategy (`bbdx`, `trend-follow` 등) 와 *별도 path* — 호환성 보존.
 * `runCompositeBacktest()` 가 별도 entrypoint.
 *
 * 헌장 R3 (단독 시그널 X): Layer 조합 평가 자체가 BBDX core 보조 X.
 * 각 layer 의 condition 이 "BBDX 의 한 차원" 을 명시적으로 측정함.
 *   - Signal Layer = BBDX core (RSI/BB/ADX/Pattern)
 *   - Macro Layer = 6번 차원 (Macro Liquidity)
 *   - Wave Layer = 추세 + 사이클 (3번 + 외)
 * 차원 커버 매트릭스로 R1 (차원 중복 X) 도 자동 검증.
 */

import type { Candle } from "@shared/types";
import { calculateAllIndicators, calculateATR } from "../../indicators";
import type { BacktestTrade, ExitReason, PartialExit } from "../types";
import { evaluateComposite, computeLayerStats } from "./evaluator";
import { buildLayerSnapshot } from "./snapshot-builder";
import type {
  CompositeBacktestResult,
  CompositeEvaluation,
  CompositeStrategyConfig,
  LayerSnapshot,
} from "./types";

// ─────────────────────────────────────────────────────────
// Outcome 측정 (signal-extractor.ts 의 측정 로직 미러)
// ─────────────────────────────────────────────────────────

interface OutcomeResult {
  exitPrice: number;
  exitTs: number;
  exitReason: ExitReason;
  returnPct: number;
  maxFavorable: number;
  maxAdverse: number;
  win: boolean;
  holdingCandles: number;
  partialExits: PartialExit[];
}

function measureOutcome(
  candles: Candle[],
  signalIdx: number,
  entryPrice: number,
  target1: number,
  target2: number,
  stopLoss: number,
  window: number,
): OutcomeResult {
  const endIdx = Math.min(signalIdx + window, candles.length - 1);
  let maxHigh = entryPrice;
  let minLow = entryPrice;
  const partialExits: PartialExit[] = [];
  let tier1Hit = false;
  let remaining = 1.0;
  let weightedExitPrice = 0;
  let weightedReturnPct = 0;
  let lastCandleIdx = endIdx;

  // P0-② BE 이동
  let effectiveStop = stopLoss;

  const calcReturn = (exit: number) =>
    ((exit - entryPrice) / entryPrice) * 100;

  for (let i = signalIdx + 1; i <= endIdx; i++) {
    const c = candles[i];
    if (c.high > maxHigh) maxHigh = c.high;
    if (c.low < minLow) minLow = c.low;

    // Stop 우선
    if (c.low <= effectiveStop) {
      const r = calcReturn(effectiveStop);
      weightedExitPrice += effectiveStop * remaining;
      weightedReturnPct += r * remaining;
      partialExits.push({
        tier: tier1Hit ? 2 : 1,
        candleOffset: i - signalIdx,
        price: effectiveStop,
        ratio: remaining,
        returnPct: r,
      });
      lastCandleIdx = i;
      return {
        exitPrice: weightedExitPrice,
        exitTs: c.openTime,
        exitReason: tier1Hit ? "tier1_then_stop" : "stop_loss",
        returnPct: weightedReturnPct,
        maxFavorable: ((maxHigh - entryPrice) / entryPrice) * 100,
        maxAdverse: ((entryPrice - minLow) / entryPrice) * 100,
        win: weightedReturnPct > 0,
        holdingCandles: lastCandleIdx - signalIdx,
        partialExits,
      };
    }

    // Tier 2 도달
    if (c.high >= target2) {
      const r = calcReturn(target2);
      weightedExitPrice += target2 * remaining;
      weightedReturnPct += r * remaining;
      partialExits.push({
        tier: 2,
        candleOffset: i - signalIdx,
        price: target2,
        ratio: remaining,
        returnPct: r,
      });
      lastCandleIdx = i;
      return {
        exitPrice: weightedExitPrice,
        exitTs: c.openTime,
        exitReason: tier1Hit ? "tier2_full" : "target_hit",
        returnPct: weightedReturnPct,
        maxFavorable: ((maxHigh - entryPrice) / entryPrice) * 100,
        maxAdverse: ((entryPrice - minLow) / entryPrice) * 100,
        win: weightedReturnPct > 0,
        holdingCandles: lastCandleIdx - signalIdx,
        partialExits,
      };
    }

    // Tier 1 도달
    if (!tier1Hit && c.high >= target1) {
      tier1Hit = true;
      const tier1Ratio = 0.5;
      const r = calcReturn(target1);
      weightedExitPrice += target1 * tier1Ratio;
      weightedReturnPct += r * tier1Ratio;
      remaining -= tier1Ratio;
      partialExits.push({
        tier: 1,
        candleOffset: i - signalIdx,
        price: target1,
        ratio: tier1Ratio,
        returnPct: r,
      });
      // BE 이동
      effectiveStop = Math.max(effectiveStop, entryPrice);
    }
  }

  // 윈도우 만료
  const last = candles[endIdx];
  const r = calcReturn(last.close);
  weightedExitPrice += last.close * remaining;
  weightedReturnPct += r * remaining;
  partialExits.push({
    tier: tier1Hit ? 2 : 1,
    candleOffset: endIdx - signalIdx,
    price: last.close,
    ratio: remaining,
    returnPct: r,
  });

  return {
    exitPrice: weightedExitPrice,
    exitTs: last.openTime,
    exitReason: tier1Hit ? "tier1_then_window" : "window_expired",
    returnPct: weightedReturnPct,
    maxFavorable: ((maxHigh - entryPrice) / entryPrice) * 100,
    maxAdverse: ((entryPrice - minLow) / entryPrice) * 100,
    win: weightedReturnPct > 0,
    holdingCandles: endIdx - signalIdx,
    partialExits,
  };
}

// ─────────────────────────────────────────────────────────
// Composite signal 추출
// ─────────────────────────────────────────────────────────

interface ExtractContext {
  config: CompositeStrategyConfig;
  /** Macro snapshot — backtest 시작 시 freeze. */
  macroSnapshot?: {
    regime?: "flooded" | "easy" | "neutral" | "tight" | "crisis";
    score?: number;
    mult?: number;
    koreaModifier?: number;
  };
  /** Wave snapshot — backtest 시작 시 freeze. */
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

export function extractCompositeSignalsFromCandles(
  symbol: string,
  candles: Candle[],
  tf: string,
  ctx: ExtractContext,
  outcomeWindow: number = 42,
  cooldownCandles: number = 5,
  minWarmup: number = 60,
): { trades: BacktestTrade[]; evaluations: CompositeEvaluation[] } {
  const trades: BacktestTrade[] = [];
  const evaluations: CompositeEvaluation[] = [];

  const maxSignalIdx = candles.length - outcomeWindow - 1;
  if (maxSignalIdx < minWarmup) {
    return { trades, evaluations };
  }

  let lastSignalIdx = -Infinity;

  for (let i = minWarmup; i <= maxSignalIdx; i++) {
    if (i - lastSignalIdx < cooldownCandles) continue;

    const windowCandles = candles.slice(Math.max(0, i - 199), i + 1);
    const indicators = calculateAllIndicators(windowCandles);
    const price = candles[i].close;

    // Snapshot 구성
    const snapshot: LayerSnapshot = buildLayerSnapshot(
      candles,
      i,
      indicators,
      windowCandles,
      {
        macroSnapshot: ctx.macroSnapshot,
        waveSnapshot: ctx.waveSnapshot,
      },
    );

    // Composite 평가
    const evaluation = evaluateComposite(ctx.config, snapshot);
    evaluations.push(evaluation);

    if (!evaluation.entry) continue;

    // 진입 결정 — R:R 계산 (ATR 기반)
    const atr = calculateATR(windowCandles);
    const rr = ctx.config.riskReward ?? {};
    const tier1Mult = rr.tier1AtrMultiplier ?? 1.5;
    const tier2Mult = rr.tier2AtrMultiplier ?? 3.5;
    const stopMult = rr.stopAtrMultiplier ?? 1.0;

    const stopLoss = atr > 0
      ? Math.max(price - stopMult * atr, indicators.bbLower * 0.92)
      : Math.max(indicators.bbLower * 0.97, price * 0.98);
    const target1 = atr > 0
      ? price + tier1Mult * atr
      : indicators.bbMiddle;
    const target2 = atr > 0
      ? price + tier2Mult * atr
      : Math.min(indicators.bbUpper, price * 1.05);

    // Outcome 측정
    const outcome = measureOutcome(
      candles,
      i,
      price,
      target1,
      target2,
      stopLoss,
      outcomeWindow,
    );

    const trade: BacktestTrade = {
      signalTs: candles[i].openTime,
      symbol,
      tf: tf as any,
      strategy: "bbdx", // composite 은 별도 식별자가 없어서 일단 bbdx 로 (UI에서 분기)
      side: "long",
      entryReasons: evaluation.reasons,
      strategyMeta: {
        compositeLayers: evaluation.layers.map((l) => ({
          layer: l.layer,
          passed: l.passed,
          conditionCount: l.conditionResults.length,
          passedCount: l.conditionResults.filter((r) => r.passed).length,
        })),
      } as Record<string, unknown>,
      entryPrice: price,
      target: target1,
      target2,
      stopLoss,
      signalStrength: snapshot.signalStrength,
      rsi: indicators.rsi,
      bbLower: indicators.bbLower,
      bbMiddle: indicators.bbMiddle,
      bbUpper: indicators.bbUpper,
      adx: indicators.adx,
      plusDi: indicators.plusDi,
      minusDi: indicators.minusDi,
      patternConfluenceScore: snapshot.patternConfluence,
      ...outcome,
    };

    trades.push(trade);
    lastSignalIdx = i;
  }

  return { trades, evaluations };
}

/**
 * 여러 심볼 composite 백테스트 추출. snapshot 컨텍스트는 *전체 백테스트
 * 동안 동일* (현실: macro/wave 가 매 캔들마다 다르지만, 백테스트 시점에선
 * static snapshot 사용 — 정확한 backfill 은 후속 v3 작업).
 *
 * @returns trades + 각 심볼별 layer stats.
 */
export interface CompositeExtractAllResult {
  allTrades: BacktestTrade[];
  perSymbolEvaluations: Map<string, CompositeEvaluation[]>;
}

export function extractCompositeAllSignals(
  symbolCandles: Map<string, Candle[]>,
  tf: string,
  ctx: ExtractContext,
  outcomeWindow: number = 42,
  cooldownCandles: number = 5,
  minWarmup: number = 60,
  onProgress?: (done: number, total: number, symbol: string) => void,
): CompositeExtractAllResult {
  const allTrades: BacktestTrade[] = [];
  const perSymbolEvaluations = new Map<string, CompositeEvaluation[]>();
  const total = symbolCandles.size;
  let done = 0;

  for (const [symbol, candles] of symbolCandles) {
    const { trades, evaluations } = extractCompositeSignalsFromCandles(
      symbol,
      candles,
      tf,
      ctx,
      outcomeWindow,
      cooldownCandles,
      minWarmup,
    );
    allTrades.push(...trades);
    perSymbolEvaluations.set(symbol, evaluations);
    done++;
    if (onProgress) onProgress(done, total, symbol);
  }

  allTrades.sort((a, b) => a.signalTs - b.signalTs);
  return { allTrades, perSymbolEvaluations };
}

// Re-export
export { evaluateComposite, computeLayerStats, buildLayerSnapshot };
export type { CompositeBacktestResult };
