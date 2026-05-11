import type { BBStructure, BBStructureShort, Candle, CandlePatternMatch, EmaPosition, EntryDecision, ExitDecision, PressureLabel, PullbackQuality, ShortEntryDecision, TechnicalIndicators, VwapBands, VwapPosition, VwapSignal } from "@shared/types";
import type { VolumeProfile } from "./volume-profile";
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
 * ATR (Average True Range) — Wilder smoothing.
 *
 * P0-① fix (2026-05-11) — Backtest 진단 결과 stop placement 너무 좁아 trade
 * 80.8% 가 stop_loss 로 끝남. ATR 기반 변동성-적응 stop 으로 회복 시도.
 *
 * @param candles 캔들 배열 (length >= period+1 필요)
 * @param period  ATR 기간 (기본 14)
 * @returns ATR 값 (price 단위, 항상 양수)
 */
export declare function calculateATR(candles: Candle[], period?: number): number;
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
 * 최근 5개 캔들 윈도우 내에서 감지된 모든 패턴을 반환.
 * candlesAgo 0~4 범위의 패턴만 포함.
 *
 * Per Pattern Audit (Part III.1 §5.3 / §5.4) defects #3 and #4:
 *   - look-ahead safe: predicates only read candles[j ≤ currentIdx]
 *   - no priority dedup; aggregator uses max + bonus instead so
 *     multi-pattern confluence is preserved.
 *
 * Delegates to the modular implementation in `./patterns/`. Strength
 * values are now produced from `patternBase × volumeMultiplier ×
 * priorTrendMultiplier × 100`, replacing the previous intuited
 * `PATTERN_STRENGTH` table (still kept above as a legacy reference for
 * `detectAtIndex`, which is no longer used).
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
 * Rising Knife — `isFallingKnife` 의 SHORT 미러.
 *   +DI > -DI AND ADX > 25 → SHORT 진입 차단 (강한 상승 추세).
 *
 * 의미: 가격이 강한 상승 추세 중일 때 SHORT 진입은 *역추세* 위험.
 * 자본 보호 헌장에 따라 SHORT 평균회귀 path (upperRejection, middleResistance,
 * squeezeBreakdown) 진입을 차단. lowerRiding (추세 추종 SHORT) 만 예외 허용.
 */
export declare function isRisingKnife(plusDi: number, minusDi: number, adx: number): boolean;
/**
 * SHORT 진입 BB 구조 패턴. LONG `detectBBStructure` 의 4가지 미러:
 *   upperRejection    — 직전 고가 ≥ BB상단×1.02 + 반전 음봉 + 종가 < 직전 종가
 *                       (LONG 의 lowerBounce 미러)
 *   squeezeBreakdown  — BW 압축 후 음봉 + 종가 < 중간선
 *                       (LONG 의 squeezeBreakout 미러)
 *   middleResistance  — 5중 3 캔들이 중간선 ±1% 터치 + 종가 < 중간선
 *                       (LONG 의 middleSupport 미러)
 *   lowerRiding       — 연속 3 캔들이 BB 하단 ± 하위 20% + 모두 음봉 + 종가 < 중간선
 *                       (LONG 의 upperRiding 미러, 추세 추종 SHORT)
 *
 * 헌장 규칙 3 준수: 단독 시그널 X. BBDX SHORT path 의 *위치 + 거동 + 변동성*
 * 3차원 confluence 만 발견.
 */
export declare function detectBBStructureShort(candles: Candle[], bbSeries: {
    upper: number;
    middle: number;
    lower: number;
}[]): BBStructureShort | null;
/**
 * SHORT 진입 결정. LONG `decideEntry` 의 미러.
 *
 *   BB path  — `detectBBStructureShort` 결과 (4가지 SHORT 구조)
 *   PTN path — bearish 패턴 + 가격 ≥ BB상단×0.95 + ADX < 25
 *   NUM path — RSI 62~75 + 가격 ≥ BB상단×0.98 + ADX < 20
 *
 * **자본 보호 (P1-#3 audit S3, 2026-05-10)**:
 *   `isRisingKnife` (= +DI > -DI && ADX > 25) 환경에서 *추세 추종 SHORT*
 *   (lowerRiding) 외 모든 SHORT path 를 차단. LONG 의 isFallingKnife
 *   + upperRiding 예외와 미러.
 *
 * 헌장 규칙 3 준수: SHORT 도 BBDX 차원 안. 단독 시그널 X.
 * decideEntry 와 동일한 우선순위 (BB > PTN > NUM).
 */
export declare function decideShortEntry(candles: Candle[], ind: TechnicalIndicators, patterns: CandlePatternMatch[], bbStructureShort: BBStructureShort | null, _volRatio: number): ShortEntryDecision | null;
/** SHORT 진입 강도 (LONG 의 5-component 거울).
 *   - RSI score: 75 에 가까울수록 ↑ (과매수)
 *   - BB proximity: BB 상단에 가까울수록 ↑
 *   - ADX reversal: ADX 낮을수록 ↑ (평균회귀 SHORT 환경)
 *   - reversal prob: 동일
 *   - volume confirm: 동일 (음봉 거래량 ↑ 면 강한 신호)
 */
