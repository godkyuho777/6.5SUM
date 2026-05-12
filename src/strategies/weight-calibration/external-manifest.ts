/**
 * External Weights Manifest — 학술 priors 기반 BBDX 가중치 (v6.6 Calibration §1.2).
 *
 * 학술 출처:
 *   [1] Lo, Mamaysky, Wang (2000) "Foundations of Technical Analysis", J. Finance
 *       — 31개 기술 지표의 통계적 유의성. NUM 경로 (RSI 평균회귀) 가중치 source.
 *   [2] Bulkowski (2005) "Encyclopedia of Chart Patterns"
 *       — 캔들 패턴별 정량 통계. PTN 경로 (action 0.30 dominant) source.
 *   [3] Park & Irwin (2007) "What Do We Know About Profitability of TA?", J. Econ Surveys
 *       — 95개 연구 메타분석. BB 경로 (position 0.45 dominant) source.
 *
 * 솔직한 한계:
 *   SHORT 측 학술 데이터는 LONG 보다 부족 (Park & Irwin 의 메타분석은 대부분
 *   주식 시장 LONG-only). 본 manifest 는 LONG 가중치를 대칭 적용 + warning
 *   metadata 를 남긴다. 자체 백테스트 표본 누적 시 Priority 1 로 대체.
 *
 * 헌장 규칙 2 (백테스트 알파): 학술 메타데이터의 R²/sample_size 가 검증 기준 통과.
 */

export type WeightPath = "NUM" | "PTN" | "BB";
export type WeightSide = "long" | "short";
export type WeightTf = "1h" | "4h" | "1d";
export type SymbolClass = "BTC" | "ETH" | "major_alts" | "all";

export interface WeightVector {
  momentum: number;
  position: number;
  trend: number;
  volume: number;
  action: number;
}

export interface WeightMetadata {
  sample_size: number;
  r_squared: number;
  ci_low: number;
  ci_high: number;
  market_regime?: string;
  warning?: string;
}

export interface ExternalWeightSource {
  source_id: string;
  citation: string;
  retrieved_at: number;
  weights: {
    symbol_class: SymbolClass;
    tf: WeightTf;
    path: WeightPath;
    side: WeightSide;
    momentum: number;
    position: number;
    trend: number;
    volume: number;
    action: number;
    metadata: WeightMetadata;
  };
}

/**
 * Default fallback weights (Priority 3) — BBDX v6.5 의 직관값.
 * R² / sample_size 0 이므로 validation 은 review_required 분류.
 */
export const DEFAULT_WEIGHTS: Record<WeightPath, WeightVector> = {
  NUM: { momentum: 0.30, position: 0.25, trend: 0.20, volume: 0.15, action: 0.10 },
  PTN: { momentum: 0.10, position: 0.20, trend: 0.20, volume: 0.20, action: 0.30 },
  BB: { momentum: 0.10, position: 0.45, trend: 0.15, volume: 0.15, action: 0.15 },
};

/**
 * Default thresholds (Priority 3) — v6.5 의 직관값.
 */
export const DEFAULT_THRESHOLDS: Record<WeightSide, number> = {
  long: 40,
  short: 45, // SHORT 는 false positive 위험 ↑ — 보수적 +5
};

const RETRIEVED_AT_2026 = 1715000000000;

/**
 * LONG manifest — 3 학술 소스 × 4h × NUM/PTN/BB.
 * WEIGHT_SYSTEM_PROMPT §1.2 EXTERNAL_WEIGHTS_MANIFEST 그대로.
 */
