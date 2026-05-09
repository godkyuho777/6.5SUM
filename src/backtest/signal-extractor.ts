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
import {
  calculateAllIndicators,
  isEntrySignal,
  calculateSignalStrength,
  detectAllCandlePatterns,
} from "../indicators";
import { aggregatePatternScore } from "../patterns/aggregator";
import {
  computeEmaRibbon,
  detectMacdDivergence,
  detectOrderBlock,
} from "../modifiers";
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
 * 청산 우선순위 (한 캔들 내):
 *   1. Stop 도달 → 잔여 포지션 전부 손절
 *   2. Tier 2 도달 (bbUpper or +5%) → 잔여 포지션 전부 청산
 *   3. Tier 1 도달 (bbMiddle) → 50% 부분 청산 (잔여 50% 는 Tier 2 / Stop / 만료 대기)
 *
 * @param candles      전체 캔들 배열
 * @param signalIdx    시그널 발생 인덱스
 * @param entryPrice   진입 가격
 * @param target1      Tier 1 = bbMiddle
 * @param target2      Tier 2 = bbUpper 또는 entry × 1.05 중 작은 쪽
 * @param stopLoss     손절가 = max(bbLower × 0.97, entry × 0.98)
 * @param window       최대 측정 캔들 수
 */
function measureOutcomeTiered(
  candles: Candle[],
  signalIdx: number,
  entryPrice: number,
  target1: number,
  target2: number,
  stopLoss: number,
  window: number,
): OutcomeResult {
  const endIdx = Math.min(signalIdx + window, candles.length - 1);
  let maxHigh = entryPrice;
  let minLow = entryPrice;

  // 부분 청산 추적
  const partialExits: PartialExit[] = [];
  let tier1Hit = false;
  let remaining = 1.0;
  let tier1ReturnPct = 0;
  let lastCandleIdx = endIdx;

  // 가중 청산 가격/수익률 누적
  let weightedExitPrice = 0;
  let weightedReturnPct = 0;

  for (let i = signalIdx + 1; i <= endIdx; i++) {
    const c = candles[i];

    if (c.high > maxHigh) maxHigh = c.high;
    if (c.low < minLow) minLow = c.low;

    // 1. Stop 우선 (캔들 저가 기준)
    if (c.low <= stopLoss) {
      const stopReturn = ((stopLoss - entryPrice) / entryPrice) * 100;
      // 잔여 포지션 (remaining) 전부 손절
      weightedExitPrice += stopLoss * remaining;
      weightedReturnPct += stopReturn * remaining;
      partialExits.push({
        tier: tier1Hit ? 2 : 1, // Tier 라벨은 위치보다 stop 처리
        candleOffset: i - signalIdx,
        price: stopLoss,
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
        maxFavorable: ((maxHigh - entryPrice) / entryPrice) * 100,
        maxAdverse: ((entryPrice - minLow) / entryPrice) * 100,
        win: finalReturn > 0,
        holdingCandles: lastCandleIdx - signalIdx,
        partialExits,
      };
    }

    // 2. Tier 2 도달 (bbUpper 또는 entry × 1.05 중 작은 값)
    if (c.high >= target2) {
      const tier2Return = ((target2 - entryPrice) / entryPrice) * 100;
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
        maxFavorable: ((maxHigh - entryPrice) / entryPrice) * 100,
        maxAdverse: ((entryPrice - minLow) / entryPrice) * 100,
        win: weightedReturnPct > 0,
        holdingCandles: lastCandleIdx - signalIdx,
        partialExits,
      };
    }

    // 3. Tier 1 도달 (bbMiddle) — 첫 도달 시 50% 부분 청산
    if (!tier1Hit && c.high >= target1) {
      tier1Hit = true;
      const tier1Ratio = 0.5;
      tier1ReturnPct = ((target1 - entryPrice) / entryPrice) * 100;
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
      // Tier 1 도달 후에도 잔여 50% 는 계속 Tier 2 / Stop / 만료 대기
    }
  }

  // 윈도우 만료 — 잔여 포지션 마지막 close 로 청산
  const lastCandle = candles[endIdx];
  const expireReturn = ((lastCandle.close - entryPrice) / entryPrice) * 100;
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
    maxFavorable: ((maxHigh - entryPrice) / entryPrice) * 100,
    maxAdverse: ((entryPrice - minLow) / entryPrice) * 100,
    win: weightedReturnPct > 0,
    holdingCandles: endIdx - signalIdx,
    partialExits,
  };
}

// ─────────────────────────────────────────────────────────
// Higher-TF context (look-ahead safe)
// ─────────────────────────────────────────────────────────

/**
 * 같은 TF 캔들로 Higher-TF context 를 근사:
 *   SMA(50) 의 방향성 + 현재가 위치
 *
 * Bullish 조건:
 *   - 현재가 > SMA(50)
 *   - SMA(50) 이 상승 추세 (현재 SMA - 20캔들 전 SMA > 0.5%)
 *
 * (별도 1D 캔들 fetch 없이도 추세 noise 일부 차단 가능. 진짜 1D 분석은
 *  cli.ts 에 데이터 로더 확장 후 multi-tf trend engine 통합 예정.)
 */
