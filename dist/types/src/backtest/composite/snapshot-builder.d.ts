/**
 * Snapshot Builder — Phase A-2 (2026-05-11).
 *
 * 시점 i 의 candles + indicators + (선택) macro/wave 컨텍스트로부터
 * LayerSnapshot 객체 구성.
 *
 * 헌장 R3 (단독 시그널 X): 본 builder 는 snapshot 만 만들고 evaluation X.
 * 진입 결정은 evaluator.ts 가 별도 호출.
 *
 * Lookahead-free 보장: candles.slice(0, i+1) 만 사용.
 */
import type { Candle, TechnicalIndicators } from "@shared/types";
import type { LayerSnapshot } from "./types";
interface BuildOptions {
    /** Macro 컨텍스트 — backtest 시작 시 한번 fetch 후 매 i 같은 값 사용. */
    macroSnapshot?: {
        regime?: "flooded" | "easy" | "neutral" | "tight" | "crisis";
        score?: number;
        mult?: number;
        koreaModifier?: number;
    };
    /** Wave 컨텍스트 — symbol 별 1회 fetch 후 cache. */
    waveSnapshot?: {
        alignment?: "perfect_up" | "partial_up" | "mixed" | "opposing" | "perfect_down";
        mult?: number;
        btcCycleRegime?: "bull" | "bear" | "neutral";
        trendDirection?: "BULLISH" | "BEARISH" | "SIDEWAYS";
        trendAdx?: number;
    };
}
/**
 * 시점 i 에서 LayerSnapshot 구성.
 *
 * @param candles       전체 캔들 (lookahead-free: slice 안에서만 사용)
 * @param idx           현재 인덱스
 * @param indicators    calculateAllIndicators(candles.slice(0, idx+1)) 결과
 * @param opts          macro/wave 컨텍스트 (선택)
 */
export declare function buildLayerSnapshot(candles: Candle[], idx: number, indicators: TechnicalIndicators, windowCandles: Candle[], opts?: BuildOptions): LayerSnapshot;
export {};
