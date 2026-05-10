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

/**
 * v4.3 Phase C — OI 7일 변화율 (일봉 8일치).
 * 24h 노이즈와 분리해서 mid-term 추세를 잡는 용도.
 */
async function fetchOi7d(symbol: string): Promise<number> {
  const resp = await axios.get<OiResp>(`${BASE}/v5/market/open-interest`, {
    params: { category: "linear", symbol, intervalTime: "1d", limit: 8 },
    timeout: 6000,
  });
  const list = resp.data.result?.list ?? [];
  if (list.length < 2) return 0;
  // 시간 내림차순. [0]=latest, [last]=7d ago.
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

/**
 * v4.3 Phase C — Funding 7일 평균 + slope (linear regression).
 * 21개 = 8h × 21 = 7일치. 펀딩 추세 정보 노출.
 */
async function fetchFunding7d(symbol: string): Promise<{
  avg7d: number;
  trend7d: "rising" | "falling" | "flat";
  slope7d: number;
}> {
  const resp = await axios.get<FundingResp>(`${BASE}/v5/market/funding/history`, {
    params: { category: "linear", symbol, limit: 21 },
    timeout: 6000,
  });
  const list = resp.data.result?.list ?? [];
  if (list.length === 0) return { avg7d: 0, trend7d: "flat", slope7d: 0 };

  // 시간 내림차순으로 도착. 평균은 단순.
  const rates = list.map((x) => Number(x.fundingRate) * 100); // %
  const avg7d = rates.reduce((s, r) => s + r, 0) / rates.length;

  // Linear regression slope. X=시간 인덱스 (오래된→최신), Y=funding rate.
  const reverseRates = [...rates].reverse(); // 오래된→최신
  const n = reverseRates.length;
  const xs = reverseRates.map((_, i) => i);
  const meanX = xs.reduce((s, x) => s + x, 0) / n;
  const meanY = reverseRates.reduce((s, y) => s + y, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (reverseRates[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slopePerInterval = den === 0 ? 0 : num / den;
  // 펀딩 8h 간격 → 1일(=3 intervals) slope
  const slope7d = slopePerInterval * 3;

  let trend7d: "rising" | "falling" | "flat" = "flat";
  if (slope7d > 0.002) trend7d = "rising";
  else if (slope7d < -0.002) trend7d = "falling";

  return { avg7d, trend7d, slope7d };
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

  // v4.3 Phase C: 5개 병렬 호출 (24h/7d OI, 1일/7일 funding, ticker).
  // 일부 실패해도 가능한 데이터로 진행.
  const [
    oi24hRes,
    oi7dRes,
    fundingRes,
    funding7dRes,
    tickerRes,
  ] = await Promise.allSettled([
    fetchOi24h(symbol),
    fetchOi7d(symbol),
    fetchFundingAvg(symbol),
    fetchFunding7d(symbol),
    fetchTicker(symbol),
  ]);

  const oiChangeRate = oi24hRes.status === "fulfilled" ? oi24hRes.value : 0;
  const oiChange7d = oi7dRes.status === "fulfilled" ? oi7dRes.value : undefined;
  const fundingRateAvg = fundingRes.status === "fulfilled" ? fundingRes.value : 0;
  const funding7d =
    funding7dRes.status === "fulfilled"
      ? funding7dRes.value
      : undefined;
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
    oiChange7d,
    fundingAvg7d: funding7d?.avg7d,
    fundingTrend7d: funding7d?.trend7d,
    fundingSlope7d: funding7d?.slope7d,
  };
  cache.set(symbol, { ts: Date.now(), data });
  return data;
}

/** v4.3 — 마지막 fetch 의 timestamp 가져오기 (source health 추적 용). */
export function getDerivativesCacheAge(symbol: string): number {
  const c = cache.get(symbol);
  if (!c) return Infinity;
  return Date.now() - c.ts;
}
