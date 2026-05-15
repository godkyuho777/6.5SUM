/**
 * Backtest strategies — barrel + 자동 등록.
 *
 * 4 전략 import 시점에 STRATEGY_REGISTRY 에 자동 등록 (registerStrategy 호출).
 * signal-extractor 에서 `getStrategy(name)` 으로 lookup.
 */

// 등록 부수효과 (side-effect import — 모듈 로드 시 registerStrategy 실행)
import "./bbdx";
import "./bbdx-short";
import "./bbdx-combined";
import "./fibonacci";
import "./vwap";
import "./trend";
import "./trend-follow";

export {
  STRATEGY_REGISTRY,
  getStrategy,
  registerStrategy,
} from "./types";
export type {
  BacktestStrategy,
  StrategyName,
  EntryEvaluation,
  EntryParams,
} from "./types";

export { bbdxStrategy } from "./bbdx";
export { bbdxShortStrategy } from "./bbdx-short";
export { bbdxCombinedStrategy } from "./bbdx-combined";
export { fibonacciStrategy } from "./fibonacci";
export { vwapStrategy } from "./vwap";
export { trendStrategy } from "./trend";
export { trendFollowStrategy } from "./trend-follow";

import { STRATEGY_REGISTRY } from "./types";

/** 모든 등록된 전략 목록 (CLI / tRPC enum 용) */
export function listStrategies(): Array<{
  name: string;
  label: string;
  description: string;
  dimensionsCovered: number[];
}> {
  return Array.from(STRATEGY_REGISTRY.values()).map((s) => ({
    name: s.name,
    label: s.label,
    description: s.description,
    dimensionsCovered: [...s.dimensionsCovered],
  }));
}
