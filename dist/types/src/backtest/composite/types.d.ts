/**
 * 3-Layer Composite Backtest — Type Definitions (Phase A-2, 2026-05-11).
 *
 * 사용자 요구 #2: "Signal Tracker 지표 + Macro Liquidity 지표 + Wave Tracker
 * 지표 를 조합한 매매 기준으로 백테스팅. 새 탭으로 별도 구현."
 *
 * 설계:
 *   - 3 Layer 정의: Signal / Macro / Wave
 *   - 각 Layer 의 condition 은 사용자가 자유 조합
 *   - condition 평가는 AND 게이트 (모든 layer 의 조건 충족 시 진입)
 *   - 선택적으로 layer 별 OR / 비활성화 가능
 *
 * 기존 single-strategy 백테스트와 *별도 트랙* — 호환성 보존.
 */
import type { Candle, TechnicalIndicators, TimeframeValue } from "@shared/types";
import type { BacktestMetrics, BacktestTrade } from "../types";
/** 3 Layer 식별자 — 각자 독립 지표 풀. */
export type LayerName = "signal" | "macro" | "wave";
/** Layer 별 사용 가능한 indicator 카탈로그. */
export type SignalIndicator = "rsi" | "bbLowerProximity" | "bbUpperProximity" | "adx" | "plusDi" | "minusDi" | "patternConfluence" | "volumeRatio" | "signalStrength";
export type MacroIndicator = "macroRegime" | "macroScore" | "macroMult" | "koreaModifier";
export type WaveIndicator = "waveAlignment" | "waveMult" | "btcCycleRegime" | "trendDirection" | "trendAdx";
export type IndicatorName = SignalIndicator | MacroIndicator | WaveIndicator;
/** 비교 연산자. */
export type Operator = "lt" | "lte" | "gt" | "gte" | "eq" | "neq" | "in" | "between";
/** 단일 condition. */
export interface LayerCondition {
    layer: LayerName;
    indicator: IndicatorName;
    operator: Operator;
    /** numeric (lt/gt 등), string (eq for regime), array (in) */
    value: number | string | (number | string)[];
    /** range (between) 시 [low, high] */
    range?: [number, number];
}
/** 3-Layer 조합 백테스트 설정. */
export interface CompositeStrategyConfig {
    /** 각 layer 의 condition 배열 — 같은 layer 내에선 AND 게이트. */
    signalConditions: LayerCondition[];
    macroConditions: LayerCondition[];
    waveConditions: LayerCondition[];
    /**
     * layer 간 결합 방식:
     *   - "all"  : 모든 layer 의 모든 condition AND (default)
     *   - "any"  : layer 중 하나만 충족해도 진입 (위험)
     *
     * 비활성 layer 는 conditions = [] 로 표시 (게이트 X).
     */
    layerCombineMode?: "all" | "any";
    /** 진입 후 Tier 1 / Tier 2 / Stop — ATR 기반 default. */
    riskReward?: {
        tier1AtrMultiplier?: number;
        tier2AtrMultiplier?: number;
        stopAtrMultiplier?: number;
    };
}
/**
 * Layer 평가에 필요한 시점-스냅샷. 미리 계산해서 evaluator 에 전달.
 *
 * 헌장 R3 (단독 시그널 X): 본 snapshot 은 *측정 용*. 단독 진입 발행 X —
 * 반드시 LayerCondition 조합 평가를 거침.
 */
export interface LayerSnapshot {
    rsi: number;
    bbLower: number;
    bbMiddle: number;
    bbUpper: number;
    price: number;
    adx: number;
    plusDi: number;
    minusDi: number;
    patternConfluence: number;
    volumeRatio: number;
    signalStrength: number;
    macroRegime?: "flooded" | "easy" | "neutral" | "tight" | "crisis";
    macroScore?: number;
    macroMult?: number;
    koreaModifier?: number;
    waveAlignment?: "perfect_up" | "partial_up" | "mixed" | "opposing" | "perfect_down";
    waveMult?: number;
    btcCycleRegime?: "bull" | "bear" | "neutral";
    trendDirection?: "BULLISH" | "BEARISH" | "SIDEWAYS";
    trendAdx?: number;
}
/** 단일 layer 의 평가 trace — UI 가 "왜 entry/skip" 을 보여줄 때 사용. */
export interface LayerEvaluation {
    layer: LayerName;
    passed: boolean;
    conditionResults: Array<{
        condition: LayerCondition;
        actualValue: number | string | null;
        passed: boolean;
        reason: string;
    }>;
}
/** Composite 평가 결과 — Entry 결정 + 디버그 trace. */
export interface CompositeEvaluation {
    entry: boolean;
    /** 각 layer 별 통과 여부 + condition 디테일. */
    layers: LayerEvaluation[];
    /** 진입 사유 (UI 표시용 — TradeDetailCard 의 entryReasons 에 매핑). */
    reasons: string[];
}
/** Composite 백테스트 결과 — 기존 BacktestResult 와 호환. */
export interface CompositeBacktestResult {
    config: CompositeStrategyConfig;
    overall: BacktestMetrics;
    bySymbol: Record<string, BacktestMetrics>;
    trades: BacktestTrade[];
    runAt: string;
    durationMs: number;
    /** 비활성/skipped layer + condition 통계 (사용자 디버깅). */
    layerStats: {
        signalPassRate: number;
        macroPassRate: number;
        wavePassRate: number;
        allPassRate: number;
    };
}
/** Indicator 메타 정보 — frontend condition builder 가 dropdown 채울 때 사용. */
export interface IndicatorMeta {
    layer: LayerName;
    name: IndicatorName;
    label: string;
    type: "number" | "string" | "enum";
    /** enum 일 때 가능 값. */
    enumValues?: string[];
    /** number 일 때 일반 range (hint). */
    numericRange?: {
        min: number;
        max: number;
    };
    description?: string;
}
export declare const INDICATOR_CATALOG: IndicatorMeta[];
/** Operator 메타. */
export interface OperatorMeta {
    name: Operator;
    label: string;
    /** 어떤 indicator type 에 사용 가능. */
    applicableTo: ("number" | "string" | "enum")[];
}
export declare const OPERATOR_CATALOG: OperatorMeta[];
/**
 * Default composite config — 사용자가 처음 백테스트 시작 시 reasonable starting point.
 *
 * Signal: RSI < 30 + BB 하단 근접 + ADX < 20 (BBDX mean reversion)
 * Macro:  regime IN ['easy', 'flooded'] (강한 유동성 환경)
 * Wave:   alignment IN ['perfect_up', 'partial_up'] (강세 정렬)
 */
export declare const DEFAULT_COMPOSITE_CONFIG: CompositeStrategyConfig;
export type { BacktestTrade, BacktestMetrics, Candle, TechnicalIndicators, TimeframeValue, };
