/**
 * Bybit Long/Short Ratio
 *
 * 무료, 키 불필요.
 *   GET /v5/market/account-ratio?category=linear&symbol=BTCUSDT&period=1h&limit=1
 *
 * 응답 스키마:
 *   result.list: [{ symbol, buyRatio: "0.5234", sellRatio: "0.4766", timestamp: "..." }]
 *   buyRatio + sellRatio = 1
 */
import type { BybitLongShortData } from "./types";
export declare function fetchLongShortRatio(symbol: string, period?: string): Promise<BybitLongShortData>;
/** v4.3 — 마지막 fetch timestamp (source health 추적). */
export declare function getLongShortCacheTs(symbol: string, period?: string): number;
