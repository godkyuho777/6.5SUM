/**
 * Signal Extractor — Lookahead-free Signal Replay
 *
 * 핵심 원칙: NO LOOKAHEAD BIAS
 * - 캔들 i의 시그널 판단: candles[0..i] 만 사용
 * - 캔들 i의 결과 측정: candles[i+1..i+outcomeWindow] 만 사용
 * - 두 데이터 집합이 절대 섞이지 않음
 *
 * 기존 indicators.ts의 isEntrySignal / calculateAllIndicators 를
 * 그대로 재사용한다.
 */

import type { Candle } from "@shared/types";
import {
  calculateAllIndicators,
  isEntrySignal,
  calculateSignalStrength,
} from "../indicators";
import type { BacktestConfig, BacktestTrade, ExitReason } from "./types";

// ─────────────────────────────────────────────────────────
// Outcome measurement
// ─────────────────────────────────────────────────────────

interface OutcomeResult {
  exitPrice: number;
  exitTs: number;
  exitReason: ExitReason;
  returnPct: number;
  maxFavorable: number;
  maxAdverse: number;
  win: boolean;
  holdingCandles: number;
}

/**
 * 시그널 발생 이후 candles[signalIdx+1 .. signalIdx+window] 에서
 * 목표가 또는 손절가 도달 여부를 측정한다.
 *
 * @param candles  전체 캔들 배열 (시간순)
 * @param signalIdx 시그널 발생 인덱스
 * @param entryPrice 진입 가격 (시그널 캔들 close)
 * @param target  목표가 (bbMiddle at signal)
 * @param stopLoss 손절가 (bbLower × 0.97)
 * @param window  최대 측정 캔들 수
 */
function measureOutcome(
  candles: Candle[],
  signalIdx: number,
  entryPrice: number,
  target: number,
  stopLoss: number,
  window: number
): OutcomeResult {
  const endIdx = Math.min(signalIdx + window, candles.length - 1);
  let maxHigh = entryPrice;
  let minLow = entryPrice;

  for (let i = signalIdx + 1; i <= endIdx; i++) {
    const c = candles[i];

    // 고점/저점 추적 (MFE / MAE 계산용)
    if (c.high > maxHigh) maxHigh = c.high;
    if (c.low < minLow) minLow = c.low;

    // 목표가 먼저 도달하면 WIN
    if (c.high >= target) {
      const returnPct = ((target - entryPrice) / entryPrice) * 100;
      return {
        exitPrice: target,
        exitTs: c.openTime,
        exitReason: "target_hit",
        returnPct,
        maxFavorable: ((maxHigh - entryPrice) / entryPrice) * 100,
        maxAdverse: ((entryPrice - minLow) / entryPrice) * 100,
        win: true,
        holdingCandles: i - signalIdx,
      };
    }

    // 손절가 도달 (캔들 저가 기준)
    if (c.low <= stopLoss) {
      const returnPct = ((stopLoss - entryPrice) / entryPrice) * 100;
      return {
        exitPrice: stopLoss,
        exitTs: c.openTime,
        exitReason: "stop_loss",
        returnPct,
        maxFavorable: ((maxHigh - entryPrice) / entryPrice) * 100,
        maxAdverse: ((entryPrice - minLow) / entryPrice) * 100,
        win: false,
        holdingCandles: i - signalIdx,
      };
    }
  }

  // 윈도우 만료 — 마지막 close로 청산
  const lastCandle = candles[endIdx];
  const returnPct = ((lastCandle.close - entryPrice) / entryPrice) * 100;
  return {
    exitPrice: lastCandle.close,
    exitTs: lastCandle.openTime,
    exitReason: "window_expired",
    returnPct,
    maxFavorable: ((maxHigh - entryPrice) / entryPrice) * 100,
    maxAdverse: ((entryPrice - minLow) / entryPrice) * 100,
    win: false,
    holdingCandles: endIdx - signalIdx,
  };
}