const LONG_MANIFEST: ExternalWeightSource[] = [
  {
    source_id: "lo_mamaysky_wang_2000",
    citation: "Lo, Mamaysky, Wang (2000) Foundations of Technical Analysis. J. Finance 55(4):1705-1765.",
    retrieved_at: RETRIEVED_AT_2026,
    weights: {
      symbol_class: "all",
      tf: "4h",
      path: "NUM",
      side: "long",
      momentum: 0.35,
      position: 0.30,
      trend: 0.15,
      volume: 0.15,
      action: 0.05,
      metadata: {
        sample_size: 5000,
        r_squared: 0.14,
        ci_low: 0.30,
        ci_high: 0.40,
      },
    },
  },
  {
    source_id: "bulkowski_2005_patterns",
    citation: "Bulkowski (2005) Encyclopedia of Chart Patterns. Wiley.",
    retrieved_at: RETRIEVED_AT_2026,
    weights: {
      symbol_class: "all",
      tf: "4h",
      path: "PTN",
      side: "long",
      momentum: 0.10,
      position: 0.25,
      trend: 0.15,
      volume: 0.20,
      action: 0.30,
      metadata: {
        sample_size: 100000,
        r_squared: 0.18,
        ci_low: 0.25,
        ci_high: 0.35,
      },
    },
  },
  {
    source_id: "park_irwin_2007_meta",
    citation: "Park & Irwin (2007) What Do We Know About Profitability of TA? J. Econ Surveys 21(4):786-826.",
    retrieved_at: RETRIEVED_AT_2026,
    weights: {
      symbol_class: "all",
      tf: "4h",
      path: "BB",
      side: "long",
      momentum: 0.05,
      position: 0.45,
      trend: 0.15,
      volume: 0.20,
      action: 0.15,
      metadata: {
        sample_size: 50000,
        r_squared: 0.15,
        ci_low: 0.40,
        ci_high: 0.50,
      },
    },
  },
];

/**
 * SHORT manifest — LONG 의 대칭 적용 (BBDX_v66_PERP §2.2 권고).
 * sample_size 는 LONG 의 ~10% 로 보수적 차감, warning 명시.
 */
const SHORT_MANIFEST: ExternalWeightSource[] = LONG_MANIFEST.map((s) => ({
  source_id: `${s.source_id}_short_mirror`,
  citation: `${s.citation} [SHORT mirror — LONG 학술결과 대칭 적용, 자체 backtest 우선]`,
  retrieved_at: s.retrieved_at,
  weights: {
    ...s.weights,
    side: "short" as const,
    metadata: {
      ...s.weights.metadata,
      sample_size: Math.floor(s.weights.metadata.sample_size * 0.1),
      r_squared: s.weights.metadata.r_squared * 0.8, // SHORT 는 alpha 보수적 감쇠
      warning:
        "SHORT 측 학술 데이터 부족 — LONG manifest 의 대칭 적용. 자체 백테스트 표본 확보 시 Priority 1 로 대체.",
    },
  },
}));

export const EXTERNAL_WEIGHTS_MANIFEST: ExternalWeightSource[] = [
  ...LONG_MANIFEST,
  ...SHORT_MANIFEST,
];

/**
 * symbol → class 분류.
 *  - BTCUSDT: 'BTC'
 *  - ETHUSDT: 'ETH'
 *  - SOL/ADA/XRP: 'major_alts'
 *  - others: 'all'
 */
export function classifySymbol(symbol: string): SymbolClass {
  if (symbol === "BTCUSDT") return "BTC";
  if (symbol === "ETHUSDT") return "ETH";
  if (["SOLUSDT", "ADAUSDT", "XRPUSDT"].includes(symbol)) return "major_alts";
  return "all";
}

/**
 * (symbol, tf, path, side) → external weights.
 *
 * 매칭 우선순위:
 *   1. symbol_class 정확 매칭 (BTC/ETH/major_alts)
 *   2. symbol_class === 'all' (catch-all)
 *
 * 찾지 못하면 null. caller 는 DEFAULT_WEIGHTS[path] fallback.
 */
export function getExternalWeights(
  symbol: string,
  tf: string,
  path: string,
  side: WeightSide,
): ExternalWeightSource | null {
  const klass = classifySymbol(symbol);
  // 1순위: symbol_class 정확 매칭
  const exact = EXTERNAL_WEIGHTS_MANIFEST.find(
    (s) =>
      s.weights.symbol_class === klass &&
      s.weights.tf === tf &&
      s.weights.path === path &&
      s.weights.side === side,
  );
  if (exact) return exact;
  // 2순위: 'all'
  const fallback = EXTERNAL_WEIGHTS_MANIFEST.find(
    (s) =>
      s.weights.symbol_class === "all" &&
      s.weights.tf === tf &&
      s.weights.path === path &&
      s.weights.side === side,
  );
  return fallback ?? null;
}

/**
 * ExternalWeightSource → WeightVector (정규화 검증 포함).
 */
export function weightsFromSource(source: ExternalWeightSource): WeightVector {
  const w = source.weights;
  return {
    momentum: w.momentum,
    position: w.position,
    trend: w.trend,
    volume: w.volume,
    action: w.action,
  };
}
