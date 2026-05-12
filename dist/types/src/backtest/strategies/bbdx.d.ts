/**
 * BBDX Strategy (RSI/BB/ADX) — Signal Tracker / RSI · BB · ADX 페이지.
 *
 * 진입 게이트 (4단계 직렬, v6.5 Phase 1):
 *   1. isEntrySignal — RSI 30~35, BB lower×1.02, ADX≤30
 *   2. Falling Knife — -DI > +DI && ADX > 25 차단
 *   3. Pattern Confluence — bullishPatterns aggregatePatternScore ≥ 0.4
 *   4. Higher-TF SMA(50) — SMA -1% 이상 하락 + price < SMA 시 차단
 *
 * Tier 1/2 부분 청산 (R:R 비대칭화):
 *   Tier 1: bbMiddle 도달 → 50%
 *   Tier 2: min(bbUpper, entry × 1.05) → 잔여 50%
 *   Stop: max(bbLower × 0.97, entry × 0.98)
 *
 * Modifier 추적 (Phase 2): MACD × Order Block
 *
 * 헌장 차원: 1 momentum (RSI), 2 volatility (BB), 3 trend (ADX)
 */
import type { BacktestStrategy } from "./types";
export declare const bbdxStrategy: BacktestStrategy;
