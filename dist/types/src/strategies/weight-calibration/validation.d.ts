/**
 * Weight Validation Module (WEIGHT_SYSTEM §2.2).
 *
 * 검증 절차:
 *   1. 합 = 1 (±0.01 tolerance)
 *   2. 모든 값 ≥ 0
 *   3. R² ≥ 0.10
 *   4. 표본 ≥ 100
 *   5. OOS 불일치 ≤ 0.10
 *   6. Wilson CI 폭 ≤ 0.30
 *
 * 결과 분류 (3 단계):
 *   - 'use'      모든 검증 통과 — production 적용
 *   - 'fallback' 검증 실패 — 다음 priority (외부 → default)
 *   - 'review'   직관값 — 사용 가능하나 검토 필요 (status='review_required' 표시)
 *
 * 헌장 규칙 2 (백테스트 알파 검증) 의 핵심 게이트.
 */
import type { WeightVector } from "./external-manifest";
import { type HistoricalSignal } from "./statistics";
export type WeightSource = "self_backtest" | "external" | "default";
export type Recommendation = "use" | "fallback" | "review";
export interface WeightValidationResult {
    weights: WeightVector;
    source: WeightSource;
    validation: {
        r_squared: number;
        sample_size: number;
        out_of_sample_match: number;
        wilson_ci_width: number;
        passed: boolean;
        reason: string;
    };
    recommendation: Recommendation;
}
export declare const VALIDATION_THRESHOLDS: {
    readonly min_r_squared: 0.1;
    readonly min_sample_size: 100;
    readonly max_oos_diff: 0.1;
    readonly max_ci_width: 0.3;
    readonly weight_sum_tolerance: 0.01;
};
export interface ValidationInput {
    signals: HistoricalSignal[];
    metadata?: {
        r_squared: number;
        sample_size: number;
    };
}
/**
 * validateWeights — WEIGHT_SYSTEM §2.2 구현.
 *
 * @param weights        검증할 가중치
 * @param source         출처 ('self_backtest' | 'external' | 'default')
 * @param validation_data signals (self_backtest 시 필수) 또는 metadata (external)
 */
export declare function validateWeights(weights: WeightVector, source: WeightSource, validation_data: ValidationInput): WeightValidationResult;
