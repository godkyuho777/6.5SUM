/**
 * MACD Histogram Divergence Modifier — 명세서 §1.
 *
 * MACD(12, 26, 9) histogram 의 swing 과 가격 swing 비교로 다이버전스 탐지.
 * RSI 와 같은 차원 (1: momentum) 이지만 측정 각도가 다르다 (level vs
 * momentum-of-momentum). 헌장 규칙 1 예외 (allowsSameDimensionPair).
 *
 * 룩어헤드 안전: 모든 swing 탐지는 i 시점까지 데이터만 사용.
 */
import type { Candle } from "@shared/types";
import type { ModifierResult } from "./types";
export type MacdDivergenceType = "bullish" | "bearish" | "hidden_bullish" | "hidden_bearish" | "none";
export interface MacdDivergenceResult extends ModifierResult {
    type: MacdDivergenceType;
    /** 0 ~ 1. swing 거리/매그니튜드 기반. */
    strength: number;
    swings: {
        priceSwingHighIdxs: number[];
        priceSwingLowIdxs: number[];
        histAtSwings: number[];
    };
}
/**
 * Divergence 탐지.
 *
 * @param candles 시간순 정렬, 최소 30 캔들 권장.
 * @param lookback 최근 N 개 캔들에서 swing 검색 (기본 50).
 * @param minSwingDistance 두 swing 간 최소 거리 (기본 10).
 */
export declare function detectMacdDivergence(candles: Candle[], lookback?: number, minSwingDistance?: number): MacdDivergenceResult;
