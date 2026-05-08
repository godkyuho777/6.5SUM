/**
 * Signal Extractor — Lookahead-free Signal Replay
 *
 * 핵심 원칙: NO LOOKAHEAD BIAS
 * - 캔들 i의 시그널 판단: candles[0..i] 만 사용
 * - 캔들 i의 결과 측정: candles[i+1..i+outcomeWindow] 만 사용
 * - 두 데이터 집합이 절대 섞이지 않음
 *
 * 기존 indicators.ts의 isEntrySignal / calculateAllIndicators 를
 * 그대로 재사용한다.
 */
import type { Candle } from "@shared/types";
import type { BacktestConfig, BacktestTrade } from "./types";
/**
 * 단일 심볼의 전체 캔들에서 BBDX 시그널을 추출하고
 * 각 시그널의 outcome을 측정한다.
 *
 * @param symbol   심볼 (e.g. "BTCUSDT")
 * @param candles  해당 심볼의 전체 캔들 (oldest → newest)
 * @param config   백테스트 설정
 */
export declare function extractSignalsFromCandles(symbol: string, candles: Candle[], config: BacktestConfig): BacktestTrade[];
/**
 * 여러 심볼의 캔들 맵에서 전체 트레이드를 추출한다.
 */
export declare function extractAllSignals(candleMap: Map<string, Candle[]>, config: BacktestConfig, onProgress?: (done: number, total: number, symbol: string) => void): BacktestTrade[];
