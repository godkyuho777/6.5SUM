/**
 * Fear & Greed Index — alternative.me API
 *
 * 무료, 키 불필요. 1일 1회 갱신.
 *   GET https://api.alternative.me/fng/?limit=30
 *
 * 응답 스키마:
 *   { name, data: [{ value, value_classification, timestamp, time_until_update }, ...] }
 */

import axios from "axios";
import type { FearGreedClass, FearGreedPoint } from "./types";

const URL = "https://api.alternative.me/fng/";

interface RawFng {
  name?: string;
  data: Array<{
    value: string;
    value_classification: string;
    timestamp: string;
    time_until_update?: string;
  }>;
}

let cache: { ts: number; points: FearGreedPoint[] } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1시간

/**
 * F&G 분류 문자열 정규화. alternative.me 는 "Extreme Fear" 같은 형태로 반환.
 * 우리는 enum-style 로 통일.
 */
function normalize(c: string, value: number): FearGreedClass {
  const lower = c.toLowerCase();
  if (lower.includes("extreme fear")) return "EXTREME_FEAR";
  if (lower.includes("extreme greed")) return "EXTREME_GREED";
  if (lower.includes("fear")) return "FEAR";
  if (lower.includes("greed")) return "GREED";
  if (lower.includes("neutral")) return "NEUTRAL";
  // value 기반 fallback
  if (value < 21) return "EXTREME_FEAR";
  if (value < 41) return "FEAR";
  if (value < 61) return "NEUTRAL";
  if (value < 81) return "GREED";
  return "EXTREME_GREED";
}

export async function fetchFearGreed(limit = 30): Promise<FearGreedPoint[]> {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return cache.points.slice(0, limit);
  }

  const resp = await axios.get<RawFng>(URL, {
    params: { limit },
    timeout: 8000,
    headers: { "User-Agent": "tradelab-sentiment/1.0" },
  });

  const points: FearGreedPoint[] = (resp.data.data ?? []).map((d) => {
    const value = Number(d.value);
    return {
      value,
      classification: normalize(d.value_classification, value),
      timestamp: Number(d.timestamp) * 1000, // unix-sec → ms
    };
  });

  cache = { ts: Date.now(), points };
  return points.slice(0, limit);
}

/** F&G 7일 변화량 (현재 값 - 7일 전 값). */
export function trendDelta7d(points: FearGreedPoint[]): number {
  if (points.length < 2) return 0;
  const now = points[0]?.value ?? 50;
  const old = points[Math.min(7, points.length - 1)]?.value ?? now;
  return now - old;
}
