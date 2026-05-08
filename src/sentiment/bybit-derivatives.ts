/**
 * Bybit V5 — Open Interest + Funding Rate + 24h price change
 *
 * 무료, 키 불필요.
 *   - OI:      GET /v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=1h&limit=24
 *   - Funding: GET /v5/market/funding/history?category=linear&symbol=BTCUSDT&limit=10
 *   - Ticker:  GET /v5/market/tickers?category=linear&symbol=BTCUSDT
 *
 * 24h OI 변화율 = (현재 OI - 24h 전 OI) / 24h 전 OI × 100
 * Funding rate 평균 = 최근 N개 펀딩 평균 (보통 1 funding interval = 8h)
 */

import axios from "axios";
import type { BybitDerivativesData } from "./types";

const BASE = "https://api.bybit.com";

const cache = new Map<string, { ts: number; data: BybitDerivativesData }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분

interface OiResp {
  result: {
    list: Array<{ openInterest: string; timestamp: string }>;
  };
}

interface FundingResp {
  result: {
    list: Array<{ symbol: string; fundingRate: string; fundingRateTimestamp: string }>;
  };
}

interface TickerResp {
  result: {
    list: Array<{
      symbol: string;
      lastPrice: string;
      price24hPcnt: string; // 0.0234 = +2.34%
    }>;
  };
}

async function fetchOi24h(symbol: string): Promise<number> {
  const resp = await axios.get<OiResp>(`${BASE}/v5/market/open-interest`, {
    params: { category: "linear", symbol, intervalTime: "1h", limit: 24 },
    timeout: 6000,
  });
  const list = resp.data.result?.list ?? [];
  if (list.length < 2) return 0;
  // Bybit 응답은 시간 *내림차순* (최신이 [0])
  const latest = Number(list[0].openInterest);
  const oldest = Number(list[list.length - 1].openInterest);
  if (oldest === 0) return 0;
  return ((latest - oldest) / oldest) * 100;
}

async function fetchFundingAvg(symbol: string, n = 3): Promise<number> {
  const resp = await axios.get<FundingResp>(`${BASE}/v5/market/funding/history`, {
    params: { category: "linear", symbol, limit: n },
    timeout: 6000,
  });
  const list = resp.data.result?.list ?? [];
  if (list.length === 0) return 0;
  const avg = list.reduce((s, x) => s + Number(x.fundingRate), 0) / list.length;
  return avg * 100; // % 단위
}

async function fetchTicker(symbol: string): Promise<{ lastPrice: number; price24hPct: number }> {
  const resp = await axios.get<TickerResp>(`${BASE}/v5/market/tickers`, {
    params: { category: "linear", symbol },
    timeout: 6000,
  });
  const item = resp.data.result?.list?.[0];
  if (!item) return { lastPrice: 0, price24hPct: 0 };
  return {
    lastPrice: Number(item.lastPrice),
    price24hPct: Number(item.price24hPcnt) * 100, // ratio → %
  };
}

export async function fetchBybitDerivatives(
  symbol: string
): Promise<BybitDerivativesData> {
  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  // 3개 병렬 호출. 일부 실패해도 가능한 데이터로 진행.
  const [oiRes, fundingRes, tickerRes] = await Promise.allSettled([
    fetchOi24h(symbol),
    fetchFundingAvg(symbol),
    fetchTicker(symbol),
  ]);

  const oiChangeRate = oiRes.status === "fulfilled" ? oiRes.value : 0;
  const fundingRateAvg = fundingRes.status === "fulfilled" ? fundingRes.value : 0;
  const ticker =
    tickerRes.status === "fulfilled"
      ? tickerRes.value
      : { lastPrice: 0, price24hPct: 0 };

  const data: BybitDerivativesData = {
    symbol,
    oiChangeRate,
    fundingRateAvg,
    priceChange24h: ticker.price24hPct,
    lastPrice: ticker.lastPrice,
  };
  cache.set(symbol, { ts: Date.now(), data });
  return data;
}
