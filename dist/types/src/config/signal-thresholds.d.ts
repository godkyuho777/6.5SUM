/**
 * Signal Thresholds — 시그널 임계값 단일 출처 (P2-#1, 2026-05-23).
 *
 * AUDIT.md 권장: indicators.ts 에 magic numbers (RSI 30/25, BB 20, ADX 25 등)
 * 가 산재 → 한 임계값 변경 시 영향도 파악 어려움 + 백테스트 sweep 불가.
 *
 * 본 모듈은 모든 시그널 임계값을 한 곳에 집중시켜:
 *   1. 단일 import 로 임계값 조회
 *   2. 백테스트 CLI 에서 임계값 sweep 가능 (`--rsi-low 22 --rsi-high 36` 등)
 *   3. 향후 environment variable / DB 기반 dynamic config 도 쉽게 wiring
 *
 * 헌장: 본 module 은 *config 만* 정의. 실제 시그널 로직은 indicators.ts /
 * scanner.ts / strategies/ 에서 본 config 를 import 해 사용. config 변경은
 * 즉시 모든 호출자에게 반영됨.
 *
 * Migration 정책:
 *   - 기존 module-level const (NUM_RSI_LOW 등) 는 본 config 를 import 해
 *     초기화하도록 변경. 호출 코드는 그대로 (재컴파일 후 동작 일치).
 *   - 새 임계값은 본 config 에 직접 추가하고 호출처는 SIGNAL_THRESHOLDS.* 사용.
 *
 * 백테스트 sweep 사용 예 (향후 P2 후속):
 *   const overrideThresholds = { ...SIGNAL_THRESHOLDS, long: { num: { rsiLow: 22 } } };
 *   const result = await runBacktest({ ..., thresholds: overrideThresholds });
 */
/**
 * BBDX-PATTERN entry 조건 임계값.
 *
 * Path 3종 (priority: BB > PTN > NUM):
 *   - BB  : Bollinger Band 위치 + 패턴 confluence (자세한 임계값은 detectBBStructure)
 *   - PTN : Pattern 만으로 진입 (RSI 의존도 ↓)
 *   - NUM : 순수 수치 (RSI low + BB lower 근접 + ADX 약세)
 */
export interface EntryPathThresholds {
    /** RSI 하한 (이하면 oversold) */
    rsiLow: number;
    /** RSI 상한 (NUM path 의 PullbackOK 한도) */
    rsiHigh: number;
    /** BB lower 와의 허용 거리 (%) */
    bbTolerance: number;
    /** ADX 최대 (이 이하면 약세장 → 평균회귀 favorable) */
    adxMax: number;
}
/**
 * SHORT path 임계값 (LONG 의 RSI 대칭 + 일부 보수적 조정).
 */
export interface ShortPathThresholds {
    num: EntryPathThresholds;
    ptn: {
        bbTolerance: number;
        adxMax: number;
    };
}
/**
 * EXIT 조건 임계값.
 */
export interface ExitThresholds {
    /** RSI 가 이 이상이면 청산 가속 (overbought) */
    rsiThreshold: number;
    /** ADX 가 이 이상이면 강한 추세 → exit 약화 */
    adxThreshold: number;
    /** +DI 가 이 이상이면 매수세 강함 → exit 약화 */
    plusDiThreshold: number;
}
/**
 * VWAP 시그널 임계값.
 */
export interface VwapThresholds {
    /** ±0.1% counts as "AT" (price ≈ VWAP) */
    atTolerance: number;
    /** within 0.5% of VWAP/EMA = approaching pullback */
    pullbackProximity: number;
    /** VWAP signal strength 이 이상이면 trigger */
    signalThreshold: number;
}
export interface SignalThresholds {
    long: {
        num: EntryPathThresholds;
        ptn: {
            bbTolerance: number;
            adxMax: number;
        };
    };
    short: ShortPathThresholds;
    exit: ExitThresholds;
    vwap: VwapThresholds;
}
/**
 * Production default — 본 값들은 indicators.ts 의 기존 const 와 정확히 일치.
 * 변경 시 backtest 회귀 (winRate / Sharpe / PF) 영향 측정 필수.
 */
export declare const SIGNAL_THRESHOLDS: SignalThresholds;
/**
 * 백테스트 sweep 또는 calibration cron 이 임계값 override 할 때 사용.
 *
 * @param base 시작점 thresholds (보통 SIGNAL_THRESHOLDS)
 * @param overrides partial 변경
 * @returns merged thresholds (모든 필드 채워진 deep copy)
 */
export declare function overrideThresholds(base: SignalThresholds, overrides: DeepPartial<SignalThresholds>): SignalThresholds;
type DeepPartial<T> = {
    [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};
export {};
