/**
 * BBDX v6.6 Bidirectional Evaluator (BBDX_v66_PERP §2.4).
 *
 * LONG/SHORT 둘 다 평가 → 충돌 처리 → 최종 결정:
 *   - 둘 다 발생 + 점수 차이 < 10 → 양쪽 차단 (혼란 상황, both_triggered=true)
 *   - 차이 ≥ 10 → 더 강한 시그널만
 *
 * 본 evaluator 는 라이브 시그널 + 백테스트 양쪽에서 사용 가능.
 *
 * 헌장 규칙 1/2/3 모두 통과:
 *   - R1: v6.5 BBDX 차원 안에서 작동 (decideEntry/decideShortEntry 그대로 사용)
 *   - R2: weights/threshold 모두 calibration (외부 manifest fallback)
 *   - R3: SHORT 도 modifier 형태 — 단독 시그널 X
 */
import type { Candle, TechnicalIndicators } from "../../shared/types";
import { type V66LongResult } from "./long-entry";
import { type V66ShortResult } from "./short-entry";
export interface V66EvaluateInput {
    symbol: string;
    tf: string;
    candles: Candle[];
    windowCandles: Candle[];
    indicators: TechnicalIndicators;
}
export interface V66EvaluateOutput {
    long: V66LongResult | null;
    short: V66ShortResult | null;
    meta: {
        version: "v6.6";
        bothTriggered: boolean;
        conflictResolution?: "long_stronger" | "short_stronger" | "both_blocked" | "none";
        note?: string;
    };
}
/**
 * evaluatePositionSignalsV66 — LONG/SHORT 동시 평가 + 충돌 처리.
 *
 * SHORT 평가는 `ENABLE_SHORT_SIGNALS` flag 가 있어야 활성. 미설정 시 LONG only.
 */
export declare function evaluatePositionSignalsV66(input: V66EvaluateInput): Promise<V66EvaluateOutput>;
