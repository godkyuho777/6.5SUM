/**
 * Backtesting Runner — Main Orchestrator
 *
 * 1. 히스토리컬 데이터 수집 (data-loader)
 * 2. 시그널 추출 & outcome 측정 (signal-extractor)
 * 3. 통계 계산 (metrics)
 * 4. (선택) DB 저장
 * 5. BacktestResult 반환
 */
import type { BacktestConfig, BacktestResult } from "./types";
export declare function runBacktest(partialConfig: Partial<BacktestConfig> & {
    symbols: string[];
    startDate: Date;
    endDate: Date;
}): Promise<BacktestResult>;