// ─────────────────────────────────────────────────────────
// Main extractor
// ─────────────────────────────────────────────────────────

/**
 * 단일 심볼의 전체 캔들에서 BBDX 시그널을 추출하고
 * 각 시그널의 outcome을 측정한다.
 *
 * @param symbol   심볼 (e.g. "BTCUSDT")
 * @param candles  해당 심볼의 전체 캔들 (oldest → newest)
 * @param config   백테스트 설정
 */
export function extractSignalsFromCandles(
  symbol: string,
  candles: Candle[],
  config: BacktestConfig
): BacktestTrade[] {
  const {
    tf,
    minWarmupCandles,
    outcomeWindowCandles,
    cooldownCandles,
  } = config;

  const trades: BacktestTrade[] = [];

  // 결과 측정 윈도우를 남겨두어야 하므로 마지막 window 캔들은 진입 불가
  const maxSignalIdx = candles.length - outcomeWindowCandles - 1;

  if (maxSignalIdx < minWarmupCandles) {
    console.warn(
      `[Extractor] ${symbol}: 캔들 수 부족 ` +
      `(${candles.length} < ${minWarmupCandles + outcomeWindowCandles}), 스킵`
    );
    return [];
  }

  let lastSignalIdx = -Infinity; // cooldown 추적

  for (let i = minWarmupCandles; i <= maxSignalIdx; i++) {
    // Cooldown: 직전 시그널로부터 N캔들 이내 재진입 금지
    if (i - lastSignalIdx < cooldownCandles) continue;

    // ── Lookahead-free: candles[0..i] 만 사용 ────────────
    // 지표 계산에 너무 긴 슬라이스는 성능 낭비 → 최근 200캔들로 제한
    const windowCandles = candles.slice(Math.max(0, i - 199), i + 1);
    const indicators = calculateAllIndicators(windowCandles);
    const price = candles[i].close;

    // 시그널 체크
    if (!isEntrySignal(price, indicators)) continue;

    // Falling Knife 필터: -DI > +DI AND ADX > 25 → 강한 하락추세 진입 차단
    if (indicators.minusDi > indicators.plusDi && indicators.adx > 25) continue;

    // ── 진입 파라미터 계산 ────────────────────────────────
    const entryPrice = price;
    const target = indicators.bbMiddle;
    const stopLoss = indicators.bbLower * 0.97;
    const signalStrength = calculateSignalStrength(price, indicators);

    // ── Outcome 측정 (candles[i+1..] 만 사용) ─────────────
    const outcome = measureOutcome(
      candles,
      i,
      entryPrice,
      target,
      stopLoss,
      outcomeWindowCandles
    );

    const trade: BacktestTrade = {
      signalTs: candles[i].openTime,
      symbol,
      tf,
      entryPrice,
      target,
      stopLoss,
      signalStrength,
      rsi: indicators.rsi,
      bbLower: indicators.bbLower,
      bbMiddle: indicators.bbMiddle,
      bbUpper: indicators.bbUpper,
      adx: indicators.adx,
      plusDi: indicators.plusDi,
      minusDi: indicators.minusDi,
      ...outcome,
    };

    trades.push(trade);
    lastSignalIdx = i;
  }

  return trades;
}

/**
 * 여러 심볼의 캔들 맵에서 전체 트레이드를 추출한다.
 */
export function extractAllSignals(
  candleMap: Map<string, Candle[]>,
  config: BacktestConfig,
  onProgress?: (done: number, total: number, symbol: string) => void
): BacktestTrade[] {
  const allTrades: BacktestTrade[] = [];
  const symbols = [...candleMap.keys()];

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    const candles = candleMap.get(symbol)!;
    const trades = extractSignalsFromCandles(symbol, candles, config);
    allTrades.push(...trades);
    onProgress?.(i + 1, symbols.length, symbol);
  }

  // 시간순 정렬
  allTrades.sort((a, b) => a.signalTs - b.signalTs);
  return allTrades;
}
