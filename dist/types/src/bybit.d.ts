import type { Candle, TimeframeValue } from "@shared/types";
/**
 * 바이비트에서 캔들 데이터 조회
 * Bybit V5: /v5/market/kline
 * 응답: { list: [[startTime, open, high, low, close, volume, turnover], ...] }
 * 주의: 바이비트는 최신 캔들이 list[0]에 옴 (역순)
 */
export declare function fetchKlines(symbol: string, interval?: TimeframeValue, limit?: number): Promise<Candle[]>;
/**
 * 바이비트에서 현재 가격 조회 (24h ticker)
 */
export declare function fetch24hTicker(symbol: string): Promise<{
    price: number;
    change24h: number;
    volume24h: number;
} | null>;
/**
 * 바이비트에서 거래 가능한 심볼인지 확인
 */
export declare function validateSymbol(symbol: string): Promise<boolean>;
/**
 * 여러 심볼의 24h 티커 일괄 조회 (단일 API 호출)
 * Bybit V5: /v5/market/tickers?category=spot 로 모든 USDT 페어 한번에 가져옴
 */
export declare function fetchAll24hTickers(): Promise<Map<string, {
    price: number;
    change24h: number;
    volume24h: number;
}>>;
/**
 * 여러 심볼의 현재 가격 일괄 조회
 */
export declare function fetchMultiplePrices(symbols: string[]): Promise<Map<string, number>>;
