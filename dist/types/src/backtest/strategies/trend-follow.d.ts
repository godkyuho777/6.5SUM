/**
 * Trend-Follow Strategy — P1-③ (2026-05-11) 전략 다양화.
 *
 * Audit 진단 결과 mean reversion (BBDX) 만으로는 강세장 부적합.
 * EMA + ADX + HH/HL 기반 추세 추종 strategy 신규 추가하여 BBDX 와 보완.
 *
 * 진입 게이트 (5단계):
 *   1. EMA 정배열: EMA(9) > EMA(21) > EMA(50)
 *   2. ADX ≥ 25 (강한 추세)
 *   3. +DI > -DI (강세 우위)
 *   4. price > SMA(50) (장기 추세 위)
 *   5. 직전 캔들 HH (higher high — 최근 20 캔들 max 갱신)
 *
 * Tier 1/2 (R:R 비대칭):
 *   Tier 1: entry + 1.5 × ATR → 50% (breakout 의 첫 익절)
 *   Tier 2: entry + 3.5 × ATR → 잔여 50% (trend continuation)
 *   Stop:   entry - 1.0 × ATR (변동성 적응)
 *
 * 차원 커버 (헌장 R1):
 *   1 momentum (RSI 미사용 — pure trend, 의도적 단일 차원 후 modifier 보완)
 *   3 trend (ADX + EMA + DI + SMA)
 *   5 structure (HH/HL swing)
 *
 * 헌장 R3 (단독 시그널 X):
 *   본 strategy 는 *backtest baseline 측정 전용*. live signal scanner 가
 *   사용하려면 BBDX 와 별도 path 로 통합 필요 (후속 작업).
 */
import type { BacktestStrategy } from "./types";
export declare const trendFollowStrategy: BacktestStrategy;
