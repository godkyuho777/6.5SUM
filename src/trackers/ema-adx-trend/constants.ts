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

export const EMA_PERIODS = [9, 21, 50] as const;
export const SMA_PERIOD = 50;
export const ADX_MIN = 20;
export const ADX_STRONG = 30;
export const DI_DIFF_MIN = 0; // +DI > -DI 만 요구
export const DI_DIFF_STRONG = 10; // strong signal
export const SMA_SLOPE_MIN = 0; // SMA 상승
export const HHHL_LOOKBACK = 10;

/** Final confidence 산출 가중치 (총합 1.0). */
export const CONFIDENCE_WEIGHTS = {
  emaStack: 0.30, // 정배열 강도
  adx: 0.25,      // ADX 강도
  diDiff: 0.20,   // +DI - -DI
  smaSlope: 0.15, // SMA 상승 기울기
  structure: 0.10, // HH/HL 구조
} as const;

/** 진입 임계 (final_confidence ≥ threshold 면 발행). */
export const ENTRY_THRESHOLD = 55;

export const META = {
  id: "ema-adx-trend" as const,
  labelKo: "EMA + ADX 정배열",
  labelEn: "EMA Stack & ADX Trend",
  subtitle: "EMA 9/21/50 정배열 + ADX≥20 + +DI 우위 + SMA 상승 + HH/HL",
  description:
    "Trend-following standalone 전략 — 3 EMA 정배열, ADX 추세 강도, ±DI 방향성, " +
    "SMA(50) 장기 컨텍스트, HH/HL 가격 구조의 5개 보조지표 합성. LONG/SHORT 양방향.",
};
