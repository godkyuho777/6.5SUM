import type { BBStructure, Candle, CandlePatternMatch, EmaPosition, EntryDecision, ExitDecision, PressureLabel, TechnicalIndicators, VwapPosition, VwapSignal } from "@shared/types";
/**
 * RSI (Relative Strength Index) 계산
 * @param closes - 종가 배열
 * @param period - 기간 (기본 14)
 */
export declare function calculateRSI(closes: number[], period?: number): number;
/**
 * 볼린저 밴드 계산
 * @param closes - 종가 배열
 * @param period - 기간 (기본 20)
 * @param stdDev - 표준편차 배수 (기본 2)
 */
export declare function calculateBollingerBands(closes: number[], period?: number, stdDev?: number): {
    upper: number;
    middle: number;
    lower: number;
};
/**
 * ADX (Average Directional Index) 계산
 * +DI, -DI 포함
 * @param candles - 캔들 데이터 배열
 * @param period - 기간 (기본 14)
 */
export declare function calculateADX(candles: Candle[], period?: number): {
    adx: number;
    plusDi: number;
    minusDi: number;
};
/**
 * 모든 기술 지표를 한번에 계산
 */
export declare function calculateAllIndicators(candles: Candle[]): TechnicalIndicators;
/**
 * 매수 진입 시그널 판단
 * 조건: RSI 30~35, 가격이 BB 하단선 근처, ADX 30 이하
 */
export declare function isEntrySignal(price: number, indicators: TechnicalIndicators, config?: {
    rsiLow: number;
    rsiHigh: number;
    adxThreshold: number;
    bbTolerance: number;
}): boolean;
/**
 * 목표가 도달(청산) 시그널 판단
 * 조건: BB 기준선 도달 OR RSI 70+ OR ADX 30+ OR +DI 30+
 */
export declare function isExitSignal(price: number, indicators: TechnicalIndicators, config?: {
    targetRsi: number;
    targetAdx: number;
    targetPlusDi: number;
}): boolean;
/**
 * 시그널 강도 계산 (0-100)
 * 여러 조건이 동시에 충족될수록 높은 점수
 */
/**
 * RSI 시계열 계산 (차트용)
 * 각 캔들 시점의 RSI 값을 배열로 반환
 */
export declare function calculateRSISeries(closes: number[], period?: number): number[];
/**
 * ADX 시계열 계산 (차트용)
 * 각 캔들 시점의 ADX, +DI, -DI 값을 배열로 반환
 */
export declare function calculateADXSeries(candles: Candle[], period?: number): {
    adx: number;
    plusDi: number;
    minusDi: number;
}[];
export declare function calculateSignalStrength(price: number, indicators: TechnicalIndicators): number;
/**
 * 피보나치 되돌림 레벨 계산
 * @param high - 기간 내 최고가
 * @param low - 기간 내 최저가
 * @param trend - 'up' (상승 후 되돌림) | 'down' (하락 후 되돌림)
 */
export declare function calculateFibonacciLevels(high: number, low: number, trend?: 'up' | 'down'): {
    level: number;
    price: number;
    isGoldenZone: boolean;
}[];
/**
 * 황금비 존(±0.5% 오차범위) 진입 여부 확인
 */
export declare function isInFibZone(price: number, fibPrice: number, tolerance?: number): boolean;
/**
 * 단순 추세 빗각 계산 (간이 구현)
 * 최근 저점들을 연결하거나 고점들을 연결
 */
export declare function calculateTrendlines(candles: Candle[]): ({
    type: "support";
    points: {
        time: number;
        price: number;
    }[];
    isActive: boolean;
} | {
    type: "resistance";
    points: {
        time: number;
        price: number;
    }[];
    isActive: boolean;
})[];
/**
 * Bollinger Bands 시계열 (각 캔들 시점의 BB)
 * 패턴 인식 및 BB 구조 감지에 사용.
 */
export declare function calculateBollingerBandsSeries(closes: number[], period?: number, stdDev?: number): {
    upper: number;
    middle: number;
    lower: number;
}[];
/**
 * 최근 5개 캔들 윈도우 내에서 감지된 모든 패턴을 dedup해서 반환.
 * candlesAgo 0~4 범위의 패턴만 포함.
 */
export declare function detectAllCandlePatterns(candles: Candle[]): CandlePatternMatch[];
/**
 * BB 구조 패턴 감지 (4가지 중 우선순위로 1개 반환).
 * 우선순위: lowerBounce > squeezeBreakout > middleSupport > upperRiding
 */
export declare function detectBBStructure(candles: Candle[], bbSeries: {
    upper: number;
    middle: number;
    lower: number;
}[]): BBStructure | null;
export declare function pressureLabel(plusDi: number, minusDi: number): PressureLabel;
export declare function reversalProbability(adx: number): number;
export declare function volumeRatio(candles: Candle[]): number;
export declare function volumeConfirmationFromRatio(ratio: number): number;
export declare function isFallingKnife(plusDi: number, minusDi: number, adx: number): boolean;
/**
 * 3가지 진입 경로 중 가장 우선순위 높은 1개를 반환.
 * 우선순위: BB > PTN > NUM (스펙: BB가 가장 명확한 신호).
 * Falling Knife일 때는 호출 측에서 미리 차단해야 함.
 */
export declare function decideEntry(candles: Candle[], ind: TechnicalIndicators, patterns: CandlePatternMatch[], bbStructure: BBStructure | null, _volRatio: number): EntryDecision | null;
export declare function decideExit(price: number, ind: TechnicalIndicators, bearishPatterns: CandlePatternMatch[]): ExitDecision | null;
/**
 * BBDX-PATTERN v6.1 시그널 강도. 0~100.
 *
 * components:
 *   - RSI_score        (0–25)  RSI 25에 가까울수록 높음
 *   - BB_proximity     (0–25)  BB 하단에 가까울수록 높음
 *   - ADX_reversal     (0–20)  ADX 낮을수록 높음
 *   - reversal_prob    (0–15)  reversalProbability / 100 × 15
 *   - volume_confirm   (-5–15) 거래량 확인
 */
export declare function calculateSignalStrengthV2(price: number, ind: TechnicalIndicators, volumeConfirmation: number): number;
/**
 * Volume-weighted average price across the supplied candle range.
 * Uses typical price (H+L+C)/3 weighted by volume.
 */
export declare function calculateVWAP(candles: Candle[]): number;
/** Standard EMA. Returns the trailing EMA over `values` with `period`. */
export declare function calculateEMA(values: number[], period: number): number;
export declare function vwapPosition(price: number, vwap: number): VwapPosition;
export declare function emaPosition(price: number, ema: number): EmaPosition;
/**
 * Pullback = price has recently approached VWAP or EMA(9) within
 * PULLBACK_PROXIMITY without crossing the prevailing-trend reference line.
 * Looks at the last 5 candles. Returns false when the trend hasn't been
 * established (current position is "AT") or when no candle approached.
 */
export declare function detectPullback(candles: Candle[], vwap: number, ema9: number): boolean;
/**
 * Decide LONG / SHORT / null per spec §6.3.
 *
 * LONG: price ABOVE both VWAP and EMA(9) (EMA can be AT).
 * SHORT: price BELOW both VWAP and EMA(9) (EMA can be AT).
 * Mixed → null.
 */
export declare function decideVwapSignal(price: number, vwap: number, ema9: number, pullback: boolean, volRatio: number): VwapSignal | null;
