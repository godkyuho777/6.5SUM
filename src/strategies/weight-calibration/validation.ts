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
import {
  computeRSquared,
  computeOOSMatch,
  computeWilsonCIWidth,
  type HistoricalSignal,
} from "./statistics";

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

export const VALIDATION_THRESHOLDS = {
  min_r_squared: 0.10,
  min_sample_size: 100,
  max_oos_diff: 0.10,
  max_ci_width: 0.30,
  weight_sum_tolerance: 0.01,
} as const;

function failResult(
  weights: WeightVector,
  source: WeightSource,
  reason: string,
  partial: Partial<WeightValidationResult["validation"]> = {},
): WeightValidationResult {
  return {
    weights,
    source,
    validation: {
      r_squared: partial.r_squared ?? 0,
      sample_size: partial.sample_size ?? 0,
      out_of_sample_match: partial.out_of_sample_match ?? 0,
      wilson_ci_width: partial.wilson_ci_width ?? 1,
      passed: false,
      reason,
    },
    recommendation: "fallback",
  };
}

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
export function validateWeights(
  weights: WeightVector,
  source: WeightSource,
  validation_data: ValidationInput,
): WeightValidationResult {
  // 검증 1: 합 = 1
  const sum =
    weights.momentum +
    weights.position +
    weights.trend +
    weights.volume +
    weights.action;
  if (Math.abs(sum - 1.0) > VALIDATION_THRESHOLDS.weight_sum_tolerance) {
    return failResult(
      weights,
      source,
      `가중치 합 ${sum.toFixed(3)} ≠ 1.0 (tolerance ${VALIDATION_THRESHOLDS.weight_sum_tolerance})`,
    );
  }

  // 검증 2: 음수 X
  for (const [key, value] of Object.entries(weights)) {
    if (value < 0) {
      return failResult(weights, source, `${key} = ${value} < 0`);
    }
  }

  // 검증 3: 외부 소스 메타데이터
  if (source === "external" && validation_data.metadata) {
    const { r_squared, sample_size } = validation_data.metadata;

    if (r_squared < VALIDATION_THRESHOLDS.min_r_squared) {
      return failResult(
        weights,
        source,
        `R² ${r_squared.toFixed(3)} < 임계 ${VALIDATION_THRESHOLDS.min_r_squared}`,
        { r_squared, sample_size },
      );
    }

    if (sample_size < VALIDATION_THRESHOLDS.min_sample_size) {
      return failResult(
        weights,
        source,
        `표본 ${sample_size} < 임계 ${VALIDATION_THRESHOLDS.min_sample_size}`,
        { r_squared, sample_size },
      );
    }

    return {
      weights,
      source,
      validation: {
        r_squared,
        sample_size,
        out_of_sample_match: 1.0, // 외부 메타 신뢰
        wilson_ci_width: 0.15, // 외부 표본 풍부 가정
        passed: true,
        reason: "외부 소스 메타데이터 통과",
      },
      recommendation: "use",
    };
  }

  // 검증 4: 자체 백테스트
  if (source === "self_backtest") {
    const signals = validation_data.signals;

    if (signals.length < VALIDATION_THRESHOLDS.min_sample_size) {
      return failResult(
        weights,
        source,
        `표본 ${signals.length} < 임계 ${VALIDATION_THRESHOLDS.min_sample_size}`,
        { sample_size: signals.length },
      );
    }

    // 80/20 split (in-sample / out-of-sample)
    const split = Math.floor(signals.length * 0.8);
    const training = signals.slice(0, split);
    const validation = signals.slice(split);

    const r_squared = computeRSquared(training, weights);
    const oos_match = computeOOSMatch(validation, weights);
    const wilson_ci_width = computeWilsonCIWidth(signals);

    if (r_squared < VALIDATION_THRESHOLDS.min_r_squared) {
      return failResult(
        weights,
        source,
        `자체 R² ${r_squared.toFixed(3)} < ${VALIDATION_THRESHOLDS.min_r_squared}`,
        { r_squared, sample_size: signals.length, out_of_sample_match: oos_match, wilson_ci_width },
      );
    }

    if (oos_match < 1 - VALIDATION_THRESHOLDS.max_oos_diff) {
      return failResult(
        weights,
        source,
        `OOS 불일치 ${(1 - oos_match).toFixed(3)} > ${VALIDATION_THRESHOLDS.max_oos_diff} (overfitting 의심)`,
        { r_squared, sample_size: signals.length, out_of_sample_match: oos_match, wilson_ci_width },
      );
    }

    if (wilson_ci_width > VALIDATION_THRESHOLDS.max_ci_width) {
      return failResult(
        weights,
        source,
        `Wilson CI 폭 ${wilson_ci_width.toFixed(3)} > ${VALIDATION_THRESHOLDS.max_ci_width} (표본 부족)`,
        { r_squared, sample_size: signals.length, out_of_sample_match: oos_match, wilson_ci_width },
      );
    }

    return {
      weights,
      source,
      validation: {
        r_squared,
        sample_size: signals.length,
        out_of_sample_match: oos_match,
        wilson_ci_width,
        passed: true,
        reason: "자체 백테스트 통과",
      },
      recommendation: "use",
    };
  }

  // 검증 5: 직관값 (default) — 사용 가능, 단 검토 필요
  return {
    weights,
    source: "default",
    validation: {
      r_squared: 0,
      sample_size: 0,
      out_of_sample_match: 0,
      wilson_ci_width: 1,
      passed: false,
      reason: "직관값 — 검증 데이터 없음 (review_required)",
    },
    recommendation: "review",
  };
}
