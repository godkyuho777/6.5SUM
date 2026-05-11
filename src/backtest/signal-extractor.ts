/**
 * Signal Extractor — Lookahead-free Signal Replay (v6.5 Phase 1)
 *
 * 핵심 원칙: NO LOOKAHEAD BIAS
 * - 캔들 i의 시그널 판단: candles[0..i] 만 사용
 * - 캔들 i의 결과 측정: candles[i+1..i+outcomeWindow] 만 사용
 * - 두 데이터 집합이 절대 섞이지 않음
 *
 * v6.5 Phase 1 변경:
 * - measureOutcome: 단일 target 청산 → Tier 1 (50% at bbMiddle) + Tier 2 (full at bbUpper or +5%)
 * - Stop: bbLower × 0.97 → max(bbLower × 0.97, entry × 0.98)
 * - 진입 게이트 추가: Pattern Confluence (≥0.4) + Higher-TF SMA(50) 필터
 */

import type { Candle } from "@shared/types";
import { calculateAllIndicators } from "../indicators";
import { getStrategy } from "./strategies";
// strategies/index.ts 의 side-effect import 가 모든 전략을 STRATEGY_REGISTRY 에 등록.
// signal-extractor 는 BacktestConfig.strategy (default 'bbdx') 로 lookup.
import "./strategies";
import type { BacktestConfig, BacktestTrade, ExitReason, PartialExit } from "./types";

// ─────────────────────────────────────────────────────────
// Outcome measurement (v6.5 Phase 1: tiered partial exits)
// ─────────────────────────────────────────────────────────

interface OutcomeResult {
  exitPrice: number;
  exitTs: number;
  exitReason: ExitReason;
  /** 가중 평균 수익률 % */
  returnPct: number;
  maxFavorable: number;
  maxAdverse: number;
  win: boolean;
  holdingCandles: number;
  partialExits: PartialExit[];
}

/**
 * 시그널 발생 이후 candles[signalIdx+1 .. signalIdx+window] 에서
 * Tier 1/2 부분 청산 + Stop 도달 여부를 측정.
 *
 * **Side-aware (P1-#3, 2026-05-10)**:
 *   - "long"  → profit when price ↑. target > entry, stop < entry.
 *               Tier hit: c.high ≥ target. Stop hit: c.low ≤ stop.
 *   - "short" → profit when price ↓. target < entry, stop > entry.
 *               Tier hit: c.low ≤ target. Stop hit: c.high ≥ stop.
 *               returnPct = (entry - exit) / entry × 100  (부호 반전)
 *
 * 청산 우선순위 (한 캔들 내):
 *   1. Stop 도달 → 잔여 포지션 전부 손절
 *   2. Tier 2 도달 → 잔여 포지션 전부 청산
 *   3. Tier 1 도달 → 50% 부분 청산
 */
