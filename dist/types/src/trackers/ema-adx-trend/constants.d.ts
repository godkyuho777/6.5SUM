/**
 * EMA + ADX 정배열 추세 트래커 — 임계값 / 가중치 / 라벨 상수.
 *
 * 명세: 본 트래커는 Wave Tracker 의 Trend Analysis 와 구분되는 **standalone
 * Signal Scanner** 전략. 라이브 시그널을 직접 발행한다. 헌장 R3 (modifier-only)
 * 의 *해석은 보조 차원만 적용*이며, 본 전략은 BBDX·Fibonacci·VWAP 와 동일한
 * primary signal layer 이므로 standalone 허용.
 *
 * 사용 보조지표 (heat order):
 *   1) EMA 9 / 21 / 50  — 정배열 검출 (Ribbon)
 *   2) ADX(14) + ±DI    — 추세 강도 + 방향
 *   3) SMA(50) slope    — 장기 컨텍스트
 *   4) HH/HL fractal    — 가격 구조 (Williams 5-bar 단순화)
 */
export declare const EMA_PERIODS: readonly [9, 21, 50];
export declare const SMA_PERIOD = 50;
export declare const ADX_MIN = 20;
export declare const ADX_STRONG = 30;
export declare const DI_DIFF_MIN = 0;
export declare const DI_DIFF_STRONG = 10;
export declare const SMA_SLOPE_MIN = 0;
export declare const HHHL_LOOKBACK = 10;
/** Final confidence 산출 가중치 (총합 1.0). */
export declare const CONFIDENCE_WEIGHTS: {
    readonly emaStack: 0.3;
    readonly adx: 0.25;
    readonly diDiff: 0.2;
    readonly smaSlope: 0.15;
    readonly structure: 0.1;
};
/** 진입 임계 (final_confidence ≥ threshold 면 발행). */
export declare const ENTRY_THRESHOLD = 55;
export declare const META: {
    id: "ema-adx-trend";
    labelKo: string;
    labelEn: string;
    subtitle: string;
    description: string;
};
