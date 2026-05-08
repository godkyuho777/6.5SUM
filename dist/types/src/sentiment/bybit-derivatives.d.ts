/**
 * Bybit V5 — Open Interest + Funding Rate + 24h price change
 *
 * 무료, 키 불필요.
 *   - OI:      GET /v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=1h&limit=24
 *   - Funding: GET /v5/market/funding/history?category=linear&symbol=BTCUSDT&limit=10
 *   - Ticker:  GET /v5/market/tickers?category=linear&symbol=BTCUSDT
 *
 * 24h OI 변화율 = (현재 OI - 24h 전 OI) / 24h 전 OI × 100
 * Funding rate 평균 = 최근 N개 펀딩 평균 (보통 1 funding interval = 8h)
 */
import type { BybitDerivativesData } from "./types";
export declare function fetchBybitDerivatives(symbol: string): Promise<BybitDerivativesData>;
