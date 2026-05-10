/**
 * Wave Tracker — Sentiment & Matrix entry point
 *
 * 4개 외부 API 병렬 호출 → Composite Sentiment + Wave Matrix + Source Health.
 * 명세서 WAVE_SENTIMENT_MATRIX.md §9.2 + WAVE_SENTIMENT_PHASE_C_D.md §2.1.
 */
import type { SentimentSnapshot, WaveMatrixState, SourceHealth } from "./types";
export interface CombinedSentiment {
    sentiment: SentimentSnapshot;
    matrix: WaveMatrixState;
    /** v4.3 — 4개 외부 API 의 데이터 무결성 메타. */
    sourceHealth: SourceHealth;
}
/**
 * Combined endpoint — 4개 API 병렬 + composite + matrix + sourceHealth.
 *
 * @param symbol Bybit perpetual symbol (default BTCUSDT)
 */
export declare function computeWaveTrackerData(symbol?: string): Promise<CombinedSentiment>;
export type { SentimentSnapshot, WaveMatrixState, SourceHealth, SourceHealthEntry, SourceStatus, } from "./types";
export type { MacroStance, MacroStanceResult } from "./macro-stance";
