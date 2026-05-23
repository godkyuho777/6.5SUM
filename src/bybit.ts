/**
 * Bybit V5 public market data client. All scanner / position calls go through
 * this module; CoinGecko and Binance are referenced only by the connectivity
 * probe in src/index.ts.
 *
 * P2-#2 (2026-05-23): Zod schema validation 도입.
 *   기존 `parseFloat(item.lastPrice)` 이 비정상 응답 (null / "" / "NaN") 에서
 *   NaN 을 propagate → 차트 / 백테스트 오류. Zod 가 NaN/null 차단.
 */
import axios from "axios";
import { z } from "zod";
import type { Candle, TimeframeValue } from "@shared/types";
import { BYBIT_INTERVAL_MAP } from "@shared/types";

const BYBIT_BASE = "https://api.bybit.com";

// ─── Zod schemas — Bybit V5 응답 ───────────────────────────────────────

/**
 * 문자열을 양의 finite number 로 파싱.
 *
 *   "78.5" → 78.5
 *   "0"    → 0 (volume 가능)
 *   ""     → 0 (Bybit 가 일부 필드를 빈 문자열로 반환할 수 있음, 안전 fallback)
 *   null   → 0
 *   "abc"  → throw (Zod validation 실패)
 */
const numericString = z.preprocess(
  (val) => {
    if (val == null || val === "") return 0;
    if (typeof val === "number") return val;
    const parsed = parseFloat(String(val));
    return Number.isFinite(parsed) ? parsed : NaN;
  },
  z.number().finite(),
);

/** Kline tuple: [startTime, open, high, low, close, volume, turnover] */
const KlineTupleSchema = z.tuple([
  z.union([z.string(), z.number()]).transform((v) => Number(v)), // openTime
  numericString, // open
  numericString, // high
  numericString, // low
  numericString, // close
  numericString, // volume
  numericString.optional(), // turnover (일부 응답에서 누락)
]);

const KlineResponseSchema = z.object({
  list: z.array(KlineTupleSchema).optional(),
});

const TickerItemSchema = z.object({
  symbol: z.string(),
  lastPrice: numericString,
  price24hPcnt: numericString,
  turnover24h: numericString,
});

const TickersResponseSchema = z.object({
  list: z.array(TickerItemSchema).optional(),
});

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

  const rawResult = await bybitGet<unknown>(
    "/v5/market/kline",
    {
      category: "spot",
      symbol,
      interval: bybitInterval,
      limit,
    }
  );

  // P2-#2: Zod validation — 비정상 응답 (NaN, null, missing fields) 차단
  const parsed = KlineResponseSchema.safeParse(rawResult);
  if (!parsed.success) {
    console.warn(
      `[Bybit] fetchKlines(${symbol}) 응답 형식 비정상:`,
      parsed.error.issues.slice(0, 3),
    );
    return [];
  }
  const result = parsed.data;

  if (!result.list?.length) return [];

  // 바이비트는 최신이 먼저 → 역순으로 정렬 (오래된 것부터)
  const sorted = [...result.list].reverse();
  const intervalMs = getIntervalMs(interval);

  return sorted.map((k) => ({
    openTime: k[0],
    open: k[1],
    high: k[2],
    low: k[3],
    close: k[4],
    volume: k[5],
    closeTime: k[0] + intervalMs,
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
  const raw = await bybitGet<unknown>("/v5/market/tickers", {
    category: "spot",
    symbol,
  });

  // P2-#2: Zod validation
  const parsed = TickersResponseSchema.safeParse(raw);
  if (!parsed.success || !parsed.data.list?.[0]) {
    if (!parsed.success) {
      console.warn(
        `[Bybit] fetch24hTicker(${symbol}) 응답 형식 비정상:`,
        parsed.error.issues.slice(0, 3),
      );
    }
    return null;
  }

  const item = parsed.data.list[0];
  return {
    price: item.lastPrice,
    change24h: item.price24hPcnt * 100,
    volume24h: item.turnover24h,
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
  const raw = await bybitGet<unknown>(
    "/v5/market/tickers",
    { category: "spot" },
    3,
    20000
  );

  const tickerMap = new Map<
    string,
    { price: number; change24h: number; volume24h: number }
  >();

  // P2-#2: Zod validation. partial failure 허용 — 한 item 이상해도 나머지는 채움.
  const parsed = TickersResponseSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn(
      "[Bybit] fetchAll24hTickers 응답 형식 비정상:",
      parsed.error.issues.slice(0, 3),
    );
    return tickerMap;
  }
  if (!parsed.data.list) return tickerMap;

  for (const item of parsed.data.list) {
    if (item.symbol?.endsWith("USDT")) {
      tickerMap.set(item.symbol, {
        price: item.lastPrice,
        change24h: item.price24hPcnt * 100,
        volume24h: item.turnover24h,
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
  const raw = await bybitGet<unknown>(
    "/v5/market/tickers",
    { category: "spot" },
    2,
    15000
  );

  const priceMap = new Map<string, number>();

  // P2-#2: Zod validation
  const parsed = TickersResponseSchema.safeParse(raw);
  if (!parsed.success || !parsed.data.list) {
    if (!parsed.success) {
      console.warn(
        "[Bybit] fetchMultiplePrices 응답 형식 비정상:",
        parsed.error.issues.slice(0, 3),
      );
    }
    return priceMap;
  }

  const symbolSet = new Set(symbols);
  for (const item of parsed.data.list) {
    if (symbolSet.has(item.symbol)) {
      priceMap.set(item.symbol, item.lastPrice);
    }
  }
  return priceMap;
}