function checkHigherTfBullish(candles: Candle[], idx: number): boolean {
  if (idx < 50) return true; // warmup 부족 → 통과 (보수적이지 않음)
  const slice = candles.slice(Math.max(0, idx - 49), idx + 1);
  const closes = slice.map((c) => c.close);
  const smaCurrent = closes.reduce((a, b) => a + b, 0) / closes.length;

  // 20 캔들 전 SMA(50) 비교 위해 idx-20 시점의 SMA 계산
  const idxBack = idx - 20;
  if (idxBack < 50) return candles[idx].close >= smaCurrent;
  const sliceBack = candles.slice(Math.max(0, idxBack - 49), idxBack + 1);
  const closesBack = sliceBack.map((c) => c.close);
  const smaBack = closesBack.reduce((a, b) => a + b, 0) / closesBack.length;

  const slope = (smaCurrent - smaBack) / smaBack; // 상승률
  const priceAbove = candles[idx].close >= smaCurrent;

  // BEARISH 차단: SMA 가 -1% 이상 하락 + 가격이 SMA 아래
  if (slope < -0.01 && !priceAbove) return false;

  return true; // 그 외는 진입 허용 (sideways 도 진입)
}

// ─────────────────────────────────────────────────────────
// Main extractor
// ─────────────────────────────────────────────────────────

/**
 * 단일 심볼의 전체 캔들에서 BBDX 시그널을 추출하고
 * 각 시그널의 outcome 을 측정한다.
 *
 * v6.5 Phase 1 진입 게이트:
 *   1. isEntrySignal (RSI 30~35, BB lower, ADX ≤ 30)
 *   2. Falling Knife (-DI > +DI && ADX > 25 → 차단)
 *   3. Pattern Confluence ≥ 0.4 (NEW)
 *   4. Higher-TF SMA(50) Bullish (NEW, BEARISH 차단)
 *
 * @param symbol   심볼 (e.g. "BTCUSDT")
 * @param candles  해당 심볼의 전체 캔들 (oldest → newest)
 * @param config   백테스트 설정
 */
export function extractSignalsFromCandles(
  symbol: string,
  candles: Candle[],
  config: BacktestConfig,
): BacktestTrade[] {
  const { tf, minWarmupCandles, outcomeWindowCandles, cooldownCandles } = config;

  const trades: BacktestTrade[] = [];
  const maxSignalIdx = candles.length - outcomeWindowCandles - 1;

  if (maxSignalIdx < minWarmupCandles) {
    console.warn(
      `[Extractor] ${symbol}: 캔들 수 부족 ` +
        `(${candles.length} < ${minWarmupCandles + outcomeWindowCandles}), 스킵`,
    );
    return [];
  }

  let lastSignalIdx = -Infinity;

  for (let i = minWarmupCandles; i <= maxSignalIdx; i++) {
    if (i - lastSignalIdx < cooldownCandles) continue;

    // ── Lookahead-free: candles[0..i] 만 사용 ────────────
    const windowCandles = candles.slice(Math.max(0, i - 199), i + 1);
    const indicators = calculateAllIndicators(windowCandles);
    const price = candles[i].close;

    // Gate 1: 기본 BBDX 진입 조건
    if (!isEntrySignal(price, indicators)) continue;

    // Gate 2: Falling Knife 필터
    if (indicators.minusDi > indicators.plusDi && indicators.adx > 25) continue;

    // Gate 3 (NEW): Pattern Confluence — bullish score ≥ 0.4
    const allPatterns = detectAllCandlePatterns(windowCandles);
    const bullishPatterns = allPatterns.filter((p) => p.bias === "bullish");
    const patternConfluenceScore = aggregatePatternScore(bullishPatterns);
    if (patternConfluenceScore < 0.4) continue;

    // Gate 4 (NEW): Higher-TF SMA(50) Bullish
    const higherTfBullish = checkHigherTfBullish(candles, i);
    if (!higherTfBullish) continue;

    // ── 진입 파라미터 (v6.5 Phase 1: tiered) ─────────────
    const entryPrice = price;
    const target1 = indicators.bbMiddle; // Tier 1 (50%)
    const target2 = Math.min(indicators.bbUpper, entryPrice * 1.05); // Tier 2 (full)
    const stopLoss = Math.max(indicators.bbLower * 0.97, entryPrice * 0.98);
    const signalStrength = calculateSignalStrength(price, indicators);

    // ── v6.5 Phase 2: Modifier multipliers (헌장 규칙 3) ──
    // 헌장 규칙 3 준수: 차단 X. 추적만 해서 calibration 데이터로 활용.
    // 향후 Phase 3 calibration 결과로 곱셈 통합 임계값 자동 도출.
    let emaRibbonMult = 1.0;
    let macdDivergenceMult = 1.0;
    let orderBlockMult = 1.0;
    try {
      emaRibbonMult = computeEmaRibbon(windowCandles).multiplier;
      macdDivergenceMult = detectMacdDivergence(windowCandles).multiplier;
      orderBlockMult = detectOrderBlock(windowCandles).multiplier;
    } catch {
      // graceful — modifier 실패가 백테스트를 깨지 않도록
    }
    const modifiersProduct = emaRibbonMult * macdDivergenceMult * orderBlockMult;
    const adjustedConfidence = signalStrength * modifiersProduct;

    // ── Outcome 측정 (candles[i+1..] 만 사용) ─────────────
    const outcome = measureOutcomeTiered(
      candles,
      i,
      entryPrice,
      target1,
      target2,
      stopLoss,
      outcomeWindowCandles,
    );

    const trade: BacktestTrade = {
      signalTs: candles[i].openTime,
      symbol,
      tf,
      entryPrice,
      target: target1,
      target2,
      stopLoss,
      signalStrength,
      rsi: indicators.rsi,
      bbLower: indicators.bbLower,
      bbMiddle: indicators.bbMiddle,
      bbUpper: indicators.bbUpper,
      adx: indicators.adx,
      plusDi: indicators.plusDi,
      minusDi: indicators.minusDi,
      patternConfluenceScore,
      higherTfBullish,
      emaRibbonMult,
      macdDivergenceMult,
      orderBlockMult,
      modifiersProduct,
      adjustedConfidence,
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
