/**
 * Funding Rate Extreme Modifier — 명세서 §8.
 *
 * Bybit V5 `/v5/market/funding/history` 에서 perp funding rate fetch.
 * 8h 기준 임계값:
 *   rate > +0.001  → long_extreme   → multiplier 0.85 (LONG 약화)
 *   rate > +0.0005 → long_elevated  → 0.92
 *   -0.0005 ≤ rate ≤ +0.0005 → neutral → 1.00
 *   rate < -0.0005 → short_elevated → 1.10 (스퀴즈 가능)
 *   rate < -0.001  → short_extreme  → 1.20
 *
 * 차원 6 (macro — perp positioning). Wave Tracker 와 같은 차원이지만
 * 측정 각도 다름 (komposit sentiment vs single-symbol perp positioning).
 *
 * Spot-only 코인 (펀딩비 없음) → status="stub", multiplier=1.0.
 * 외부 호출 실패 → status="error", multiplier=1.0 (graceful, throw X).
 *
 * 캐시 5분 (in-memory).
 */

import axios from "axios";
import type { ModifierResult } from "./types";
import { neutralModifier } from "./types";

export type FundingRegime =
  | "long_extreme"
  | "long_elevated"
  | "neutral"
  | "short_elevated"
  | "short_extreme";

export interface FundingExtremeResult extends ModifierResult {
  fundingRate: number;
  regime: FundingRegime;
}

const BYBIT_BASE = "https://api.bybit.com";
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  result: FundingExtremeResult;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

function classifyRegime(rate: number): FundingRegime {
  if (rate > 0.001) return "long_extreme";
  if (rate > 0.0005) return "long_elevated";
  if (rate < -0.001) return "short_extreme";
  if (rate < -0.0005) return "short_elevated";
  return "neutral";
}

function regimeToMultiplier(regime: FundingRegime): number {
  switch (regime) {
    case "long_extreme":
      return 0.85;
    case "long_elevated":
      return 0.92;
    case "neutral":
      return 1.0;
    case "short_elevated":
      return 1.10;
    case "short_extreme":
      return 1.20;
  }
}

/**
 * Bybit funding rate 1건 fetch.
 *
 * 응답 shape (V5):
 *   { retCode: 0, result: { list: [{ fundingRate: "0.0001", fundingRateTimestamp: "..." }] } }
 *
 * Spot-only 심볼 (BBDX 의 USDT 페어 일부) 은 retCode=0 + list 비어 있음 → stub.
 */
async function fetchFundingRate(symbol: string): Promise<{ rate: number | null; raw?: any }> {
  const url = `${BYBIT_BASE}/v5/market/funding/history`;
  const response = await axios.get(url, {
    params: { category: "linear", symbol, limit: 1 },
    timeout: 10000,
    headers: { "Accept-Encoding": "gzip" },
  });
  const data = response.data;
  if (data?.retCode !== 0) {
    throw new Error(`Bybit funding API error: ${data?.retMsg ?? "unknown"}`);
  }
  const list = data?.result?.list;
  if (!Array.isArray(list) || list.length === 0) {
    return { rate: null };
  }
  const rate = parseFloat(list[0].fundingRate);
  if (!Number.isFinite(rate)) {
    return { rate: null };
  }
  return { rate, raw: list[0] };
}

/**
 * Funding Extreme modifier — 5 단계 regime 분류 + multiplier.
 *
 * @param symbol Bybit 심볼 (예: "BTCUSDT"). Linear (perp) 만 funding rate 존재.
 */
export async function computeFundingExtreme(
  symbol: string
): Promise<FundingExtremeResult> {
  const sym = symbol.toUpperCase();
  const now = Date.now();
  const cached = cache.get(sym);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }

  let result: FundingExtremeResult;
  try {
    const { rate } = await fetchFundingRate(sym);
    if (rate == null) {
      result = {
        ...neutralModifier(
          6,
          `Funding Extreme — ${sym} 은 spot-only 또는 funding 데이터 없음`,
          "stub"
        ),
        fundingRate: 0,
        regime: "neutral",
      };
    } else {
      const regime = classifyRegime(rate);
      const multiplier = regimeToMultiplier(regime);
      result = {
        multiplier,
        rawScore: Math.round(rate * 1_000_000) / 100, // %로 표시 (0.0001 → 0.01%)
        reason: `Funding ${regime} (rate=${(rate * 100).toFixed(4)}%/8h)`,
        dimension: 6,
        status: "real",
        fundingRate: rate,
        regime,
      };
    }
  } catch (err: any) {
    const detail = String(err?.message ?? err);
    console.warn(`[Modifier:funding] ${sym} fetch failed: ${detail}`);
    result = {
      ...neutralModifier(
        6,
        `Funding Extreme — fetch 실패 (graceful neutral)`,
        "error",
        detail
      ),
      fundingRate: 0,
      regime: "neutral",
    };
  }

  cache.set(sym, { result, timestamp: now });
  return result;
}

/** 테스트 용 — 캐시 초기화. */
export function __clearFundingCache(): void {
  cache.clear();
}
