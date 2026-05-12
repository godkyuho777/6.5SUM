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
export declare const DEFAULT_WEIGHTS: Record<WeightPath, WeightVector>;
/**
 * Default thresholds (Priority 3) — v6.5 의 직관값.
 */
export declare const DEFAULT_THRESHOLDS: Record<WeightSide, number>;
export declare const EXTERNAL_WEIGHTS_MANIFEST: ExternalWeightSource[];
/**
 * symbol → class 분류.
 *  - BTCUSDT: 'BTC'
 *  - ETHUSDT: 'ETH'
 *  - SOL/ADA/XRP: 'major_alts'
 *  - others: 'all'
 */
export declare function classifySymbol(symbol: string): SymbolClass;
/**
 * (symbol, tf, path, side) → external weights.
 *
 * 매칭 우선순위:
 *   1. symbol_class 정확 매칭 (BTC/ETH/major_alts)
 *   2. symbol_class === 'all' (catch-all)
 *
 * 찾지 못하면 null. caller 는 DEFAULT_WEIGHTS[path] fallback.
 */
export declare function getExternalWeights(symbol: string, tf: string, path: string, side: WeightSide): ExternalWeightSource | null;
/**
 * ExternalWeightSource → WeightVector (정규화 검증 포함).
 */
export declare function weightsFromSource(source: ExternalWeightSource): WeightVector;
