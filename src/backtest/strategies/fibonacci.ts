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

import type { Candle, TechnicalIndicators } from "@shared/types";
import { calculateFibonacciLevels } from "../../indicators";
import type { BacktestStrategy, EntryEvaluation, EntryParams } from "./types";
import { registerStrategy } from "./types";

/** 윈도우 내 anchor high/low 산출 */
function computeFibAnchor(candles: Candle[]): { high: number; low: number } {
  if (candles.length === 0) return { high: 0, low: 0 };
  let high = -Infinity;
  let low = Infinity;
  for (const c of candles) {
    if (c.high > high) high = c.high;
    if (c.low < low) low = c.low;
  }
  return { high, low };
}

/** Fib 골든존 (0.382 ~ 0.618) 진입 여부 */
function inFibGoldenZone(price: number, low: number, high: number): boolean {
  if (high <= low) return false;
  const range = high - low;
  const fib382 = low + range * 0.382;
  const fib618 = low + range * 0.618;
  // 상승 retracement 시: low 위에서 반등 — 0.382 ~ 0.618 사이 (골든존)
  return price >= fib382 && price <= fib618;
}

/** 거래량 50캔들 평균 */
function avgVolume(candles: Candle[], lookback = 50): number {
  if (candles.length === 0) return 0;
  const tail = candles.slice(-lookback);
  return tail.reduce((s, c) => s + c.volume, 0) / tail.length;
}

export const fibonacciStrategy: BacktestStrategy = {
  name: "fibonacci",
  label: "Fibonacci & Trendline",
  description:
    "Fib 0.382~0.618 골든존 진입 + RSI<50 + 거래량 + 양봉 반등 확인",
  dimensionsCovered: [5],

  shouldEnter(
    candles: Candle[],
    idx: number,
    indicators: TechnicalIndicators,
    windowCandles: Candle[],
  ): EntryEvaluation {
    if (idx < 20) return { entry: false };

    const price = candles[idx].close;
    const reasons: string[] = [];

    // Anchor: 윈도우 내 최고/최저
    const { high, low } = computeFibAnchor(windowCandles);
    if (high <= low) return { entry: false };

    // Gate 1: Fib 골든존 진입
    if (!inFibGoldenZone(price, low, high)) return { entry: false };
    const range = high - low;
    const fibPosition = (price - low) / range;
    reasons.push(`Fib 골든존 (${(fibPosition * 100).toFixed(1)}% retracement)`);

    // Gate 2: RSI < 50 (과열 차단)
    if (indicators.rsi >= 50) return { entry: false };
    reasons.push(`RSI ${indicators.rsi.toFixed(1)} < 50`);

    // Gate 3: 거래량 ≥ 50캔들 평균
    const avgVol = avgVolume(windowCandles, 50);
    if (avgVol > 0 && candles[idx].volume < avgVol) return { entry: false };
    reasons.push(`거래량 ${(candles[idx].volume / Math.max(avgVol, 1)).toFixed(2)}× baseline`);

    // Gate 4: 직전 캔들 양봉
    const prev = candles[idx - 1];
    if (!prev || prev.close <= prev.open) return { entry: false };
    reasons.push("직전 캔들 양봉 (반등 확인)");

    return {
      entry: true,
      reasons,
      metadata: {
        fibLevel: parseFloat(fibPosition.toFixed(3)),
      },
    };
  },

  getEntryParams(
    _candles: Candle[],
    _idx: number,
    _indicators: TechnicalIndicators,
    entryPrice: number,
    windowCandles: Candle[],
  ): EntryParams {
    const { high, low } = computeFibAnchor(windowCandles);
    const range = Math.max(high - low, entryPrice * 0.01);

    // Tier 1: Fib 1.0 (anchor high) — 직전 swing 회복
    const target1 = Math.min(high, entryPrice * 1.04);
    // Tier 2: Fib 1.272 (extension) — entry × 1.05 cap
    const target2 = Math.min(low + range * 1.272, entryPrice * 1.07);
    // Stop: anchor low 약간 아래 또는 entry × 0.98
    const stopLoss = Math.max(low * 0.99, entryPrice * 0.98);

    // Signal strength: Fib retracement 의 깊이 (깊을수록 강함)
    const fibPosition = Math.max(0, Math.min(1, (entryPrice - low) / range));
    const signalStrength = Math.round((1 - fibPosition) * 100);

    return { target1, target2, stopLoss, signalStrength };
  },
};

registerStrategy(fibonacciStrategy);

// re-export utils for tests / other strategies
export { computeFibAnchor, inFibGoldenZone, calculateFibonacciLevels };
