/**
 * Composite Layer Evaluator — Phase A-2 (2026-05-11).
 *
 * 3 Layer (Signal/Macro/Wave) 의 LayerCondition 배열을 LayerSnapshot 시점에
 * 평가. AND/OR 결합 정책 적용 후 entry 결정.
 *
 * 헌장 R3 (단독 시그널 X): 본 evaluator 는 *측정 도구* — 단독 진입 발행 X.
 * 반드시 backtest engine 의 진입 게이트 안에서 호출됨.
 */
import type { CompositeEvaluation, CompositeStrategyConfig, LayerSnapshot } from "./types";
export declare function evaluateComposite(config: CompositeStrategyConfig, snapshot: LayerSnapshot): CompositeEvaluation;
/**
 * Layer 통계 — 전체 백테스트 후 각 layer 의 pass rate 계산.
 *
 * Frontend 디버깅용: 어느 layer 가 가장 많은 trade 를 거르는지 파악.
 */
export declare function computeLayerStats(evaluations: CompositeEvaluation[]): {
    signalPassRate: number;
    macroPassRate: number;
    wavePassRate: number;
    allPassRate: number;
};
