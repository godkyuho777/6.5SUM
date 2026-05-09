/**
 * BBDX × Onchain Integration
 *
 * 명세서 §4 그대로:
 *
 *   진입 multiplier = 1 + onchain.score × 0.30
 *     score +1.0 → ×1.30
 *     score  0   → ×1.00
 *     score -1.0 → ×0.70
 *
 *   strong_distribution + 평균회귀 진입 → 차단 (자본 보호)
 *
 *   EXIT reversal_score 보정:
 *     distribution / strong_distribution → +0.15 (가속)
 *     strong_accumulation                → -0.10 (보류)
 *
 * 헌장 규칙 3 준수: 단독 시그널 X, BBDX 가중치로만 작동.
 */
import type { OnchainAdjustedEntry, OnchainScore } from "./types";
export interface BbdxSignalLike {
    /** 0~100 base strength (BBDX path 결과). */
    strength: number;
    /** 진입 path. 평균회귀(BB:Mean / BB:Snap)와 추세(BB:Riding) 구분. */
    path?: string | null;
}
export declare function applyOnchainToEntry(signal: BbdxSignalLike, onchain: OnchainScore): OnchainAdjustedEntry;
/**
 * BBDX SHORT 진입에 온체인 multiplier 적용 — `applyOnchainToEntry` 의 미러.
 *
 *   진입 multiplier = 1 - onchain.score × 0.30   (LONG 과 부호 반대)
 *     score +1.0 → ×0.70 (강한 매집 환경에서 SHORT 약화)
 *     score  0   → ×1.00
 *     score -1.0 → ×1.30 (강한 분배 환경에서 SHORT 강화)
 *
 *   strong_accumulation + 평균회귀 SHORT path → 차단 (자본 보호 미러)
 *   (lowerRiding = 추세 추종 SHORT 만 예외 허용)
 *
 * SHORT path 인자 매핑:
 *   "BB:lowerRiding" → 추세 추종 (자본 보호 차단 면제)
 *   그 외             → 평균회귀 (strong_accumulation 차단)
 */
export declare function applyOnchainShortToEntry(signal: BbdxSignalLike, onchain: OnchainScore): OnchainAdjustedEntry;
/** BBDX EXIT reversal_score (v6.3 [EXIT-B]) 에 온체인 regime 보정 적용. */
export declare function applyOnchainToExit(baseReversalScore: number, onchain: OnchainScore): {
    adjustedScore: number;
    delta: number;
    reason: string;
};
