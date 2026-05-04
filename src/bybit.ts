/**
 * Bybit V5 public market data client. All scanner / position calls go through
 * this module; CoinGecko and Binance are referenced only by the connectivity
 * probe in src/index.ts.
 */
import axios from "axios";
import type { Candle, TimeframeValue } from "@shared/types";
import { BYBIT_INTERVAL_MAP } from "@shared/types";

const BYBIT_BASE = "https://api.bybit.com";

/**
 * Bybit API 호출 (재시도 포함)
 */
async function bybitGet<T>(
  path: string,
  params: Record<string, unknown>,
  maxRetries = 3,
  timeoutMs = 15000
): Promise<T | null> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await axios.get(`${BYBIT_BASE}${path}`, {
        params,
        timeout: timeoutMs,
        headers: { "Accept-Encoding": "gzip" },
      });
      const data = response.data;
      if (data.retCode !== 0) {
        console.warn(`[Bybit] API error: ${data.retMsg} (code: ${data.retCode})`);
        if (attempt === maxRetries - 1) return null;
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      return data.result as T;
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 429) {
        console.warn(`[Bybit] Rate limited, waiting...`);
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT" || !error.response) {
        console.warn(`[Bybit] Timeout/network error, attempt ${attempt + 1}/${maxRetries}`);
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      console.error(`[Bybit] Error: ${error.message}`);
      if (attempt === maxRetries - 1) return null;
    }
  }
  return null;
}

/**
 * 바이비트에서 캔들 데이터 조회
 * Bybit V5: /v5/market/kline
 * 응답: { list: [[startTime, open, high, low, close, volume, turnover], ...] }
 * 주의: 바이비트는 최신 캔들이 list[0]에 옴 (역순)
 */
export async function fetchKlines(
  symbol: string,
  interval: TimeframeValue = "4h",
  limit = 100
): Promise<Candle[]> {
  const bybitInterval = BYBIT_INTERVAL_MAP[interval] || "240";

  const result = await bybitGet<{ list: string[][] }>(
    "/v5/market/kline",
    {
      category: "spot",
      symbol,
      interval: bybitInterval,
      limit,
    }
  );

  if (!result?.list?.length) return [];

  // 바이비트는 최신이 먼저 → 역순으로 정렬 (오래된 것부터)
  const sorted = [...result.list].reverse();

  return sorted.map((k) => ({
    openTime: parseInt(k[0]),
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    closeTime: parseInt(k[0]) + getIntervalMs(interval),
  }));
}

/**
 * 타임프레임별 밀리초 간격
 */
function getIntervalMs(interval: TimeframeValue): number {
  const map: Record<string, number> = {
    "1h": 3600000,
    "4h": 14400000,
    "6h": 21600000,
    "1d": 86400000,
    "1w": 604800000,
    "1M": 2592000000,
  };
  return map[interval] || 14400000;
}

/**
 * 바이비트에서 현재 가격 조회 (24h ticker)
 */
export async function fetch24hTicker(symbol: string) {
  const result = await bybitGet<{ list: any[] }>(
    "/v5/market/tickers",
    { category: "spot", symbol }
  );

  if (!result?.list?.[0]) return null;
  const item = result.list[0];

  return {
    price: parseFloat(item.lastPrice),
    change24h: parseFloat(item.price24hPcnt) * 100,
    volume24h: parseFloat(item.turnover24h),
  };
}

/**
 * 바이비트에서 거래 가능한 심볼인지 확인
 */
export async function validateSymbol(symbol: string): Promise<boolean> {
  const result = await bybitGet<{ list: any[] }>(
    "/v5/market/tickers",
    { category: "spot", symbol },
    1,
    5000
  );
  return !!(result?.list?.length);
}

/**
 * 여러 심볼의 24h 티커 일괄 조회 (단일 API 호출)
 * Bybit V5: /v5/market/tickers?category=spot 로 모든 USDT 페어 한번에 가져옴
 */
export async function fetchAll24hTickers(): Promise<
  Map<string, { price: number; change24h: number; volume24h: number }>
> {
  const result = await bybitGet<{ list: any[] }>(
    "/v5/market/tickers",
    { category: "spot" },
    3,
    20000
  );

  const tickerMap = new Map<string, { price: number; change24h: number; volume24h: number }>();

  if (!result?.list) return tickerMap;

  for (const item of result.list) {
    if (item.symbol?.endsWith("USDT")) {
      tickerMap.set(item.symbol, {
        price: parseFloat(item.lastPrice),
        change24h: parseFloat(item.price24hPcnt) * 100,
        volume24h: parseFloat(item.turnover24h),
      });
    }
  }

  return tickerMap;
}

/**
 * 여러 심볼의 현재 가격 일괄 조회
 */
export async function fetchMultiplePrices(
  symbols: string[]
): Promise<Map<string, number>> {
  const result = await bybitGet<{ list: any[] }>(
    "/v5/market/tickers",
    { category: "spot" },
    2,
    15000
  );

  const priceMap = new Map<string, number>();
  if (!result?.list) return priceMap;

  const symbolSet = new Set(symbols);
  for (const item of result.list) {
    if (symbolSet.has(item.symbol)) {
      priceMap.set(item.symbol, parseFloat(item.lastPrice));
    }
  }
  return priceMap;
}
