import type { CoinScanResult, TechnicalIndicators, Candle, TimeframeValue } from "@shared/types";
/**
 * 단일 코인 스캔 (ticker 데이터를 외부에서 주입 가능)
 */
export declare function scanCoin(symbol: string, interval?: TimeframeValue, tickerData?: {
    price: number;
    change24h: number;
    volume24h: number;
}): Promise<CoinScanResult | null>;
/**
 * 페이지 단위 코인 스캔 (10개씩)
 * - 먼저 전체 티커를 한번에 가져옴 (1 API call, 캐시됨)
 * - 요청된 페이지의 10개 코인만 klines 호출
 * - 캐시된 코인은 스킵하여 빠르게 반환
 */
export declare function scanCoinsPage(page?: number, pageSize?: number, interval?: TimeframeValue, symbols?: string[]): Promise<{
    coins: CoinScanResult[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}>;
/**
 * 전체 코인 스캔 (백그라운드 워밍업용)
 */
export declare function scanAllCoins(symbols?: string[], interval?: TimeframeValue): Promise<CoinScanResult[]>;
/**
 * 스캔 진행 상태 조회
 */
export declare function getScanProgress(interval?: TimeframeValue): {
    total: number;
    completed: number;
    isRunning: boolean;
};
/**
 * 시그널이 있는 코인만 필터링
 */
export declare function scanForSignals(symbols?: string[], interval?: TimeframeValue): Promise<CoinScanResult[]>;
/**
 * 개별 코인의 캔들 + 지표 데이터 조회 (차트용)
 */
export declare function getCoinDetail(symbol: string, interval?: TimeframeValue, limit?: number): Promise<{
    candles: Candle[];
    indicators: TechnicalIndicators;
    rsiSeries: number[];
    adxSeries: {
        adx: number;
        plusDi: number;
        minusDi: number;
    }[];
} | null>;
/**
 * 캐시 초기화
 */
export declare function clearCache(): void;
/**
 * 서버 시작 시 백그라운드 워밍업
 * 첫 페이지(10개) 데이터를 미리 로드하여 즉시 응답 가능하게 함
 */
export declare function startBackgroundWarmup(): void;
