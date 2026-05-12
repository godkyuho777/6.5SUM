/**
 * Composite Backtest — 3-Layer (Signal + Macro + Wave) 조합 백테스트 진입점.
 *
 * Phase A-2 (2026-05-11). 사용자 요구 #2 의 통합 export.
 */
export type { LayerName, LayerCondition, LayerSnapshot, LayerEvaluation, CompositeEvaluation, CompositeStrategyConfig, CompositeBacktestResult, IndicatorMeta, OperatorMeta, SignalIndicator, MacroIndicator, WaveIndicator, IndicatorName, Operator, } from "./types";
export { INDICATOR_CATALOG, OPERATOR_CATALOG, DEFAULT_COMPOSITE_CONFIG, } from "./types";
export { evaluateComposite, computeLayerStats, } from "./evaluator";
export { buildLayerSnapshot, } from "./snapshot-builder";
export { extractCompositeSignalsFromCandles, extractCompositeAllSignals, } from "./composite-strategy";
export { runCompositeBacktest, } from "./runner";
export type { RunCompositeBacktestArgs, } from "./runner";
