/**
 * Backtesting Metrics Calculator
 *
 * BacktestTrade[] → BacktestMetrics
 * MD 파일 Section 2.2 기반 통계:
 *  - winRate, avgReturn, stdReturn, Sharpe
 *  - maxDrawdown (equity curve peak-to-trough)
 *  - profitFactor, expectancy
 */
import type { BacktestTrade, BacktestMetrics } from "./types";
declare function mean(arr: number[]): number;
declare function std(arr: number[], avg?: number): number;
/**
 * BacktestTrade 배열에서 통계 지표를 계산한다.
 * 트레이드가 없으면 모든 지표 0 반환.
 */
export declare function computeMetrics(trades: BacktestTrade[]): BacktestMetrics;
/**
 * 심볼별 지표 계산
 */
export declare function computeMetricsBySymbol(trades: BacktestTrade[]): Record<string, BacktestMetrics>;
/**
 * 타임프레임별 지표 계산
 */
export declare function computeMetricsByTf(trades: BacktestTrade[]): Record<string, BacktestMetrics>;
/**
 * 표준 편차 export (signal-extractor 등 재사용)
 */
export { mean, std };
