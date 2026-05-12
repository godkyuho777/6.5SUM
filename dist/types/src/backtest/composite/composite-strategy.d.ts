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
import type { BacktestTrade } from "../types";
import { evaluateComposite, computeLayerStats } from "./evaluator";
import { buildLayerSnapshot } from "./snapshot-builder";
import type { CompositeBacktestResult, CompositeEvaluation, CompositeStrategyConfig } from "./types";
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
        alignment?: "perfect_up" | "partial_up" | "mixed" | "opposing" | "perfect_down";
        mult?: number;
        btcCycleRegime?: "bull" | "bear" | "neutral";
        trendDirection?: "BULLISH" | "BEARISH" | "SIDEWAYS";
        trendAdx?: number;
    };
}
export declare function extractCompositeSignalsFromCandles(symbol: string, candles: Candle[], tf: string, ctx: ExtractContext, outcomeWindow?: number, cooldownCandles?: number, minWarmup?: number): {
    trades: BacktestTrade[];
    evaluations: CompositeEvaluation[];
};
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
export declare function extractCompositeAllSignals(symbolCandles: Map<string, Candle[]>, tf: string, ctx: ExtractContext, outcomeWindow?: number, cooldownCandles?: number, minWarmup?: number, onProgress?: (done: number, total: number, symbol: string) => void): CompositeExtractAllResult;
export { evaluateComposite, computeLayerStats, buildLayerSnapshot };
export type { CompositeBacktestResult };
