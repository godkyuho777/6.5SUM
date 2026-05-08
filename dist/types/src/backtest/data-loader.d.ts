/**
 * Backtesting Data Loader
 *
 * Bybit V5 kline API를 시간 페이지네이션으로 호출해
 * 장기 히스토리컬 캔들 데이터를 수집한다.
 *
 * 기존 fetchKlines()는 최신 N개만 가져오지만,
 * 여기서는 startMs ~ endMs 범위 전체를 가져온다.
 * Bybit는 1회 최대 1000캔들 → 범위가 넓으면 자동 페이지네이션.
 */
import type { Candle, TimeframeValue } from "@shared/types";
import type { FetchHistoricalOptions } from "./types";
export declare function getIntervalMs(tf: TimeframeValue): number;
/**
 * startMs ~ endMs 구간의 캔들 전량을 Bybit에서 가져온다.
 *
 * 동작 방식:
 *  1. end=endMs 로 요청 → 최신 1000개 수신
 *  2. 1000개 가득 찼으면 → end = 가장 오래된 캔들 - 1ms 로 재요청
 *  3. startMs 이전 데이터까지 도달하거나 1000개 미만이면 종료
 *  4. 전체를 시간순(오름차순)으로 정렬 후 반환
 */
export declare function fetchHistoricalKlines(opts: FetchHistoricalOptions): Promise<Candle[]>;
/**
 * 여러 심볼을 순차적으로 수집한다.
 * rate-limit 방지를 위해 심볼 간 200ms 딜레이.
 */
export declare function fetchAllSymbolsHistorical(symbols: string[], tf: TimeframeValue, startMs: number, endMs: number, onProgress?: (done: number, total: number, symbol: string) => void): Promise<Map<string, Candle[]>>;
