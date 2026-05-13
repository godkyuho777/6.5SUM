/**
 * EMA + ADX 정배열 추세 — 시그널 발행 로직.
 *
 * LONG / SHORT 양방향. lookahead-free (현 캔들 이전 데이터만 사용).
 * 기존 backtest strategies/trend.ts 의 룰을 기반으로 SHORT mirror + 가중치
 * 합성으로 final_confidence 산출.
 */
import type { Candle, TimeframeValue } from "../../shared/types";
export type EmaAdxSide = "LONG" | "SHORT" | "NEUTRAL";
export interface EmaAdxBreakdown {
    /** 0~1 정배열 강도 (1 = 완전 정배열) */
    emaStack: number;
    /** 0~1 ADX 정규화 (20→0, 50+→1) */
    adx: number;
    /** 0~1 ±DI 차이 정규화 */
    diDiff: number;
    /** 0~1 SMA slope 정규화 */
    smaSlope: number;
    /** 0~1 HH/HL 구조 (boolean → 1/0) */
    structure: number;
}
export interface EmaAdxSignal {
    symbol: string;
    tf: TimeframeValue;
    side: EmaAdxSide;
    triggered: boolean;
    finalConfidence: number;
    threshold: number;
    breakdown: EmaAdxBreakdown;
    reasons: string[];
    prices: {
        price: number;
        ema9: number;
        ema21: number;
        ema50: number;
        sma50: number;
        adx: number;
        plusDi: number;
        minusDi: number;
        /** target1, target2, stop (LONG/SHORT 적용된 값) */
        target1: number;
        target2: number;
        stopLoss: number;
        target1Pct: number;
        target2Pct: number;
        stopPct: number;
    };
    computedAt: number;
}
/**
 * 단일 심볼 평가 — LONG 과 SHORT 둘 다 평가 후 더 강한 쪽 채택.
 * 둘 다 미발생 시 강도 큰 쪽을 NEUTRAL 로 반환.
 */
export declare function evaluateEmaAdxSignal(symbol: string, tf: TimeframeValue, candlesOverride?: Candle[]): Promise<EmaAdxSignal>;
/**
 * 다중 심볼 스캔 — 시그널 트래커 페이지의 코인 리스트 표시 용.
 */
export declare function scanEmaAdxSignals(symbols: string[], tf: TimeframeValue): Promise<EmaAdxSignal[]>;