export declare function calculateShortSignalStrength(price: number, ind: TechnicalIndicators, volumeConfirmation: number): number;
/**
 * 3가지 진입 경로 중 가장 우선순위 높은 1개를 반환.
 * 우선순위: BB > PTN > NUM (스펙: BB가 가장 명확한 신호).
 * Falling Knife일 때는 호출 측에서 미리 차단해야 함.
 */
export declare function decideEntry(candles: Candle[], ind: TechnicalIndicators, patterns: CandlePatternMatch[], bbStructure: BBStructure | null, _volRatio: number): EntryDecision | null;
/**
 * v6.3 EXIT decision (Part II.1).
 *
 * Replaces the defective v6.1 4-of-4 rule. Per spec:
 *   - ADX ≥ 30 standalone trigger → DELETED
 *   - +DI ≥ 25 standalone trigger → DELETED
 *   - Reversal is now a 5-component weighted score (DI cross,
 *     ADX+−DI confirmation, bearish pattern, trendline break,
 *     MACD divergence).
 *   - BB middle recovery → 50% partial exit (Tier 1 of EXIT-A).
 *
 * Position-state-dependent categories (C protection, D time stop)
 * require an open position record and are exposed via
 * decideExitForPosition() in src/exits/index.ts. The scanner uses
 * this thin wrapper which only runs EXIT-A and EXIT-B.
 */
export declare function decideExit(price: number, ind: TechnicalIndicators, bearishPatterns: CandlePatternMatch[], 
/**
 * P2 (2026-05-10) — EXIT-B B4/B5 wiring 옵션.
 *
 * Audit `01-BBDX-AUDIT.md` E2 시정: B4 trendline + B5 MACD divergence
 * 의 input 이 항상 0 이라 EXIT-B 가 사실상 3-component (max 0.90) 작동.
 * scanner 가 candles 전달 시 두 컴포넌트 자동 계산:
 *   B4 trendlineState: "broken" 시 +0.30, "confirmed_break" 시 +0.15
 *   B5 macdBearishDivergence: true 시 +0.20
 *
 * 옵션 미지정 시 기존 동작 유지 (backward compat).
 */
opts?: {
    candles?: Candle[];
}): ExitDecision | null;
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
 * VWAP 표준편차 밴드 (volume-weighted variance).
 *
 * VWAP_STRATEGY.md §6.3 — 1σ/2σ/3σ 밴드.
 * variance = Σ((typical - vwap)² × vol) / Σvol
 *
 * 엣지: candles 비었거나 cumVol === 0 → sigma = 0, 모든 밴드 0.
 */
export declare function calculateVwapBands(candles: Candle[]): VwapBands;
/**
 * Pullback v2 — VWAP_STRATEGY.md §8 의 "터치 + 반등" 패턴 검증.
 *
 * 알고리즘:
 *   1. 마지막 5 캔들 (lookback) 에서 low/high 가 vwap/ema9 의 0.5% 이내 터치
 *   2. 터치 발견 시 다음 1~2 캔들의 종가가 추세 방향으로 반등 확인
 *      LONG: next.close > next.open && next.close > touch.close
 *      SHORT: next.close < next.open && next.close < touch.close
 *
 * 헌장 규칙 3 준수: standalone 시그널 X, decideVwapSignal 의 보조 점수로만 사용.
 *
 * 엣지: candles.length < 7 → detected: false (5 lookback + 2 confirm 필요).
 */
export declare function detectPullbackV2(candles: Candle[], vwap: number, ema9: number, side: "LONG" | "SHORT"): PullbackQuality;
/**
 * decideVwapSignal 의 5-컴포넌트 평가 옵션 (VWAP_STRATEGY.md §9.1).
 *
 * opts 미제공 시 기존 4-컴포넌트 (35/25/25/15) fallback — 호환성.
 */
export interface DecideVwapSignalOptions {
    pullbackQuality?: PullbackQuality;
    volumeProfile?: VolumeProfile;
}
/**
 * Decide LONG / SHORT / null per spec §6.3.
 *
 * LONG: price ABOVE both VWAP and EMA(9) (EMA can be AT).
 * SHORT: price BELOW both VWAP and EMA(9) (EMA can be AT).
 * Mixed → null.
 *
 * opts 제공 시 5-컴포넌트 (25/20/25/15/15) 명세서 §9.1 가중치.
 * opts 미제공 시 기존 4-컴포넌트 (35/25/25/15) — legacy 호환.
 */
export declare function decideVwapSignal(price: number, vwap: number, ema9: number, pullback: boolean, volRatio: number, opts?: DecideVwapSignalOptions): VwapSignal | null;
/**
 * VwapSignal → BBDX confidence multiplier (헌장 규칙 3 준수).
 *
 * Standalone VwapSignal 발행은 deprecated — 본 헬퍼가 정식 통합 경로.
 *
 * Mapping:
 *   - null signal: 1.00 (neutral)
 *   - signal.side === bbdxSide:  1.0 + (strength - 50) / 50 × 0.30  → 1.0~1.30
 *   - signal.side !== bbdxSide:  1.0 - (strength - 50) / 50 × 0.30  → 0.70~1.0
 *
 * Tradelab 은 현재 LONG-only — bbdxSide 기본값 "LONG".
 *
 * @param signal - decideVwapSignal 결과
 * @param bbdxSide - BBDX 진입 path side
 */
export declare function vwapToMultiplier(signal: VwapSignal | null, bbdxSide?: "LONG"): number;
