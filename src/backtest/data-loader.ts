/**
 * Backtesting Data Loader
 *
 * Bybit V5 kline API를 시간 페이지네이션으로 호출해
 * 장기 히스토리컬 캔들 데이터를 수집한다.
 *
 * 기존 fetchKlines()는 최신 N개만 가져오지만,
 * 여기서는 startMs ~ endMs 범위 전체를 가져온다.
 * Bybit는 1회 최대 1000캔들 → 범위가 넓으면 자동 페이지네이션.
 */

import axios from "axios";
import type { Candle, TimeframeValue } from "@shared/types";
import { BYBIT_INTERVAL_MAP } from "@shared/types";
import type { FetchHistoricalOptions } from "./types";

const BYBIT_BASE = "https://api.bybit.com";
const MAX_PER_REQUEST = 1000;

// ─── 인터벌 ms 매핑 ──────────────────────────────────────

const INTERVAL_MS: Record<TimeframeValue, number> = {
  "1h": 3_600_000,
  "4h": 14_400_000,
  "6h": 21_600_000,
  "1d": 86_400_000,
  "1w": 604_800_000,
  "1M": 2_592_000_000,
};

export function getIntervalMs(tf: TimeframeValue): number {
  return INTERVAL_MS[tf] ?? 14_400_000;
}

// ─── Bybit API 호출 (재시도 포함) ────────────────────────

async function bybitGet<T>(
  path: string,
  params: Record<string, unknown>,
  maxRetries = 3
): Promise<T | null> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await axios.get(`${BYBIT_BASE}${path}`, {
        params,
        timeout: 20_000,
        headers: { "Accept-Encoding": "gzip" },
      });
      if (res.data.retCode !== 0) {
        console.warn(`[DataLoader] Bybit error: ${res.data.retMsg}`);
        if (attempt === maxRetries - 1) return null;
        await sleep(1000 * (attempt + 1));
        continue;
      }
      return res.data.result as T;
    } catch (err: any) {
      if (err?.response?.status === 429) {
        console.warn("[DataLoader] Rate limited — waiting 3s");
        await sleep(3000);
        continue;
      }
      console.warn(`[DataLoader] Network error (attempt ${attempt + 1}): ${err.message}`);
      await sleep(1000 * (attempt + 1));
    }
  }
  return null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── 메인: 히스토리컬 캔들 전량 수집 ────────────────────

/**
 * startMs ~ endMs 구간의 캔들 전량을 Bybit에서 가져온다.
 *
 * 동작 방식:
 *  1. end=endMs 로 요청 → 최신 1000개 수신
 *  2. 1000개 가득 찼으면 → end = 가장 오래된 캔들 - 1ms 로 재요청
 *  3. startMs 이전 데이터까지 도달하거나 1000개 미만이면 종료
 *  4. 전체를 시간순(오름차순)으로 정렬 후 반환
 */
export async function fetchHistoricalKlines(
  opts: FetchHistoricalOptions
): Promise<Candle[]> {
  const { symbol, tf, startMs, endMs, requestDelayMs = 200 } = opts;
  const bybitInterval = BYBIT_INTERVAL_MAP[tf] ?? "240";
  const intervalMs = getIntervalMs(tf);

  const rawList: string[][] = [];
  let currentEnd = endMs;
  let page = 0;

  console.log(
    `[DataLoader] Fetching ${symbol} ${tf} ` +
    `${new Date(startMs).toISOString().slice(0, 10)} ~ ${new Date(endMs).toISOString().slice(0, 10)}`
  );

  while (true) {
    page++;
    const result = await bybitGet<{ list: string[][] }>(
      "/v5/market/kline",
      {
        category: "spot",
        symbol,
        interval: bybitInterval,
        start: startMs,
        end: currentEnd,
        limit: MAX_PER_REQUEST,
      }
    );

    if (!result?.list?.length) break;

    // Bybit는 최신 → 오래된 순으로 반환
    rawList.push(...result.list);

    const oldestTs = parseInt(result.list[result.list.length - 1][0], 10);

    // 1000개 미만이거나 이미 startMs까지 도달 → 종료
    if (result.list.length < MAX_PER_REQUEST || oldestTs <= startMs) break;

    // 다음 페이지: 가장 오래된 캔들 직전까지
    currentEnd = oldestTs - 1;

    if (requestDelayMs > 0) await sleep(requestDelayMs);
  }

  if (rawList.length === 0) return [];

  // 중복 제거 + 시간순 정렬 + 범위 필터
  const seen = new Set<number>();
  const candles: Candle[] = [];

  // rawList는 newest-first이므로 reverse로 oldest-first 변환
  for (const k of rawList.reverse()) {
    const openTime = parseInt(k[0], 10);
    if (openTime < startMs || openTime > endMs) continue;
    if (seen.has(openTime)) continue;
    seen.add(openTime);

    candles.push({
      openTime,
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      closeTime: openTime + intervalMs,
    });
  }

  candles.sort((a, b) => a.openTime - b.openTime);

  console.log(
    `[DataLoader] ${symbol} ${tf}: ${candles.length} candles loaded (${page} requests)`
  );

  return candles;
}

/**
 * 여러 심볼을 순차적으로 수집한다.
 * rate-limit 방지를 위해 심볼 간 200ms 딜레이.
 */
export async function fetchAllSymbolsHistorical(
  symbols: string[],
  tf: TimeframeValue,
  startMs: number,
  endMs: number,
  onProgress?: (done: number, total: number, symbol: string) => void
): Promise<Map<string, Candle[]>> {
  const result = new Map<string, Candle[]>();

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    try {
      const candles = await fetchHistoricalKlines({ symbol, tf, startMs, endMs });
      if (candles.length > 0) {
        result.set(symbol, candles);
      }
      onProgress?.(i + 1, symbols.length, symbol);
    } catch (err: any) {
      console.error(`[DataLoader] Failed to fetch ${symbol}: ${err.message}`);
    }

    // 심볼 간 딜레이 (마지막 제외)
    if (i < symbols.length - 1) await sleep(200);
  }

  return result;
}
