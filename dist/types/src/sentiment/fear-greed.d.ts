/**
 * Fear & Greed Index — alternative.me API
 *
 * 무료, 키 불필요. 1일 1회 갱신.
 *   GET https://api.alternative.me/fng/?limit=30
 *
 * 응답 스키마:
 *   { name, data: [{ value, value_classification, timestamp, time_until_update }, ...] }
 */
import type { FearGreedPoint } from "./types";
export declare function fetchFearGreed(limit?: number): Promise<FearGreedPoint[]>;
/** F&G 7일 변화량 (현재 값 - 7일 전 값). */
export declare function trendDelta7d(points: FearGreedPoint[]): number;
/** v4.3 — 마지막 fetch 의 timestamp (source health 추적 용). 0 이면 미fetch. */
export declare function getFearGreedCacheTs(): number;
