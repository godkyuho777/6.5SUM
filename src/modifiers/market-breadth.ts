/**
 * Market Breadth Modifier — 명세서 §7.
 *
 * 96개 코인 universe 일괄 RSI / EMA(200) 위치 / 24h 변화율 계산 후
 * 5단계 sentiment 분류:
 *
 *   rsiBelow30Pct > 0.6  → panic     → 1.30 (역행 베팅, LONG 가산)
 *   rsiBelow30Pct > 0.3  → fear      → 1.10
 *   rsiAbove70Pct > 0.5  → euphoria  → 0.60 (천장 근접, LONG 약화)
 *   rsiAbove70Pct > 0.3  → greed     → 0.90
 *   else                 → neutral   → 1.00
 *
 * 역행 베팅(contrarian) 철학 — 사용자 호불호 갈릴 수 있어 옵션 토글 권장.
 *
 * 차원 6 (macro — 시장 전체 sentiment). Wave Tracker 와 같은 차원이지만
 * 측정 각도 다름 (펀딩/OI 기반 vs RSI 분포 기반).
 *
 * 캐시 5분 (TF 별).
 */

import { fetchKlines } from "../bybit";
import { calculateRSI, calculateEMA } from "../indicators";
import type { ModifierResult } from "./types";
import { neutralModifier, clampMultiplier } from "./types";

export type MarketBreadthSentiment =
  | "panic"
  | "fear"
  | "neutral"
  | "greed"
  | "euphoria";

export interface MarketBreadthResult extends ModifierResult {
  sentiment: MarketBreadthSentiment;
  breakdown: {
    totalCoins: number;
    rsiBelow30Pct: number;
    rsiAbove70Pct: number;
    aboveEMA200Pct: number;
  };
}

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  result: MarketBreadthResult;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

function classifySentiment(
  rsiBelow30Pct: number,
  rsiAbove70Pct: number
): MarketBreadthSentiment {
  if (rsiBelow30Pct > 0.6) return "panic";
  if (rsiAbove70Pct > 0.5) return "euphoria";
  if (rsiBelow30Pct > 0.3) return "fear";
  if (rsiAbove70Pct > 0.3) return "greed";
  return "neutral";
}

function sentimentToMultiplier(sentiment: MarketBreadthSentiment): number {
  switch (sentiment) {
    case "panic":
      return 1.30;
    case "fear":
      return 1.10;
    case "neutral":
      return 1.00;
    case "greed":
      return 0.90;
    case "euphoria":
      return 0.60;
  }
}

/**
 * 단일 심볼의 RSI / EMA200 / 24h 변화율 계산. throw X — 실패 시 null.
 */
async function fetchSymbolStats(
  symbol: string,
  tf: "1h" | "4h" | "1d"
): Promise<{ rsi: number; aboveEMA200: boolean } | null> {
  try {
    const candles = await fetchKlines(symbol, tf, 250);
    if (!candles || candles.length < 200) return null;
    const closes = candles.map((c) => c.close);
    const rsi = calculateRSI(closes, 14);
    const ema200 = calculateEMA(closes, 200);
    const lastClose = closes[closes.length - 1];
    return {
      rsi,
      aboveEMA200: lastClose > ema200,
    };
  } catch (err: any) {
    console.warn(
      `[Modifier:breadth] ${symbol} ${tf} fetch failed: ${String(err?.message ?? err)}`
    );
    return null;
  }
}

/**
 * Market Breadth modifier.
 *
 * @param symbols universe (보통 TOP_COINS). 호출자가 슬라이스 가능.
 * @param tf 타임프레임 (1h | 4h | 1d).
 *
 * 모든 심볼 fetch 실패 시 status="stub", multiplier=1.0 반환.
 * 외부 호출 throw X — 호출 체인 안전.
 */
export async function computeMarketBreadth(
  symbols: string[],
  tf: "1h" | "4h" | "1d" = "4h"
): Promise<MarketBreadthResult> {
  const cacheKey = `${tf}:${symbols.length}:${symbols[0] ?? ""}:${symbols[symbols.length - 1] ?? ""}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }

  if (!symbols || symbols.length === 0) {
    const empty: MarketBreadthResult = {
      ...neutralModifier(6, "Market Breadth — 빈 universe", "stub"),
      sentiment: "neutral",
      breakdown: {
        totalCoins: 0,
        rsiBelow30Pct: 0,
        rsiAbove70Pct: 0,
        aboveEMA200Pct: 0,
      },
    };
    return empty;
  }

  // 병렬 fetch — Promise.all 이지만 fetchSymbolStats 가 throw X.
  const stats = await Promise.all(symbols.map((s) => fetchSymbolStats(s, tf)));
  const valid = stats.filter((s): s is NonNullable<typeof s> => s != null);

  if (valid.length === 0) {
    const stub: MarketBreadthResult = {
      ...neutralModifier(
        6,
        `Market Breadth — 모든 심볼 fetch 실패 (${symbols.length} 시도)`,
        "stub"
      ),
      sentiment: "neutral",
      breakdown: {
        totalCoins: symbols.length,
        rsiBelow30Pct: 0,
        rsiAbove70Pct: 0,
        aboveEMA200Pct: 0,
      },
    };
    cache.set(cacheKey, { result: stub, timestamp: now });
    return stub;
  }

  const total = valid.length;
  const rsiBelow30 = valid.filter((s) => s.rsi < 30).length;
  const rsiAbove70 = valid.filter((s) => s.rsi > 70).length;
  const aboveEMA200 = valid.filter((s) => s.aboveEMA200).length;

  const rsiBelow30Pct = rsiBelow30 / total;
  const rsiAbove70Pct = rsiAbove70 / total;
  const aboveEMA200Pct = aboveEMA200 / total;

  const sentiment = classifySentiment(rsiBelow30Pct, rsiAbove70Pct);
  const multiplier = clampMultiplier(sentimentToMultiplier(sentiment));

  const result: MarketBreadthResult = {
    multiplier,
    rawScore: Math.round((aboveEMA200Pct - 0.5) * 200), // -100~+100 응용
    reason: `Market Breadth ${sentiment} — RSI<30: ${(rsiBelow30Pct * 100).toFixed(0)}%, RSI>70: ${(rsiAbove70Pct * 100).toFixed(0)}%, >EMA200: ${(aboveEMA200Pct * 100).toFixed(0)}%`,
    dimension: 6,
    status: "real",
    sentiment,
    breakdown: {
      totalCoins: total,
      rsiBelow30Pct,
      rsiAbove70Pct,
      aboveEMA200Pct,
    },
  };

  cache.set(cacheKey, { result, timestamp: now });
  return result;
}

/** 테스트 용. */
export function __clearBreadthCache(): void {
  cache.clear();
}
