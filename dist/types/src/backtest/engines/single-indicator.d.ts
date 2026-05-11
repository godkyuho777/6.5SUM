/**
 * Engine A — Single indicator backtest.
 *
 * DUAL_BACKTEST_ENGINE_PLAN §2.
 *
 * 한 지표 + 단순 entry/exit 룰로 alpha 측정.
 * 사용자: "RSI 30 매수가 BTC 4H 에서 진짜 작동?"
 *
 * 핵심 보장:
 *   - Look-ahead-free: 진입 결정은 snapshot[i], 청산 평가는 [i+1..i+window].
 *   - Wilson 95% CI (calibration.ts 의 함수 재사용).
 *   - Baseline winrate vs 결과 → binomial p-value.
 *   - Sample sufficiency 분류 (§6.1).
 */
import type { Timeline, LayeredSnapshot } from "../timeline-types";
import type { FredMode } from "../../macro/sources/fred";
export type IndicatorLayer = "signal" | "wave" | "macro";
/**
 * snapshot 에서 indicator 값을 추출. 미지의 indicator → null.
 *
 * Macro 지표는 MACRO_v2 §4.3 의 routing 따른다.
 */
export declare function getIndicatorValue(snapshot: LayeredSnapshot, indicator: string, layer: IndicatorLayer): number | string | null;
export type EntryConditionType = "less_than" | "greater_than" | "between" | "crosses_below" | "crosses_above" | "equals";
export interface EntryCondition {
    type: EntryConditionType;
    threshold: number | [number, number] | string;
}
export interface ExitConditionParams {
    /** Fixed return target as fraction (0.03 = +3%). */
    target_pct?: number;
    /** Fixed loss stop as positive fraction (0.02 = -2%). */
    stop_pct?: number;
    /** Time stop in bars. */
    max_bars?: number;
    /** Indicator-based exit threshold (number 또는 string). */
    indicator?: string;
    indicator_layer?: IndicatorLayer;
    indicator_threshold?: number;
    indicator_direction?: "greater_than" | "less_than";
}
export interface ExitCondition {
    type: "fixed_return" | "fixed_loss" | "time_stop" | "indicator_threshold";
    params: ExitConditionParams;
}
export interface SingleIndicatorConfig {
    indicator: string;
    layer: IndicatorLayer;
    entry_condition: EntryCondition;
    exit_condition: ExitCondition;
    symbol: string;
    tf: "4h" | "1d" | "1w";
    start_ms: number;
    end_ms: number;
    mode?: FredMode;
    /** 트랜잭션 비용: taker fee + slippage (default Bybit Spot 0.1% + 0.05%). */
    fee_pct?: number;
    slippage_pct?: number;
}
export interface SingleIndicatorTrade {
    entry_ts: number;
    entry_price: number;
    exit_ts: number;
    exit_price: number;
    return_pct: number;
    win: boolean;
    bars_held: number;
}
export interface ValueBucketStat {
    bucket: [number, number];
    n: number;
    wins: number;
    win_rate: number;
    ci: [number, number];
}
export type SampleSufficiency = "sufficient" | "marginal" | "insufficient";
export interface SingleIndicatorResult {
    config: SingleIndicatorConfig;
    total_signals: number;
    win_rate: number;
    ci: [number, number];
    avg_return_pct: number;
    mdd_pct: number;
    sharpe: number;
    trades: SingleIndicatorTrade[];
    by_value_bucket: ValueBucketStat[];
    alpha_significant: boolean;
    baseline_winrate: number;
    p_value: number;
    sample_sufficiency: SampleSufficiency;
}
/**
 * Sample sufficiency 분류 (DUAL_BACKTEST §6.1).
 *   n>=100 && CI width <0.15 → sufficient
 *   n>=30  && CI width <0.25 → marginal
 *   else                     → insufficient
 */
export declare function classifySampleSufficiency(n: number, winRate: number): SampleSufficiency;
/**
 * Binomial p-value: H0 = trueWinRate = baseline.
 * Normal approximation 사용 (n >= 30 시 충분히 정확).
 * 양측 검정 — abs(z) 의 표준정규 꼬리 확률 × 2.
 */
export declare function binomialPValue(wins: number, n: number, baseline: number): number;
export interface RunSingleIndicatorOpts {
    /** 사전 빌드된 timeline (테스트 mock 주입용). */
    timelineOverride?: Timeline;
}
export declare function runSingleIndicatorBacktest(config: SingleIndicatorConfig, opts?: RunSingleIndicatorOpts): Promise<SingleIndicatorResult>;
