/**
 * Bybit Long/Short Ratio
 *
 * 무료, 키 불필요.
 *   GET /v5/market/account-ratio?category=linear&symbol=BTCUSDT&period=1h&limit=1
 *
 * 응답 스키마:
 *   result.list: [{ symbol, buyRatio: "0.5234", sellRatio: "0.4766", timestamp: "..." }]
 *   buyRatio + sellRatio = 1
 */

import axios from "axios";
import type { BybitLongShortData } from "./types";

const URL = "https://api.bybit.com/v5/market/account-ratio";

interface Resp {
  result: {
    list: Array<{ symbol: string; buyRatio: string; sellRatio: string; timestamp: string }>;
  };
}

const cache = new Map<string, { ts: number; data: BybitLongShortData }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function fetchLongShortRatio(
  symbol: string,
  period = "1h"
): Promise<BybitLongShortData> {
  const cached = cache.get(`${symbol}:${period}`);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  try {
    const resp = await axios.get<Resp>(URL, {
      params: { category: "linear", symbol, period, limit: 1 },
      timeout: 6000,
    });
    const item = resp.data.result?.list?.[0];
    if (!item) {
      const fallback: BybitLongShortData = {
        symbol,
        longRatio: 50,
        shortRatio: 50,
        ratio: 1,
      };
      return fallback;
    }
    const longRatio = Number(item.buyRatio) * 100;
    const shortRatio = Number(item.sellRatio) * 100;
    const ratio = shortRatio > 0 ? longRatio / shortRatio : 1;
    const data: BybitLongShortData = {
      symbol,
      longRatio,
      shortRatio,
      ratio,
    };
    cache.set(`${symbol}:${period}`, { ts: Date.now(), data });
    return data;
  } catch {
    return { symbol, longRatio: 50, shortRatio: 50, ratio: 1 };
  }
}

/** v4.3 — 마지막 fetch timestamp (source health 추적). */
export function getLongShortCacheTs(symbol: string, period = "1h"): number {
  return cache.get(`${symbol}:${period}`)?.ts ?? 0;
}
