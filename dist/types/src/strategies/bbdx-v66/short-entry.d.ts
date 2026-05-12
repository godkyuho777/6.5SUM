/**
 * BBDX v6.6 SHORT Entry — v6.5 SHORT 코어를 wrap + calibrated weights/threshold.
 *
 * 명세서 BBDX_v66_PERP §2.3 의 evaluate_short_v66 의사코드 구현.
 * v6.5 SHORT (`decideShortEntry`, `detectBBStructureShort`) 코드 절대 수정 X.
 *
 * 헌장 규칙 3 (단독 시그널 X): SHORT 도 BBDX 차원 안. multiplier 형태.
 */
import type { Candle, ShortEntryDecision, TechnicalIndicators } from "../../shared/types";
export interface V66ShortResult {
    side: "short";
    triggered: boolean;
    path?: "NUM" | "PTN" | "BB";
    decision?: ShortEntryDecision;
    finalScore: number;
    thresholdUsed: number;
    baseStrength: number;
    weightsUsed: {
        momentum: number;
        position: number;
        trend: number;
        volume: number;
        action: number;
    };
    weightsSource: "self_backtest" | "external" | "default";
    thresholdSource: "self_backtest" | "external" | "default";
    shortStop: number | null;
    reasons: string[];
    meta: Record<string, unknown>;
}
export interface V66ShortInput {
    symbol: string;
    tf: string;
    candles: Candle[];
    windowCandles: Candle[];
    indicators: TechnicalIndicators;
    modifiersMult?: number;
}
/**
 * SHORT STOP LOSS (BBDX_v66_PERP §5.1) — 누락 영역 1 해결.
 *
 *   SHORT STOP = min(bbUpper × 1.03, entry × 1.02)
 *
 * 본 함수는 단순 indicator-based stop 만 제공. ATR / Fib 등 보강은 caller 가
 * 추가 (예: backtest/strategies/bbdx-short.ts).
 */
export declare function computeShortStopIndicator(entryPrice: number, indicators: TechnicalIndicators): number;
export declare function evaluateShortV66(input: V66ShortInput): Promise<V66ShortResult>;