function measureOutcomeTiered(
  candles: Candle[],
  signalIdx: number,
  entryPrice: number,
  target1: number,
  target2: number,
  stopLoss: number,
  window: number,
  side: "long" | "short" = "long",
): OutcomeResult {
  const endIdx = Math.min(signalIdx + window, candles.length - 1);
  let maxHigh = entryPrice;
  let minLow = entryPrice;

  // 부분 청산 추적
  const partialExits: PartialExit[] = [];
  let tier1Hit = false;
  let remaining = 1.0;
  let lastCandleIdx = endIdx;

  // P0-② fix (2026-05-11): Tier 1 도달 후 stop 을 entry 로 이동 (breakeven).
  //   진단 결과: tier1_then_stop 1.9% 외에도 *Tier 1 미도달 후 즉시 stop*
  //   비율 80.8%. Tier 1 도달 후 잔여 50% 의 stop 을 *원래 stop* 으로 유지
  //   하면 trend reversal 시 손실로 끝남. BE 이동으로 잔여 50% 손실 cap.
  //
  //   long:  effectiveStop = max(stopLoss, entryPrice)
  //   short: effectiveStop = min(stopLoss, entryPrice)
  let effectiveStop = stopLoss;

  // 가중 청산 가격/수익률 누적
  let weightedExitPrice = 0;
  let weightedReturnPct = 0;

  // ── side-aware helpers ─────────────────────────────────────────────────
  // returnPct: long 은 (exit - entry) / entry × 100, short 은 (entry - exit)
  const calcReturn = (exit: number) =>
    ((side === "long" ? exit - entryPrice : entryPrice - exit) / entryPrice) * 100;
  // tier hit: long 은 c.high ≥ target (price 상승), short 은 c.low ≤ target (price 하락)
  const tierHit = (c: Candle, target: number) =>
    side === "long" ? c.high >= target : c.low <= target;
  // stop hit: long 은 c.low ≤ stop (price 하락 too far), short 은 c.high ≥ stop (price 상승)
  const stopHit = (c: Candle, stop: number) =>
    side === "long" ? c.low <= stop : c.high >= stop;
  // maxFavorable: long 은 (maxHigh - entry), short 은 (entry - minLow). 보유 중 가장 좋은 시점.
  // maxAdverse: long 은 (entry - minLow), short 은 (maxHigh - entry). 보유 중 가장 나쁜 시점.

  for (let i = signalIdx + 1; i <= endIdx; i++) {
    const c = candles[i];

    if (c.high > maxHigh) maxHigh = c.high;
    if (c.low < minLow) minLow = c.low;

    // 1. Stop 우선 (effectiveStop — Tier 1 도달 후 BE 로 이동된 stop 사용)
    if (stopHit(c, effectiveStop)) {
      const stopReturn = calcReturn(effectiveStop);
      // 잔여 포지션 (remaining) 전부 손절
      weightedExitPrice += effectiveStop * remaining;
      weightedReturnPct += stopReturn * remaining;
      partialExits.push({
        tier: tier1Hit ? 2 : 1, // Tier 라벨은 위치보다 stop 처리
        candleOffset: i - signalIdx,
        price: effectiveStop,
        ratio: remaining,
        returnPct: stopReturn,
      });
      lastCandleIdx = i;

      const finalReturn = weightedReturnPct;
      return {
        exitPrice: weightedExitPrice,
        exitTs: c.openTime,
        exitReason: tier1Hit ? "tier1_then_stop" : "stop_loss",
        returnPct: finalReturn,
        maxFavorable:
          side === "long"
            ? ((maxHigh - entryPrice) / entryPrice) * 100
            : ((entryPrice - minLow) / entryPrice) * 100,
        maxAdverse:
          side === "long"
            ? ((entryPrice - minLow) / entryPrice) * 100
            : ((maxHigh - entryPrice) / entryPrice) * 100,
        win: finalReturn > 0,
        holdingCandles: lastCandleIdx - signalIdx,
        partialExits,
      };
    }

    // 2. Tier 2 도달
    if (tierHit(c, target2)) {
      const tier2Return = calcReturn(target2);
      weightedExitPrice += target2 * remaining;
      weightedReturnPct += tier2Return * remaining;
      partialExits.push({
        tier: 2,
        candleOffset: i - signalIdx,
        price: target2,
        ratio: remaining,
        returnPct: tier2Return,
      });
      lastCandleIdx = i;

      return {
        exitPrice: weightedExitPrice,
        exitTs: c.openTime,
        exitReason: tier1Hit ? "tier2_full" : "target_hit",
        returnPct: weightedReturnPct,
        maxFavorable:
          side === "long"
            ? ((maxHigh - entryPrice) / entryPrice) * 100
            : ((entryPrice - minLow) / entryPrice) * 100,
        maxAdverse:
          side === "long"
            ? ((entryPrice - minLow) / entryPrice) * 100
            : ((maxHigh - entryPrice) / entryPrice) * 100,
        win: weightedReturnPct > 0,
        holdingCandles: lastCandleIdx - signalIdx,
        partialExits,
      };
    }

    // 3. Tier 1 도달 — 첫 도달 시 50% 부분 청산
    if (!tier1Hit && tierHit(c, target1)) {
      tier1Hit = true;
      const tier1Ratio = 0.5;
      const tier1ReturnPct = calcReturn(target1);
      weightedExitPrice += target1 * tier1Ratio;
      weightedReturnPct += tier1ReturnPct * tier1Ratio;
      remaining -= tier1Ratio;
      partialExits.push({
        tier: 1,
        candleOffset: i - signalIdx,
        price: target1,
        ratio: tier1Ratio,
        returnPct: tier1ReturnPct,
      });
      // P0-② fix (2026-05-11): Tier 1 도달 후 stop 을 entry 가격으로 이동
      // (breakeven). 잔여 50% 의 손실 cap → MDD ↓.
      //   long:  effectiveStop = max(원래 stop, entry)  — 위쪽으로만 이동
      //   short: effectiveStop = min(원래 stop, entry)  — 아래쪽으로만 이동
      effectiveStop =
        side === "long"
          ? Math.max(effectiveStop, entryPrice)
          : Math.min(effectiveStop, entryPrice);
    }
  }

  // 윈도우 만료 — 잔여 포지션 마지막 close 로 청산
  const lastCandle = candles[endIdx];
  const expireReturn = calcReturn(lastCandle.close);
  weightedExitPrice += lastCandle.close * remaining;
  weightedReturnPct += expireReturn * remaining;
  partialExits.push({
    tier: tier1Hit ? 2 : 1,
    candleOffset: endIdx - signalIdx,
    price: lastCandle.close,
    ratio: remaining,
    returnPct: expireReturn,
  });

  return {
    exitPrice: weightedExitPrice,
    exitTs: lastCandle.openTime,
    exitReason: tier1Hit ? "tier1_then_window" : "window_expired",
    returnPct: weightedReturnPct,
    maxFavorable:
      side === "long"
        ? ((maxHigh - entryPrice) / entryPrice) * 100
        : ((entryPrice - minLow) / entryPrice) * 100,
    maxAdverse:
      side === "long"
        ? ((entryPrice - minLow) / entryPrice) * 100
        : ((maxHigh - entryPrice) / entryPrice) * 100,
    win: weightedReturnPct > 0,
    holdingCandles: endIdx - signalIdx,
    partialExits,
  };
}

