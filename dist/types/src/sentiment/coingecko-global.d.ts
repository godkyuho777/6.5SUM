/**
 * CoinGecko Global Market — 시총 / BTC 도미넌스 / 24h 시총 변화
 *
 *   GET https://api.coingecko.com/api/v3/global
 *
 * 무료, 키 불필요. 응답:
 *   { data: { total_market_cap: { usd, ... }, market_cap_percentage: { btc, eth, ... },
 *             market_cap_change_percentage_24h_usd, ... } }
 */
import type { GlobalMarketData } from "./types";
export declare function fetchGlobalMarket(): Promise<GlobalMarketData>;
