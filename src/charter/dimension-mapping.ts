/**
 * Indicator → dimension mapping.
 *
 * Per spec Part II.2 §8: this table stays human-curated. LLM auto-mapping
 * is unreliable. Add a new indicator here when you implement it; the
 * validator uses this table to detect duplicate-dimension violations.
 */

import type { Dimension } from "./charter";

export interface IndicatorMeta {
  /** Canonical indicator id used in code. */
  name: string;
  /** Primary dimension this indicator covers. */
  dimension: Dimension;
  /**
   * Optional secondary dimensions. When set, the indicator is treated
   * as cross-dimensional (e.g. ATR is volatility-primary but feeds
   * trend-quality scoring). Duplicate-dimension check ignores secondary
   * mappings unless they're the primary for two indicators in the same
   * strategy.
   */
  secondary?: Dimension[];
  /**
   * Some indicators measure a different angle of the same dimension and
   * are explicitly allowed to coexist (charter Rule 1 exception).
   * Example: MACD_histogram + RSI are both momentum but measure
   * different angles, so both can appear in one strategy.
   */
  allowsSameDimensionPair?: string[];
}

export const INDICATOR_REGISTRY: Readonly<Record<string, IndicatorMeta>> = {
  // ── 1. Momentum
  RSI: {
    name: "RSI",
    dimension: "momentum",
    allowsSameDimensionPair: ["MACD_histogram"],
  },
  MACD_histogram: {
    name: "MACD_histogram",
    dimension: "momentum",
    allowsSameDimensionPair: ["RSI"],
  },
  ROC: { name: "ROC", dimension: "momentum" },

  // ── 2. Volatility
  BB: { name: "BB", dimension: "volatility" },
  ATR: { name: "ATR", dimension: "volatility", secondary: ["trend"] },
  BB_width: { name: "BB_width", dimension: "volatility" },

  // ── 3. Trend
  ADX: { name: "ADX", dimension: "trend" },
  "DI+/-": { name: "DI+/-", dimension: "trend" },
  EMA_Ribbon: { name: "EMA_Ribbon", dimension: "trend" },
  EMA: { name: "EMA", dimension: "trend" },
  EMA_9_21_50: { name: "EMA_9_21_50", dimension: "trend" },

  // ── 4. Volume / liquidity
  Volume_zscore: { name: "Volume_zscore", dimension: "volume" },
  OBV: { name: "OBV", dimension: "volume" },
  CVD: { name: "CVD", dimension: "volume" },
  VWAP: { name: "VWAP", dimension: "volume" },
  Volume_Profile: { name: "Volume_Profile", dimension: "volume" },

  // ── 5. Structure
  Fibonacci: { name: "Fibonacci", dimension: "structure" },
  Trendline: { name: "Trendline", dimension: "structure" },
  Order_Block: { name: "Order_Block", dimension: "structure" },
  Liquidity_Pool: { name: "Liquidity_Pool", dimension: "structure" },
  Wave_Tracker: { name: "Wave_Tracker", dimension: "structure" },
  Candle_Pattern: { name: "Candle_Pattern", dimension: "structure" },

  // ── 6. Macro
  DXY: { name: "DXY", dimension: "macro" },
  "SOFR-IORB": { name: "SOFR-IORB", dimension: "macro" },
  "Fear&Greed": { name: "Fear&Greed", dimension: "macro" },
  BTC_dominance: { name: "BTC_dominance", dimension: "macro" },
  Macro_Liquidity: { name: "Macro_Liquidity", dimension: "macro" },
  // MACRO_v2 composite signals (등록 — INDICATOR_TO_DIMENSION 와 정합).
  // 모두 macro 차원의 다른 측정 각도이므로 rule1Exempt 필요 시 별도 처리.
  Macro_C1_Crisis: { name: "Macro_C1_Crisis", dimension: "macro" },
  Macro_C2_RiskOn: { name: "Macro_C2_RiskOn", dimension: "macro" },
  Macro_C3_NetLiquidity: { name: "Macro_C3_NetLiquidity", dimension: "macro" },
  Macro_C4_CyclePhase: { name: "Macro_C4_CyclePhase", dimension: "macro" },
  Macro_VIX: { name: "Macro_VIX", dimension: "macro" },
  Macro_DXY_30d: { name: "Macro_DXY_30d", dimension: "macro" },
  Macro_RealRate: { name: "Macro_RealRate", dimension: "macro" },
  Macro_YieldCurve: { name: "Macro_YieldCurve", dimension: "macro" },
  Macro_WALCL_30d: { name: "Macro_WALCL_30d", dimension: "macro" },
  Macro_RRP_TGA_30d: { name: "Macro_RRP_TGA_30d", dimension: "macro" },
  Macro_BOK_Rate_90d: { name: "Macro_BOK_Rate_90d", dimension: "macro" },
  Macro_KRW_30d: { name: "Macro_KRW_30d", dimension: "macro" },

  // ── 7. Onchain
  Exchange_Netflow: { name: "Exchange_Netflow", dimension: "onchain" },
  Whale_Alert: { name: "Whale_Alert", dimension: "onchain" },
  Stablecoin_Supply: { name: "Stablecoin_Supply", dimension: "onchain" },
  Coinbase_Premium: { name: "Coinbase_Premium", dimension: "onchain" },
  ETF_Flow: { name: "ETF_Flow", dimension: "onchain" },
  Miner_Outflow: { name: "Miner_Outflow", dimension: "onchain" },
  LTH_Supply: { name: "LTH_Supply", dimension: "onchain" },
};

