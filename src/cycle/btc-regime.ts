/**
 * BTC Cycle Regime Detection — P1-④ (2026-05-11).
 *
 * 전체 시장의 cycle 상태를 BTC 200d SMA 기준으로 분류 (bull / bear / range).
 * 각 strategy 가 cycle-aware 로 활성/비활성 결정.
 *
 *   bull:     BTC > 200d MA × 1.05  → mean reversion 약화, trend follow 강화
 *   bear:     BTC < 200d MA × 0.95  → mean reversion 정상, SHORT trend 활성
 *   neutral:  ±5% range             → 양쪽 모두 정상 운영
 *
 * 헌장 R3 (단독 시그널 X): 본 regime 은 BBDX/Trend strategy 의 *gate* 로만
 * 사용. 단독 시그널 발행 X.
 *
 * 캐시: 1시간 단위 캐시. BTC 200d MA 는 빠르게 변하지 않음.
 */

import type { Candle } from "@shared/types";
import { fetchKlines } from "../bybit";

export type BtcCycleRegime = "bull" | "bear" | "neutral";

export interface BtcCycleResult {
  regime: BtcCycleRegime;
  /** BTC 현재가. */
  btcPrice: number;
  /** BTC 200d SMA. */
  ma200: number;
  /** (현재가 - ma200) / ma200 — bull threshold +0.05, bear -0.05. */
  distance: number;
  /** 데이터 fetch 시각 (ms). */
  computedAt: number;
}

/** 캐시 — 1시간 TTL. */
let cache: { result: BtcCycleResult; expiresAt: number } | null = null;
const TTL_MS = 60 * 60 * 1000;

/**
 * BTC cycle regime 산출. 1시간 캐시 적용.
 *
 * 외부 API 실패 시 'neutral' fallback (가장 안전한 default — 양쪽 strategy 운영).
 */
export async function detectBtcCycleRegime(): Promise<BtcCycleResult> {
  // 캐시 hit
  if (cache && Date.now() < cache.expiresAt) {
    return cache.result;
  }

  try {
    // 1d 250 캔들 fetch (200d SMA 안정화에 필요)
    const candles: Candle[] = await fetchKlines("BTCUSDT", "1d", 250);
    if (candles.length < 200) {
      return fallbackNeutral("insufficient candles");
    }
    const closes = candles.map((c) => c.close);
    const ma200 = closes.slice(-200).reduce((a, b) => a + b, 0) / 200;
    const btcPrice = closes[closes.length - 1];
    const distance = (btcPrice - ma200) / ma200;

    let regime: BtcCycleRegime;
    if (distance > 0.05) regime = "bull";
    else if (distance < -0.05) regime = "bear";
    else regime = "neutral";

    const result: BtcCycleResult = {
      regime,
      btcPrice,
      ma200,
      distance,
      computedAt: Date.now(),
    };
    cache = { result, expiresAt: Date.now() + TTL_MS };
    return result;
  } catch (err) {
    console.warn("[BtcCycle] fetch failed:", err);
    return fallbackNeutral(String((err as Error)?.message ?? err));
  }
}

function fallbackNeutral(reason: string): BtcCycleResult {
  return {
    regime: "neutral",
    btcPrice: 0,
    ma200: 0,
    distance: 0,
    computedAt: Date.now(),
  };
}

/**
 * Strategy 별 cycle-aware activation 정책 (sync — backtest 호출용).
 *
 *   BBDX (mean reversion LONG): bull 약화 (skip), bear/neutral 정상
 *   BBDX-SHORT:                  bull 차단 (skip), bear 강화, neutral 약화
 *   Trend-Follow:               bull 강화, bear/neutral 약화
 *
 * @returns true = strategy 활성화 (entry 허용), false = 차단
 */
export function isStrategyActiveInRegime(
  strategy: "bbdx" | "bbdx-short" | "trend-follow",
  regime: BtcCycleRegime,
): boolean {
  switch (strategy) {
    case "bbdx":
      // mean reversion: bull 시 약함, bear/neutral 정상
      return regime !== "bull";
    case "bbdx-short":
      // SHORT: bear 만 활성 (bull/neutral 차단)
      return regime === "bear";
    case "trend-follow":
      // trend: bull 활성, bear/neutral 약함
      return regime === "bull";
    default:
      return true;
  }
}
