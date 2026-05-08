/**
 * CoinGecko Global Market — 시총 / BTC 도미넌스 / 24h 시총 변화
 *
 *   GET https://api.coingecko.com/api/v3/global
 *
 * 무료, 키 불필요. 응답:
 *   { data: { total_market_cap: { usd, ... }, market_cap_percentage: { btc, eth, ... },
 *             market_cap_change_percentage_24h_usd, ... } }
 */

import axios from "axios";
import type { GlobalMarketData } from "./types";

const URL = "https://api.coingecko.com/api/v3/global";

interface RawGlobal {
  data: {
    total_market_cap: Record<string, number>;
    market_cap_percentage: Record<string, number>;
    market_cap_change_percentage_24h_usd: number;
  };
}

let cache: { ts: number; data: GlobalMarketData } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1시간

export async function fetchGlobalMarket(): Promise<GlobalMarketData> {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) return cache.data;

  const resp = await axios.get<RawGlobal>(URL, {
    timeout: 8000,
    headers: { "User-Agent": "tradelab-sentiment/1.0" },
  });

  const d = resp.data.data;
  const data: GlobalMarketData = {
    totalMarketCapUsd: d.total_market_cap?.usd ?? 0,
    marketCapChange24h: d.market_cap_change_percentage_24h_usd ?? 0,
    btcDominance: d.market_cap_percentage?.btc ?? 0,
    ethDominance: d.market_cap_percentage?.eth ?? 0,
  };
  cache = { ts: Date.now(), data };
  return data;
}