// ─────────────────────────────────────────────────────────
// Main extractor — strategy-driven (v6.5 multi-strategy)
// ─────────────────────────────────────────────────────────

/**
 * 단일 심볼의 전체 캔들에서 시그널을 추출하고 outcome 을 측정한다.
 *
 * v6.5 multi-strategy: BacktestConfig.strategy 로 4 전략 중 선택.
 *   - bbdx (default)        — RSI/BB/ADX (v6.5 Phase 1+2+3)
 *   - fibonacci             — Fib 골든존 진입
 *   - vwap                  — VWAP+EMA Pullback
 *   - trend                 — Multi-TF Trend Analysis
 *
 * 각 전략은 strategies/<name>.ts 에서 BacktestStrategy 인터페이스 구현.
 * shouldEnter (진입 조건) + getEntryParams (Tier 1/2 + Stop) 만 책임.
 * Outcome 측정 / partial exit / 통계는 framework 가 처리.
 */
export function extractSignalsFromCandles(
  symbol: string,
  candles: Candle[],
  config: BacktestConfig,
): BacktestTrade[] {
  const { tf, minWarmupCandles, outcomeWindowCandles, cooldownCandles } = config;
  const strategyName = config.strategy ?? "bbdx";
  const strategy = getStrategy(strategyName);
  const side = strategy.side ?? "long";

  const trades: BacktestTrade[] = [];
  const maxSignalIdx = candles.length - outcomeWindowCandles - 1;

  if (maxSignalIdx < minWarmupCandles) {
    console.warn(
      `[Extractor] ${symbol}: 캔들 수 부족 ` +
        `(${candles.length} < ${minWarmupCandles + outcomeWindowCandles}), 스킵`,
    );
    return [];
  }

  // ── 시그널 cooldown — 같은 strategy 내에서 5 캔들 간격 ────────────────
  // 현재 single-strategy execution model: 1 strategy = 1 extractor call →
  // lastSignalIdx 가 strategy 별 자동 분리.
  //
  // 미래 multi-strategy 동시 실행 (LONG + SHORT 같은 universe) 시:
  // strategy/side 별 별도 cooldown 추적 필요 — 현재 architecture 변경 X,
  // 주석 마커로 future fix 권고 (audit `08-BACKTEST-CALIBRATION-AUDIT.md` S1).
  let lastSignalIdx = -Infinity;

  for (let i = minWarmupCandles; i <= maxSignalIdx; i++) {
    if (i - lastSignalIdx < cooldownCandles) continue;

    // ── Lookahead-free: candles[0..i] 만 사용 ────────────
    const windowCandles = candles.slice(Math.max(0, i - 199), i + 1);
    // BACKTEST_DEFECT_AUDIT D3 — DEV sanity: windowCandles 의 마지막 캔들이
    // 정확히 candles[i] 인지 확인. strategy 가 future bar 를 참조하지 않도록.
    if (process.env.NODE_ENV !== "production") {
      const last = windowCandles[windowCandles.length - 1];
      if (last !== candles[i]) {
        throw new Error(
          `[signal-extractor] LOOKAHEAD: windowCandles tail !== candles[${i}]`,
        );
      }
    }
    const indicators = calculateAllIndicators(windowCandles);
    const price = candles[i].close;

    // ── Strategy 진입 조건 평가 ──────────────────────────
    const evaluation = strategy.shouldEnter(candles, i, indicators, windowCandles);
    if (!evaluation.entry) continue;

    // ── Strategy 청산 파라미터 산출 ──────────────────────
    const params = strategy.getEntryParams(
      candles,
      i,
      indicators,
      price,
      windowCandles,
    );

    // ── Outcome 측정 (candles[i+1..] 만 사용, framework 책임) ──
    const outcome = measureOutcomeTiered(
      candles,
      i,
      price,
      params.target1,
      params.target2,
      params.stopLoss,
      outcomeWindowCandles,
      side,
    );

    // 메타 추출 (각 전략별 다른 필드)
    const meta = evaluation.metadata ?? {};

    const trade: BacktestTrade = {
      signalTs: candles[i].openTime,
      symbol,
      tf,
      strategy: strategyName,
      side,
      entryReasons: evaluation.reasons,
      strategyMeta: meta as Record<string, unknown>,
      entryPrice: price,
      target: params.target1,
      target2: params.target2,
      stopLoss: params.stopLoss,
      signalStrength: params.signalStrength,
      rsi: indicators.rsi,
      bbLower: indicators.bbLower,
      bbMiddle: indicators.bbMiddle,
      bbUpper: indicators.bbUpper,
      adx: indicators.adx,
      plusDi: indicators.plusDi,
      minusDi: indicators.minusDi,
      // 전략별 metadata 에서 추출 (BBDX 의 Phase 1+2 필드)
      patternConfluenceScore:
        typeof meta.patternConfluenceScore === "number"
          ? meta.patternConfluenceScore
          : undefined,
      higherTfBullish:
        typeof meta.higherTfBullish === "boolean" ? meta.higherTfBullish : undefined,
      emaRibbonMult:
        typeof meta.emaRibbonMult === "number" ? meta.emaRibbonMult : undefined,
      macdDivergenceMult:
        typeof meta.macdDivergenceMult === "number"
          ? meta.macdDivergenceMult
          : undefined,
      orderBlockMult:
        typeof meta.orderBlockMult === "number" ? meta.orderBlockMult : undefined,
      modifiersProduct:
        typeof meta.modifiersProduct === "number"
          ? meta.modifiersProduct
          : undefined,
      adjustedConfidence:
        typeof meta.modifiersProduct === "number"
          ? params.signalStrength * meta.modifiersProduct
          : undefined,
      ...outcome,
    };

    trades.push(trade);
    lastSignalIdx = i;
  }

  return trades;
}

/**
 * 여러 심볼의 캔들 맵에서 전체 트레이드를 추출한다.
 *
 * @param symbolCandles 심볼 → 캔들 배열
 * @param config        백테스트 설정
 * @param onProgress    심볼 처리 완료 시 콜백 (옵션, runner 의 progress 표시용)
 */
export function extractAllSignals(
  symbolCandles: Map<string, Candle[]>,
  config: BacktestConfig,
  onProgress?: (done: number, total: number, symbol: string) => void,
): BacktestTrade[] {
  const allTrades: BacktestTrade[] = [];
  const total = symbolCandles.size;
  let done = 0;
  for (const [symbol, candles] of symbolCandles) {
    const trades = extractSignalsFromCandles(symbol, candles, config);
    allTrades.push(...trades);
    done += 1;
    if (onProgress) onProgress(done, total, symbol);
  }
  return allTrades.sort((a, b) => a.signalTs - b.signalTs);
}
