/**
 * Auto-Correction (WEIGHT_SYSTEM §2.3).
 *
 * 3-단계 fallback:
 *   Priority 1: 자체 백테스트 → solveConstrainedLSQ + validateWeights (use)
 *   Priority 2: 외부 manifest → validateWeights (use)
 *   Priority 3: 직관값 fallback (status=review_required)
 *
 * 각 단계 성공 시 saveCalibratedWeights 호출 + 캐시 invalidate.
 *
 * 본 모듈은 cron + admin manual trigger 양쪽에서 사용.
 */
import { type WeightSide, type WeightVector } from "./external-manifest";
import { type WeightFetchInput } from "./fetch";
import { type HistoricalSignal } from "./statistics";
import { type ThresholdSignal } from "./threshold-calibration";
export interface AutoCorrectionResult {
    symbol: string;
    tf: string;
    path: string;
    side: WeightSide;
    weights: WeightVector;
    source: "self_backtest" | "external" | "default";
    status: "production" | "review_required";
    metadata: Record<string, unknown>;
    saved: boolean;
    reason: string;
}
/**
 * autoCorrectWeights — 단일 (symbol, tf, path, side) 조합의 가중치 재calibration.
 *
 * @param input         타겟 조합
 * @param signalsFetch  자체 historical signals 공급 함수 (테스트에서 mock 가능).
 *                      undefined 시 Priority 1 건너뜀.
 */
export declare function autoCorrectWeights(input: WeightFetchInput, signalsFetch?: (input: WeightFetchInput) => Promise<HistoricalSignal[]>): Promise<AutoCorrectionResult>;
export interface ThresholdAutoCorrectionResult {
    symbol: string;
    tf: string;
    side: WeightSide;
    threshold: number;
    source: "self_backtest" | "external" | "default";
    status: "production" | "review_required";
    saved: boolean;
    reason: string;
}
/**
 * autoCorrectThreshold — F1 calibration + fallback.
 */
export declare function autoCorrectThreshold(input: {
    symbol: string;
    tf: string;
    side: WeightSide;
}, signalsFetch?: (input: {
    symbol: string;
    tf: string;
    side: WeightSide;
}) => Promise<ThresholdSignal[]>): Promise<ThresholdAutoCorrectionResult>;
