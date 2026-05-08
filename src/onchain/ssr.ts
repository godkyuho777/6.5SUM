/**
 * Stablecoin Supply Ratio (SSR) modifier
 *
 *   SSR = BTC 시총 / (USDT + USDC + DAI 시총)
 *     z < -1.5 → +0.15 (매수 대기 자금 풍부 = 바닥 신호)
 *     z < -0.5 → +0.05
 *     z > +1.5 → -0.20 (매수 여력 부족 = 천장 신호)
 *     z > +0.5 → -0.05
 *
 * 90일 이동평균/표준편차로 z-score 계산.
 *
 * 데이터 소스:
 *   - CoinGecko Free: /coins/markets?ids=bitcoin,tether,usd-coin,dai
 *   - 키 불필요. rate limit ~30 req/min (in-memory 5분 캐시로 회피).
 *
 * 명세서가 90일 SSR 시계열을 요구하지만 무료 CoinGecko 는 최근 marketcap 만
 * 1시간 단위로 반환. 90일 통계는 in-memory 누적치(rolling buffer)로 근사.
 * 첫 호출 시 90일 buffer 가 비어있으므로 보수적 z=0 (영향 없음) 처리.
 */

import axios from "axios";
import type { OnchainModifierResult } from "./types";

const COINGECKO_URL = "https://api.coingecko.com/api/v3/coins/markets";
const STABLE_IDS = ["tether", "usd-coin", "dai"];
const BTC_ID = "bitcoin";

interface CGMarket {
  id: string;
  market_cap: number;
}

interface CachedSSR {
  ssr: number;
  ts: number;
}

const ssrCache: { value: CachedSSR | null } = { value: null };
/** Rolling buffer of recent SSR samples (push on each fetch, prune older than 90d). */
const ssrHistory: { ts: number; ssr: number }[] = [];
const HISTORY_MAX_DAYS = 90;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분

async function fetchSSR(): Promise<number> {
  if (ssrCache.value && Date.now() - ssrCache.value.ts < CACHE_TTL_MS) {
    return ssrCache.value.ssr;
  }

  const ids = [BTC_ID, ...STABLE_IDS].join(",");
  const resp = await axios.get<CGMarket[]>(COINGECKO_URL, {
    params: { vs_currency: "usd", ids, per_page: 10, page: 1 },
    timeout: 8000,
    headers: { "User-Agent": "tradelab-onchain/1.0" },
  });

  const map = new Map(resp.data.map((m) => [m.id, m.market_cap ?? 0]));
  const btcCap = map.get(BTC_ID) ?? 0;
  const stableCap = STABLE_IDS.reduce((s, id) => s + (map.get(id) ?? 0), 0);
  if (stableCap === 0) throw new Error("stablecoin marketcap 0");
  const ssr = btcCap / stableCap;

  const now = Date.now();
  ssrCache.value = { ssr, ts: now };
  ssrHistory.push({ ts: now, ssr });
  pruneHistory();
  return ssr;
}

function pruneHistory() {
  const cutoff = Date.now() - HISTORY_MAX_DAYS * 86400 * 1000;
  while (ssrHistory.length > 0 && ssrHistory[0].ts < cutoff) ssrHistory.shift();
}

function ssrStats() {
  if (ssrHistory.length < 5) return null;
  const xs = ssrHistory.map((p) => p.ssr);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  const std = Math.sqrt(variance);
  return { mean, std };
}

export async function computeSSR(): Promise<OnchainModifierResult> {
  try {
    const ssr = await fetchSSR();
    const stats = ssrStats();

    if (!stats || stats.std < 1e-6) {
      return {
        key: "ssr",
        value: 0,
        status: "stub",
        detail: `SSR=${ssr.toFixed(2)} — 90일 buffer 누적 중 (영향 없음)`,
        raw: { ssr, samples: ssrHistory.length },
      };
    }

    const z = (ssr - stats.mean) / stats.std;
    let value = 0;
    if (z < -1.5) value = +0.15;
    else if (z < -0.5) value = +0.05;
    else if (z > 1.5) value = -0.20;
    else if (z > 0.5) value = -0.05;

    const sign = z >= 0 ? "+" : "";
    return {
      key: "ssr",
      value,
      status: "ok",
      detail: `SSR=${ssr.toFixed(2)} z=${sign}${z.toFixed(2)} (${value >= 0 ? "+" : ""}${value.toFixed(2)})`,
      raw: { ssr, z, mean: stats.mean, std: stats.std, samples: ssrHistory.length },
    };
  } catch (err: any) {
    return {
      key: "ssr",
      value: 0,
      status: "error",
      detail: `CoinGecko 호출 실패: ${err.message ?? err}`,
    };
  }
}
