/**
 * BBDX v6.6 LONG Entry — v6.5 코어를 wrap + calibrated weights/threshold 적용.
 *
 * v6.5 코드 절대 수정 X. `decideEntry` + 보조 modifier 결과를 그대로 받아
 * (1) 5 카테고리 점수 추출 → (2) calibrated weights 와 곱해 base_strength →
 * (3) calibrated threshold 와 비교.
 *
 * 헌장 규칙 3 (단독 시그널 X): v6.5 의 BBDX 코어 통과한 시그널에 대해서만
 * 가중치 + 임계 calibration 을 적용. BBDX 진입 룰은 변경 X.
 */
import type { Candle, EntryDecision, TechnicalIndicators } from "../../shared/types";
export interface V66LongResult {
    side: "long";
    triggered: boolean;
    path?: "NUM" | "PTN" | "BB";
    decision?: EntryDecision;
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
    reasons: string[];
    meta: Record<string, unknown>;
}
export interface V66LongInput {
    symbol: string;
    tf: string;
    candles: Candle[];
    windowCandles: Candle[];
    indicators: TechnicalIndicators;
    /** 옵션 보조 modifier 곱셈 (이미 적용된 multiplier 곱) — default 1.0 */
    modifiersMult?: number;
}
export declare function evaluateLongV66(input: V66LongInput): Promise<V66LongResult>;
