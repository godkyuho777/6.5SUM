/**
 * Fibonacci & Trendline Strategy — Signal Tracker / Fibonacci 페이지.
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║ ⚠ 헌장 R3 (No Standalone Signal) 통제 — P1-#2 fix, 2026-05-10        ║
 * ║                                                                      ║
 * ║ 본 strategy 는 **backtest 알파 baseline 측정 전용**.                  ║
 * ║ live signal scanner (`scanner.ts`) 는 Fibonacci 를 standalone        ║
 * ║ 진입 트리거로 사용하지 않음 — `isEntrySignal` 은 BBDX core           ║
 * ║ (`entryDecision`) 에만 의존 (P1-#2 시정).                            ║
 * ║                                                                      ║
 * ║ 사용 정책:                                                           ║
 * ║   ✅ backtest CLI (`pnpm backtest --strategy fibonacci`) — 비교 baseline │
 * ║   ❌ real-time signal 발행 — BBDX 의 modifier 로만 작동              ║
 * ║                                                                      ║
 * ║ Audit: `docs/2026-05-10-SCANNER-AUDIT/05-FIBONACCI-AUDIT.md`         ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * 진입 게이트 (backtest 한정):
 *   1. 가격이 Fib 0.382~0.618 골든존 진입 (관성 깊은 retracement 후 반등)
 *   2. RSI < 50 (과열 차단)
 *   3. 거래량 ≥ 50캔들 평균 × 1.0 (최소 활성)
 *   4. 직전 캔들 양봉 (반등 확인)
 *
 * Tier 1/2:
 *   Tier 1: Fib 0.0 (anchor low) 회복 → 50% 청산 (loss 방지 안전망)
 *   Tier 2: Fib 1.0 (anchor high) 도달 → 잔여 50% (or +5% cap)
 *   Stop: anchor low - 0.5 × ATR (또는 entry × 0.98)
 *
 * 헌장 차원: 5 structure (Fibonacci 레벨)
 */
import type { Candle } from "@shared/types";
import { calculateFibonacciLevels } from "../../indicators";
import type { BacktestStrategy } from "./types";
/** 윈도우 내 anchor high/low 산출 */
declare function computeFibAnchor(candles: Candle[]): {
    high: number;
    low: number;
};
/** Fib 골든존 (0.382 ~ 0.618) 진입 여부 */
declare function inFibGoldenZone(price: number, low: number, high: number): boolean;
export declare const fibonacciStrategy: BacktestStrategy;
export { computeFibAnchor, inFibGoldenZone, calculateFibonacciLevels };
