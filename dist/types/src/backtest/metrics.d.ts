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
/** Default trading cost assumptions. Override via `applyCostModel` opts. */
export declare const DEFAULT_COST_MODEL: {
    /** Taker fee per side, fraction. Bybit Spot 0.1%. */
    readonly fee_pct: 0.001;
    /** Estimated slippage per side, fraction. */
    readonly slippage_pct: 0.0005;
};
export interface CostModel {
    fee_pct: number;
    slippage_pct: number;
}
/** Adjust a raw returnPct by round-trip fee + slippage. Pure helper. */
export declare function applyCostModel(rawReturnPct: number, model?: CostModel): number;
export type SampleSufficiencyLabel = "sufficient" | "marginal" | "insufficient";
/**
 * 표본 충분성 분류. 신뢰구간 폭과 표본 크기 둘 다 검사.
 *   n>=100 + CI width <0.15 → sufficient
 *   n>=30  + CI width <0.25 → marginal
 *   else                     → insufficient
 */
export declare function classifySampleSufficiency(n: number, winRate: number): SampleSufficiencyLabel;
/**
 * Wilson CI 를 winRate 옆에 부착한 확장 메트릭.
 * 기존 BacktestMetrics 를 확장하므로 backward-compat 유지.
 */
export interface BacktestMetricsExt extends BacktestMetrics {
    ci_low: number;
    ci_high: number;
    sample_sufficiency: SampleSufficiencyLabel;
}
export declare function withCi(metrics: BacktestMetrics): BacktestMetricsExt;
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
 * Side(LONG/SHORT) 별 지표 계산 (P1-#3, 2026-05-10).
 *
 * Audit `01-BBDX-AUDIT.md` S2 권고 — SHORT path 알파 입증을 위해 LONG 과
 * 분리 측정. side 미지정 trade 는 "long" 으로 간주 (backward compat).
 *
 * @returns { long: metrics, short: metrics } — 한쪽 trade 0건이면 totalTrades=0
 */
export declare function computeMetricsBySide(trades: BacktestTrade[]): {
    long: BacktestMetrics;
    short: BacktestMetrics;
};
/**
 * 표준 편차 export (signal-extractor 등 재사용)
 */
export { mean, std };
