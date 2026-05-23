/**
 * Macro cache policy (P2-#13, 2026-05-23) — 모든 macro source 의 TTL 일관화.
 *
 * AUDIT.md 권장: bok.ts (12h), fred.ts (12h realtime / 영구 backtest), krw.ts
 * (미정의) 등 산재된 TTL 을 단일 출처로.
 *
 * 정책:
 *   - REALTIME: 12h — 일중 데이터 (FRED/BOK 가 일 1회 갱신, 더 짧으면 의미 X)
 *   - BACKTEST_VINTAGE: 영구 (Number.POSITIVE_INFINITY) — vintage 는 변하지 않음
 *   - INTRADAY: 1h — 빈번 변동 가능한 데이터 (e.g. VIX 일중)
 *
 * 사용 예 (fred.ts / bok.ts):
 *   import { MACRO_CACHE_TTL } from "./cache-policy";
 *   if (now - mtimeMs > MACRO_CACHE_TTL.realtime) return null;
 */

const HOUR_MS = 60 * 60 * 1000;

export const MACRO_CACHE_TTL = {
  /** Realtime macro (FRED daily / BOK daily 등) — 12h */
  realtime: 12 * HOUR_MS,

  /** Backtest vintage 데이터 — 변하지 않음 (영구 캐시) */
  backtestVintage: Number.POSITIVE_INFINITY,

  /** 일중 변동 데이터 (VIX intraday 등) — 1h */
  intraday: 1 * HOUR_MS,

  /** Fallback (Yahoo KRW=X 등 무료 source) — 6h */
  fallback: 6 * HOUR_MS,
} as const;

export type MacroCacheTier = keyof typeof MACRO_CACHE_TTL;

/**
 * 캐시 항목이 만료되었는지 검사.
 *
 * @param mtimeMs 파일 또는 메모리 항목의 last-modified timestamp (ms)
 * @param tier 캐시 tier (default "realtime")
 * @returns true = 만료 (재fetch 필요), false = 유효
 */
export function isMacroCacheExpired(
  mtimeMs: number,
  tier: MacroCacheTier = "realtime",
): boolean {
  const ttl = MACRO_CACHE_TTL[tier];
  if (ttl === Number.POSITIVE_INFINITY) return false;
  return Date.now() - mtimeMs > ttl;
}
