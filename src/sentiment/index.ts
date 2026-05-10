/**
 * Wave Tracker — Sentiment & Matrix entry point
 *
 * 4개 외부 API 병렬 호출 → Composite Sentiment + Wave Matrix + Source Health.
 * 명세서 WAVE_SENTIMENT_MATRIX.md §9.2 + WAVE_SENTIMENT_PHASE_C_D.md §2.1.
 */

import { fetchFearGreed, getFearGreedCacheTs } from "./fear-greed";
import { fetchGlobalMarket, getGlobalMarketCacheTs } from "./coingecko-global";
import { fetchBybitDerivatives, getDerivativesCacheAge } from "./bybit-derivatives";
import { fetchLongShortRatio, getLongShortCacheTs } from "./bybit-long-short";
import { computeComposite } from "./sentiment-score";
import { computeWaveMatrix } from "./wave-matrix";
import type {
  SentimentSnapshot,
  WaveMatrixState,
  SourceHealth,
  SourceHealthEntry,
  SourceStatus,
} from "./types";

export interface CombinedSentiment {
  sentiment: SentimentSnapshot;
  matrix: WaveMatrixState;
  /** v4.3 — 4개 외부 API 의 데이터 무결성 메타. */
  sourceHealth: SourceHealth;
}

// ─── v4.3 — Source Health helpers ────────────────────────────

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5분 — live → stale 경계
const FALLBACK_THRESHOLD_MS = 30 * 60 * 1000; // 30분 — stale → fallback 경계

function classifyAge(ts: number, fetchSucceeded: boolean): SourceStatus {
  if (!fetchSucceeded || ts === 0) return "fallback";
  const age = Date.now() - ts;
  if (age < STALE_THRESHOLD_MS) return "live";
  if (age < FALLBACK_THRESHOLD_MS) return "stale";
  return "fallback";
}

function makeHealthEntry(ts: number, fetchSucceeded: boolean): SourceHealthEntry {
  const status = classifyAge(ts, fetchSucceeded);
  const ageSec =
    status === "fallback" || ts === 0
      ? Number.MAX_SAFE_INTEGER
      : Math.floor((Date.now() - ts) / 1000);
  return { status, lastUpdated: ts, ageSec };
}

/**
 * Combined endpoint — 4개 API 병렬 + composite + matrix + sourceHealth.
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

  const fngSucceeded = fngRes.status === "fulfilled" && fngRes.value.length > 0;
  const globalSucceeded = globalRes.status === "fulfilled";
  const derivSucceeded = derivRes.status === "fulfilled";
  const lsSucceeded = lsRes.status === "fulfilled";

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
  // v4.2: marketPhase 를 wave-matrix 에 전달 → DEFENSIVE 분류에 phase=PANIC 사용.
  const matrix = computeWaveMatrix(
    deriv,
    ls,
    sentiment.compositeScore,
    sentiment.fearGreed.value,
    sentiment.marketPhase
  );

  // ── v4.3 Phase D — Source Health metadata ────────────────────
  // 각 모듈의 cache timestamp 를 조회 → live/stale/fallback 분류.
  const fngTs = getFearGreedCacheTs();
  const globalTs = getGlobalMarketCacheTs();
  const derivAge = getDerivativesCacheAge(sym);
  const derivTs =
    derivAge === Infinity ? 0 : Date.now() - derivAge;
  const lsTs = getLongShortCacheTs(sym, "1h");

  const fngHealth = makeHealthEntry(fngTs, fngSucceeded);
  const globalHealth = makeHealthEntry(globalTs, globalSucceeded);
  const derivHealth = makeHealthEntry(derivTs, derivSucceeded);
  const lsHealth = makeHealthEntry(lsTs, lsSucceeded);

  const liveCount = [fngHealth, globalHealth, derivHealth, lsHealth].filter(
    (h) => h.status === "live"
  ).length;

  const sourceHealth: SourceHealth = {
    fearGreed: fngHealth,
    globalMarket: globalHealth,
    bybitDerivatives: derivHealth,
    bybitLongShort: lsHealth,
    healthScore: liveCount,
  };

  return { sentiment, matrix, sourceHealth };
}

export type {
  SentimentSnapshot,
  WaveMatrixState,
  SourceHealth,
  SourceHealthEntry,
  SourceStatus,
} from "./types";
export type { MacroStance, MacroStanceResult } from "./macro-stance";
