/**
 * Engine B — Multi-strategy DSL backtest.
 *
 * DUAL_BACKTEST_ENGINE_PLAN §3 + MACRO_LIQUIDITY_TRACKER_v2 §4.4.
 *
 * 사용자 정의 조합 (AND/OR/NOT + WeightedNode) 을 재귀 평가.
 * 헌장 매핑 자동 검증.
 *
 * 헌장 (CLAUDE.md 금지사항): Charter R3 = 단독 시그널 X.
 * 본 엔진은 backtest 평가 도구이므로 조합 자체가 multi-dimensional → R3 위반 X.
 * 단일 ConditionNode 조합도 사용자 정의 검증 도구로 허용.
 */
import type { LayeredSnapshot, Timeline } from "../timeline-types";
import { type IndicatorLayer, type ExitCondition, type SingleIndicatorResult } from "./single-indicator";
import type { FredMode } from "../../macro/sources/fred";
export type ConditionOperator = "lt" | "gt" | "between" | "crosses_below" | "crosses_above" | "eq";
export interface ConditionNode {
    type: "condition";
    indicator: string;
    operator: ConditionOperator;
    value: number | [number, number] | string;
    layer: IndicatorLayer;
}
export interface LogicNode {
    type: "logic";
    operator: "AND" | "OR" | "NOT";
    children: StrategyExpression[];
}
export interface WeightedNode {
    type: "weighted";
    weights: Array<{
        weight: number;
        child: StrategyExpression;
    }>;
    threshold: number;
}
export type StrategyExpression = ConditionNode | LogicNode | WeightedNode;
export interface MultiStrategyConfig {
    expression: StrategyExpression;
    exit_condition: ExitCondition;
    symbol: string;
    tf: "4h" | "1d" | "1w";
    start_ms: number;
    end_ms: number;
    mode?: FredMode;
    fee_pct?: number;
    slippage_pct?: number;
}
export type Dimension = "momentum" | "volatility" | "trend" | "volume" | "structure" | "macro" | "onchain";
export declare const ALL_DIMENSIONS: readonly Dimension[];
export declare const INDICATOR_TO_DIMENSION: Readonly<Record<string, Dimension>>;
export declare function mapIndicatorToDimension(name: string): Dimension | null;
export declare function evaluateStrategy(expr: StrategyExpression, snapshot: LayeredSnapshot, prev?: LayeredSnapshot | null): {
    triggered: boolean;
};
export declare function extractDimensionsCovered(expr: StrategyExpression): Set<Dimension>;
export interface CharterValidation {
    passed: boolean;
    covered: Dimension[];
    missing: Dimension[];
    warnings: string[];
}
export declare function validateAgainstCharter(expr: StrategyExpression): CharterValidation;
export interface MultiStrategyResult extends SingleIndicatorResult {
    expression: StrategyExpression;
    dimensions_covered: Dimension[];
    charter_validation: CharterValidation;
    by_layer: {
        signal_layer: {
            rsi_buckets: BucketStat[];
            bb_buckets: BucketStat[];
            adx_buckets: BucketStat[];
        };
        wave_layer: {
            alignment_buckets: BucketStat[];
            fib_buckets: BucketStat[];
        };
        macro_layer: {
            regime_buckets: RegimeBucketStat[];
            c4_buckets: RegimeBucketStat[];
        };
    };
    cross_layer: {
        top_combinations: Array<{
            macro_regime: string;
            wave_alignment: string;
            fib_zone: string;
            count: number;
            win_rate: number;
            ci: [number, number];
        }>;
    };
}
export interface BucketStat {
    label: string;
    bucket: [number, number];
    n: number;
    win_rate: number;
    ci: [number, number];
}
export interface RegimeBucketStat {
    label: string;
    n: number;
    win_rate: number;
    ci: [number, number];
}
export interface RunMultiStrategyOpts {
    timelineOverride?: Timeline;
}
export declare function runMultiStrategyBacktest(config: MultiStrategyConfig, opts?: RunMultiStrategyOpts): Promise<MultiStrategyResult>;