export function getIndicatorMeta(name: string): IndicatorMeta | undefined {
  return INDICATOR_REGISTRY[name];
}

// ─── Additional Strategies (03_ADDITIONAL_STRATEGIES.md) ──────────────
// 6개 추가 modifier 의 7차원 매핑. 헌장 검증 + UI 시각화용.
// 모든 modifier 는 multiplier-only (헌장 규칙 3) — standalone 시그널 X.

/** 추가 modifier 별 dimension 번호 (1~7) + 헌장 규칙 1 면제 여부. */
export interface AdditionalModifierMeta {
  dimension: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  /**
   * 같은 dimension 의 다른 indicator 와 동시 사용 허용 (헌장 규칙 1 예외).
   * 측정 각도가 명확히 다를 때만 true.
   */
  rule1Exempt: boolean;
  /** 베타 (정량화 미숙성). UI 에서 "베타" 라벨 표시. */
  beta: boolean;
}

export const ADDITIONAL_MODIFIER_DIMENSIONS: Readonly<
  Record<string, AdditionalModifierMeta>
> = {
  // 1차원 momentum — RSI 와 다른 각도 (level vs momentum-of-momentum)
  macdDivergence: { dimension: 1, rule1Exempt: true, beta: false },
  // 5차원 structure — Fib/Trendline 과 다른 각도 (확정 레벨 vs 유동성 sweep)
  orderBlock: { dimension: 5, rule1Exempt: true, beta: true },
  // 6차원 macro — Wave Tracker 와 다른 각도 (composite vs single-symbol perp)
  fundingExtreme: { dimension: 6, rule1Exempt: true, beta: false },
  // 6차원 macro — Wave Tracker 와 다른 각도 (펀딩/OI vs RSI 분포)
  marketBreadth: { dimension: 6, rule1Exempt: true, beta: false },
  // 5차원 structure — Trend Analysis Engine v2.0 의 Wave Alignment.
  // 4개 TF 에서 ADX/EMA 를 사용하지만 측정 각도가 다름 — 단일 TF 의 추세 강도가
  // 아니라 *멀티 TF 정합 상태* (HH/HL 시장구조). 헌장 규칙 1 면제.
  waveAlignment: { dimension: 5, rule1Exempt: true, beta: false },
} as const;

export function getAdditionalModifierMeta(
  name: string
): AdditionalModifierMeta | undefined {
  return ADDITIONAL_MODIFIER_DIMENSIONS[name];
}
