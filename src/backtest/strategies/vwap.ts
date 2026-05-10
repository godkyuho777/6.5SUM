/**
 * VWAP Strategy (Parker Brooks Style) — Signal Tracker / VWAP 페이지.
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║ ⚠ 헌장 R3 (No Standalone Signal) 통제 — P1-#2 fix, 2026-05-10        ║
 * ║                                                                      ║
 * ║ 본 strategy 는 **backtest 알파 baseline 측정 전용**.                  ║
 * ║ live signal scanner (`scanner.ts`) 는 VWAP 를 BBDX 의 *multiplier*    ║
 * ║ 로만 사용 (`vwapToMultiplier(decideVwapSignal(...))`). standalone     ║
 * ║ 진입 발행 X.                                                          ║
 * ║                                                                      ║
 * ║ 사용 정책:                                                           ║
 * ║   ✅ backtest CLI (`pnpm backtest --strategy vwap`) — 비교 baseline   ║
 * ║   ❌ real-time signal 발행 — BBDX 의 multiplier 로만 작동             ║
 * ║                                                                      ║
 * ║ Audit: `docs/2026-05-10-SCANNER-AUDIT/04-VWAP-AUDIT.md` §3 (R3 risk)│
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * 진입 게이트 (backtest 한정):
 *   1. price > VWAP (VWAP 위에서 매수만)
 *   2. price > EMA(9) (단기 모멘텀 확인)
 *   3. Pullback detected (VWAP/EMA9 터치 후 반등)
 *   4. 거래량 ≥ 50캔들 평균 × 1.0
 *
 * Tier 1/2:
 *   Tier 1: VWAP + 1σ → 50%
 *   Tier 2: VWAP + 2σ 또는 entry × 1.04 → 잔여 50%
 *   Stop: max(VWAP - 1σ, entry × 0.98)
 *
 * 헌장 차원: 4 volume (VWAP 는 volume-weighted), 3 trend (EMA 정렬)
 */

import type { Candle, TechnicalIndicators } from "@shared/types";
import {
  calculateVWAP,
  calculateEMA,
  vwapPosition,
  emaPosition,
  detectPullback,
  calculateVwapBands,
} from "../../indicators";
import type { BacktestStrategy, EntryEvaluation, EntryParams } from "./types";
import { registerStrategy } from "./types";

function avgVolume(candles: Candle[], lookback = 50): number {
  if (candles.length === 0) return 0;
  const tail = candles.slice(-lookback);
  return tail.reduce((s, c) => s + c.volume, 0) / tail.length;
}

export const vwapStrategy: BacktestStrategy = {
  name: "vwap",
  label: "VWAP Strategy (Parker Brooks)",
  description: "VWAP + EMA(9) 정렬 + Pullback 감지 + 거래량 confirmation",
  dimensionsCovered: [3, 4],

  shouldEnter(
    candles: Candle[],
    idx: number,
    _indicators: TechnicalIndicators,
    windowCandles: Candle[],
  ): EntryEvaluation {
    if (idx < 20) return { entry: false };

    const price = candles[idx].close;
    const reasons: string[] = [];

    const closes = windowCandles.map((c) => c.close);
    const vwap = calculateVWAP(windowCandles);
    const ema9 = calculateEMA(closes, 9);

    if (vwap === 0 || ema9 === 0) return { entry: false };

    // Gate 1: price > VWAP
    const vwapPos = vwapPosition(price, vwap);
    if (vwapPos !== "ABOVE") return { entry: false };
    reasons.push(`Price > VWAP ($${vwap.toFixed(2)})`);

    // Gate 2: price > EMA(9)
    const emaPos = emaPosition(price, ema9);
    if (emaPos !== "ABOVE") return { entry: false };
    reasons.push(`Price > EMA(9) ($${ema9.toFixed(2)})`);

    // Gate 3: Pullback detected (VWAP/EMA9 근처 터치 후 반등)
    const pullbackDetected = detectPullback(windowCandles, vwap, ema9);
    if (!pullbackDetected) return { entry: false };
    reasons.push("Pullback detected (VWAP/EMA9 터치 후 반등)");

    // Gate 4: 거래량 ≥ 50캔들 평균
    const avgVol = avgVolume(windowCandles, 50);
    if (avgVol > 0 && candles[idx].volume < avgVol) return { entry: false };
    reasons.push(`거래량 ${(candles[idx].volume / Math.max(avgVol, 1)).toFixed(2)}× baseline`);

    return {
      entry: true,
      reasons,
      metadata: {
        vwapPosition: vwapPos,
        pullbackDetected: true,
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
    let target1: number;
    let target2: number;
    let stopLoss: number;

    try {
      const bands = calculateVwapBands(windowCandles);
      target1 = Math.min(bands.upper1, entryPrice * 1.025); // VWAP + 1σ, +2.5% cap
      target2 = Math.min(bands.upper2, entryPrice * 1.05); // VWAP + 2σ, +5% cap
      stopLoss = Math.max(bands.lower1, entryPrice * 0.98);
    } catch {
      // fallback if bands 계산 실패
      target1 = entryPrice * 1.02;
      target2 = entryPrice * 1.04;
      stopLoss = entryPrice * 0.98;
    }

    // Signal strength: pullback 후 반등 distance 정규화
    const distance = Math.abs(entryPrice - calculateVWAP(windowCandles));
    const signalStrength = Math.round(
      Math.min(100, 50 + (distance / entryPrice) * 1000),
    );

    return { target1, target2, stopLoss, signalStrength };
  },
};

registerStrategy(vwapStrategy);
