/**
 * Wave Tracker — Sentiment & Matrix entry point
 *
 * 4개 외부 API 병렬 호출 → Composite Sentiment + Wave Matrix.
 * 명세서 WAVE_SENTIMENT_MATRIX.md §9.2 계산 순서 그대로.
 */
import type { SentimentSnapshot, WaveMatrixState } from "./types";
export interface CombinedSentiment {
    sentiment: SentimentSnapshot;
    matrix: WaveMatrixState;
}
/**
 * Combined endpoint — 4개 API 병렬 + composite + matrix.
 *
 * @param symbol Bybit perpetual symbol (default BTCUSDT)
 */
export declare function computeWaveTrackerData(symbol?: string): Promise<CombinedSentiment>;
export type { SentimentSnapshot, WaveMatrixState } from "./types";
export type { MacroStance, MacroStanceResult } from "./macro-stance";
