/**
 * Trend Analysis orchestrator (v2.0 명세서 §4 + §7 + §8).
 *
 * 4 TF 동시 분석 → per-TF deep trend (4-tier confirmation) →
 * Wave Alignment (5-state) → BBDX multiplier.
 *
 * 캐시: in-memory 5-min TTL per (symbol, tfs). scanner hot path 가
 * 매번 호출해도 외부 API 폭주 안 하도록.
 *
 * 외부 호출 (fetchKlines) 실패는 graceful — SIDEWAYS fallback 으로 떨어져
 * 전체 result 가 깨지지 않음 (헌장 규칙: modifier 단독 실패가 BBDX 깨면 X).
 */
import { type DeepTimeframeTrend } from "./multi-tf";
import { type WaveAlignment } from "./wave-alignment";
export interface TrendAnalysisResult {
    symbol: string;
    /** Per-TF deep analysis. Key = tf string. */
    perTf: Record<string, DeepTimeframeTrend>;
    alignment: WaveAlignment;
    /** Multiplier for BBDX final_confidence chain (헌장 규칙 3). */
    waveMult: number;
    /** Aggregate confidence — average of perTf confidenceScore (0~100). */
    overallConfidence: number;
    computedAt: number;
}
/**
 * 단일 심볼의 멀티-TF Trend 분석. 5-min 캐시.
 *
 * @param symbol 예: "BTCUSDT"
 * @param tfs 분석할 TF 목록 (default 4개). "15m" 은 Bybit Spot 호환을 위해
 *   현재 1h 로 fallback (v6.5 후 perp 도입 시 정규 매핑 추가).
 */
export declare function analyzeTrend(symbol: string, tfs?: string[]): Promise<TrendAnalysisResult>;
/** 테스트 / 디버깅용 — 캐시 비우기. */
export declare function clearTrendAnalysisCache(): void;
