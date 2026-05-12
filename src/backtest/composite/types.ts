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

// ─────────────────────────────────────────────────────────
// Layer 정의
// ─────────────────────────────────────────────────────────

/** 3 Layer 식별자 — 각자 독립 지표 풀. */
export type LayerName = "signal" | "macro" | "wave";

/** Layer 별 사용 가능한 indicator 카탈로그. */
export type SignalIndicator =
  | "rsi"
  | "bbLowerProximity"     // (price - bbLower) / (bbUpper - bbLower) — 0~1
  | "bbUpperProximity"     // (bbUpper - price) / (bbUpper - bbLower) — 0~1
  | "adx"
  | "plusDi"
  | "minusDi"
  | "patternConfluence"    // 0~1 (aggregatePatternScore)
  | "volumeRatio"          // 최근 5캔들 평균 / 전체 평균
  | "signalStrength";      // 0~100 (BBDX 5-component 결과)

export type MacroIndicator =
  | "macroRegime"          // "flooded" | "easy" | "neutral" | "tight" | "crisis"
  | "macroScore"           // -1.0 ~ +1.0
  | "macroMult"            // 0.30 ~ 1.40
  | "koreaModifier";       // -0.05 / 0 / +0.05

export type WaveIndicator =
  | "waveAlignment"        // "perfect_up" | "partial_up" | "mixed" | "opposing" | "perfect_down"
  | "waveMult"             // 0.30 ~ 1.30
  | "btcCycleRegime"       // "bull" | "bear" | "neutral"
  | "trendDirection"       // single TF: "BULLISH" | "BEARISH" | "SIDEWAYS"
  | "trendAdx";            // 0~100

export type IndicatorName = SignalIndicator | MacroIndicator | WaveIndicator;

/** 비교 연산자. */
export type Operator =
  | "lt"     // <
  | "lte"    // ≤
  | "gt"     // >
  | "gte"    // ≥
  | "eq"     // ===
  | "neq"    // !==
  | "in"     // value ∈ [v1, v2, ...]
  | "between"; // v1 ≤ value ≤ v2

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
    tier1AtrMultiplier?: number;   // default 1.5
    tier2AtrMultiplier?: number;   // default 3.5
    stopAtrMultiplier?: number;     // default 1.0
  };
}

// ─────────────────────────────────────────────────────────
// Evaluation Context (시점 i 의 모든 지표 snapshot)
// ─────────────────────────────────────────────────────────

/**
 * Layer 평가에 필요한 시점-스냅샷. 미리 계산해서 evaluator 에 전달.
 *
 * 헌장 R3 (단독 시그널 X): 본 snapshot 은 *측정 용*. 단독 진입 발행 X —
 * 반드시 LayerCondition 조합 평가를 거침.
 */
export interface LayerSnapshot {
  // Signal Layer
  rsi: number;
  bbLower: number;
  bbMiddle: number;
  bbUpper: number;
  price: number;
  adx: number;
  plusDi: number;
  minusDi: number;
  patternConfluence: number;        // 0~1
  volumeRatio: number;
  signalStrength: number;           // 0~100

  // Macro Layer (외부 fetch 결과, snapshot 으로 freeze)
  macroRegime?: "flooded" | "easy" | "neutral" | "tight" | "crisis";
  macroScore?: number;              // -1.0 ~ +1.0
  macroMult?: number;
  koreaModifier?: number;

  // Wave Layer
  waveAlignment?:
    | "perfect_up"
    | "partial_up"
    | "mixed"
    | "opposing"
    | "perfect_down";
  waveMult?: number;
  btcCycleRegime?: "bull" | "bear" | "neutral";
  trendDirection?: "BULLISH" | "BEARISH" | "SIDEWAYS";
  trendAdx?: number;
}

// ─────────────────────────────────────────────────────────
// Result
// ─────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────
// Helper — Layer 카탈로그 (frontend builder 가 사용)
// ─────────────────────────────────────────────────────────

/** Indicator 메타 정보 — frontend condition builder 가 dropdown 채울 때 사용. */
export interface IndicatorMeta {
  layer: LayerName;
  name: IndicatorName;
  label: string;
  type: "number" | "string" | "enum";
  /** enum 일 때 가능 값. */
  enumValues?: string[];
  /** number 일 때 일반 range (hint). */
  numericRange?: { min: number; max: number };
  description?: string;
}

