/**
 * Composite Backtest Runner — Phase A-2 (2026-05-11).
 *
 * 기존 runBacktest 와 별도 path. 3-Layer composite config 받아서
 * fetchHistoricalCandles → extractCompositeAllSignals → computeMetrics.
 */
import type { TimeframeValue } from "@shared/types";
import type { CompositeBacktestResult, CompositeStrategyConfig } from "./types";
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
        alignment?: "perfect_up" | "partial_up" | "mixed" | "opposing" | "perfect_down";
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
export declare function runCompositeBacktest(args: RunCompositeBacktestArgs): Promise<CompositeBacktestResult>;
