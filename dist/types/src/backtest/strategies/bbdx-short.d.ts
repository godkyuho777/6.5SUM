/**
 * BBDX SHORT Strategy (P1-#3, 2026-05-10) — `decideShortEntry` 미러.
 *
 * `bbdx.ts` (LONG) 의 dual mirror. RSI 평균회귀 *상단* + BB 상단 + ADX 약함
 * + bearish Pattern Confluence + Higher-TF SMA(50) 약세 게이트.
 *
 * 진입 게이트 (4단계 직렬, LONG 미러):
 *   1. decideShortEntry — RSI 62~75, BB upper×0.98, ADX≤20 (NUM)
 *      OR bearish pattern + BB upper×0.95 + ADX≤25 (PTN)
 *      OR detectBBStructureShort 결과 (BB)
 *   2. Rising Knife 차단 — `decideShortEntry` 내부에서 처리됨
 *   3. Pattern Confluence — bearishPatterns aggregatePatternScore ≥ 0.4
 *   4. Higher-TF SMA(50) — SMA +1% 이상 상승 + price > SMA 시 차단 (LONG 미러)
 *
 * Tier 1/2 부분 청산 (R:R 비대칭화 미러):
 *   Tier 1: bbMiddle 도달 (price 하락) → 50%
 *   Tier 2: max(bbLower, entry × 0.95) → 잔여 50%
 *   Stop:   min(bbUpper × 1.03, entry × 1.02)
 *
 * Modifier 추적 (Phase 2): EMA Ribbon × MACD × Order Block 의 *부호 반전*
 *   long mult 1.20 → short mult 0.80 (`invertMultiplier(2 - x)`)
 *
 * 헌장:
 *   - R1 차원: 1 momentum (RSI), 2 volatility (BB), 3 trend (ADX), 5 structure (pattern)
 *   - R2 alpha: 본 strategy 가 backtest CLI 에서 실행 가능 — Wilson CI / winRate / Sharpe 측정
 *   - R3 단독 X: BBDX core 의 SHORT mirror — 통과
 *   - Capital protection: Rising Knife 차단 + Tier 1 stop 보존
 */
import type { BacktestStrategy } from "./types";
export declare const bbdxShortStrategy: BacktestStrategy;