export const INDICATOR_CATALOG: IndicatorMeta[] = [
  // ── Signal Layer ──
  {
    layer: "signal",
    name: "rsi",
    label: "RSI",
    type: "number",
    numericRange: { min: 0, max: 100 },
    description: "Relative Strength Index. 과매도 < 30, 과매수 > 70.",
  },
  {
    layer: "signal",
    name: "bbLowerProximity",
    label: "BB 하단 근접도",
    type: "number",
    numericRange: { min: 0, max: 1 },
    description: "0 = bbLower, 1 = bbUpper. 평균회귀 진입은 0.1 이하.",
  },
  {
    layer: "signal",
    name: "bbUpperProximity",
    label: "BB 상단 근접도",
    type: "number",
    numericRange: { min: 0, max: 1 },
    description: "0 = bbUpper, 1 = bbLower. SHORT 진입은 0.1 이하.",
  },
  {
    layer: "signal",
    name: "adx",
    label: "ADX",
    type: "number",
    numericRange: { min: 0, max: 100 },
    description: "Average Directional Index. < 20 평균회귀 / > 25 추세 추종.",
  },
  {
    layer: "signal",
    name: "plusDi",
    label: "+DI",
    type: "number",
    numericRange: { min: 0, max: 100 },
  },
  {
    layer: "signal",
    name: "minusDi",
    label: "-DI",
    type: "number",
    numericRange: { min: 0, max: 100 },
  },
  {
    layer: "signal",
    name: "patternConfluence",
    label: "Pattern Confluence",
    type: "number",
    numericRange: { min: 0, max: 1 },
    description: "9 캔들 패턴 합산 0~1. 0.4 이상 hard gate.",
  },
  {
    layer: "signal",
    name: "volumeRatio",
    label: "거래량 비율",
    type: "number",
    numericRange: { min: 0, max: 5 },
    description: "최근 5캔들 평균 / 전체 평균. > 1.2 high volume.",
  },
  {
    layer: "signal",
    name: "signalStrength",
    label: "Signal Strength",
    type: "number",
    numericRange: { min: 0, max: 100 },
    description: "BBDX 5-component 합산 (0~100).",
  },

  // ── Macro Layer ──
  {
    layer: "macro",
    name: "macroRegime",
    label: "Macro Regime",
    type: "enum",
    enumValues: ["flooded", "easy", "neutral", "tight", "crisis"],
    description: "Macro Liquidity 5단계 (DXY/SOFR/YieldCurve/WALCL/F&G 합산).",
  },
  {
    layer: "macro",
    name: "macroScore",
    label: "Macro Score",
    type: "number",
    numericRange: { min: -1, max: 1 },
    description: "-1 (crisis) ~ +1 (flooded). 0 이 neutral.",
  },
  {
    layer: "macro",
    name: "macroMult",
    label: "Macro Multiplier",
    type: "number",
    numericRange: { min: 0.3, max: 1.4 },
    description: "BBDX confidence 곱셈체인 적용값.",
  },
  {
    layer: "macro",
    name: "koreaModifier",
    label: "Korea Modifier",
    type: "number",
    numericRange: { min: -0.05, max: 0.05 },
    description: "BOK base rate + KRW M2 보정 (-0.05/0/+0.05).",
  },

  // ── Wave Layer ──
  {
    layer: "wave",
    name: "waveAlignment",
    label: "Wave Alignment",
    type: "enum",
    enumValues: ["perfect_up", "partial_up", "mixed", "opposing", "perfect_down"],
    description: "Multi-TF 추세 정렬. perfect_up 가장 강세, opposing 가장 위험.",
  },
  {
    layer: "wave",
    name: "waveMult",
    label: "Wave Multiplier",
    type: "number",
    numericRange: { min: 0.3, max: 1.3 },
  },
  {
    layer: "wave",
    name: "btcCycleRegime",
    label: "BTC Cycle Regime",
    type: "enum",
    enumValues: ["bull", "bear", "neutral"],
    description: "BTC 가 200d MA 위 (+5%) / 아래 (-5%) / 범위 안.",
  },
  {
    layer: "wave",
    name: "trendDirection",
    label: "Trend Direction",
    type: "enum",
    enumValues: ["BULLISH", "BEARISH", "SIDEWAYS"],
    description: "현재 TF 의 추세 방향 (EMA + ADX 기반).",
  },
  {
    layer: "wave",
    name: "trendAdx",
    label: "Trend ADX",
    type: "number",
    numericRange: { min: 0, max: 100 },
    description: "추세 강도. > 25 강한 추세.",
  },
];

/** Operator 메타. */
export interface OperatorMeta {
  name: Operator;
  label: string;
  /** 어떤 indicator type 에 사용 가능. */
  applicableTo: ("number" | "string" | "enum")[];
}

export const OPERATOR_CATALOG: OperatorMeta[] = [
  { name: "lt", label: "<", applicableTo: ["number"] },
  { name: "lte", label: "≤", applicableTo: ["number"] },
  { name: "gt", label: ">", applicableTo: ["number"] },
  { name: "gte", label: "≥", applicableTo: ["number"] },
  { name: "eq", label: "=", applicableTo: ["number", "string", "enum"] },
  { name: "neq", label: "≠", applicableTo: ["number", "string", "enum"] },
  { name: "in", label: "∈ {...}", applicableTo: ["string", "enum"] },
  { name: "between", label: "∈ [a, b]", applicableTo: ["number"] },
];

// ─────────────────────────────────────────────────────────
// Default config (frontend pre-fill)
// ─────────────────────────────────────────────────────────

/**
 * Default composite config — 사용자가 처음 백테스트 시작 시 reasonable starting point.
 *
 * Signal: RSI < 30 + BB 하단 근접 + ADX < 20 (BBDX mean reversion)
 * Macro:  regime IN ['easy', 'flooded'] (강한 유동성 환경)
 * Wave:   alignment IN ['perfect_up', 'partial_up'] (강세 정렬)
 */
export const DEFAULT_COMPOSITE_CONFIG: CompositeStrategyConfig = {
  signalConditions: [
    { layer: "signal", indicator: "rsi", operator: "lt", value: 30 },
    {
      layer: "signal",
      indicator: "bbLowerProximity",
      operator: "lt",
      value: 0.2,
    },
    { layer: "signal", indicator: "adx", operator: "lt", value: 20 },
  ],
  macroConditions: [
    {
      layer: "macro",
      indicator: "macroRegime",
      operator: "in",
      value: ["easy", "flooded", "neutral"],
    },
  ],
  waveConditions: [
    {
      layer: "wave",
      indicator: "waveAlignment",
      operator: "in",
      value: ["perfect_up", "partial_up"],
    },
  ],
  layerCombineMode: "all",
  riskReward: {
    tier1AtrMultiplier: 1.5,
    tier2AtrMultiplier: 3.5,
    stopAtrMultiplier: 1.0,
  },
};

// Re-export types for convenience
export type {
  BacktestTrade,
  BacktestMetrics,
  Candle,
  TechnicalIndicators,
  TimeframeValue,
};
