/**
 * Wave Tracker — Sentiment & Matrix entry point
 *
 * 4개 외부 API 병렬 호출 → Composite Sentiment + Wave Matrix.
 * 명세서 WAVE_SENTIMENT_MATRIX.md §9.2 계산 순서 그대로.
 */

import { fetchFearGreed } from "./fear-greed";
import { fetchGlobalMarket } from "./coingecko-global";
import { fetchBybitDerivatives } from "./bybit-derivatives";
import { fetchLongShortRatio } from "./bybit-long-short";
import { computeComposite } from "./sentiment-score";
import { computeWaveMatrix } from "./wave-matrix";
import type { SentimentSnapshot, WaveMatrixState } from "./types";

export interface CombinedSentiment {
  sentiment: SentimentSnapshot;
  matrix: WaveMatrixState;
}

/**
 * Combined endpoint — 4개 API 병렬 + composite + matrix.
 *
 * @param symbol Bybit perpetual symbol (default BTCUSDT)
 */
export async function computeWaveTrackerData(
  symbol: string = "BTCUSDT"
): Promise<CombinedSentiment> {
  const sym = symbol.toUpperCase();

  // 4개 fetch 를 병렬로 (일부 실패해도 가능한 데이터로 진행)
  const [fngRes, globalRes, derivRes, lsRes] = await Promise.allSettled([
    fetchFearGreed(30),
    fetchGlobalMarket(),
    fetchBybitDerivatives(sym),
    fetchLongShortRatio(sym, "1h"),
  ]);

  const fng = fngRes.status === "fulfilled" ? fngRes.value : [];
  const global =
    globalRes.status === "fulfilled"
      ? globalRes.value
      : { totalMarketCapUsd: 0, marketCapChange24h: 0, btcDominance: 0, ethDominance: 0 };
  const deriv =
    derivRes.status === "fulfilled"
      ? derivRes.value
      : { symbol: sym, oiChangeRate: 0, fundingRateAvg: 0, priceChange24h: 0, lastPrice: 0 };
  const ls =
    lsRes.status === "fulfilled"
      ? lsRes.value
      : { symbol: sym, longRatio: 50, shortRatio: 50, ratio: 1 };

  const sentiment = computeComposite(fng, global, deriv, ls);
  const matrix = computeWaveMatrix(deriv, ls, sentiment.compositeScore, sentiment.fearGreed.value);

  return { sentiment, matrix };
}

export type { SentimentSnapshot, WaveMatrixState } from "./types";
