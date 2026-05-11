/**
 * Backtest strategies — barrel + 자동 등록.
 *
 * 4 전략 import 시점에 STRATEGY_REGISTRY 에 자동 등록 (registerStrategy 호출).
 * signal-extractor 에서 `getStrategy(name)` 으로 lookup.
 */
import "./bbdx";
import "./bbdx-short";
import "./fibonacci";
import "./vwap";
import "./trend";
import "./trend-follow";
export { STRATEGY_REGISTRY, getStrategy, registerStrategy, } from "./types";
export type { BacktestStrategy, StrategyName, EntryEvaluation, EntryParams, } from "./types";
export { bbdxStrategy } from "./bbdx";
export { bbdxShortStrategy } from "./bbdx-short";
export { fibonacciStrategy } from "./fibonacci";
export { vwapStrategy } from "./vwap";
export { trendStrategy } from "./trend";
export { trendFollowStrategy } from "./trend-follow";
/** 모든 등록된 전략 목록 (CLI / tRPC enum 용) */
export declare function listStrategies(): Array<{
    name: string;
    label: string;
    description: string;
    dimensionsCovered: number[];
}>;
