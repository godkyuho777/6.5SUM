/**
 * Threshold Calibration — F1 score 최대화 (BBDX_v66_PERP §3.2).
 *
 * 절차:
 *   1. 과거 시그널 (confidence + outcome.win) 입력
 *   2. threshold 후보 [30, 35, 40, 45, 50, 55, 60, 65, 70] 순회
 *   3. 각 threshold 의 precision/recall/F1 계산
 *   4. F1 ≥ 0.5 인 후보 중 최대 F1 의 threshold 채택
 *   5. 80/20 OOS 검증 (training 의 best threshold 를 validation set 에서 재평가)
 *
 * threshold 가 너무 작으면 false positive ↑ (precision ↓), 너무 크면 시그널 빈도 ↓
 * (recall ↓). F1 = 2·precision·recall / (precision + recall) 가 균형.
 */
export interface ThresholdSignal {
    confidence: number;
    outcome: {
        win: 0 | 1;
    };
}
export interface ThresholdCalibrationResult {
    threshold: number | null;
    f1_score: number | null;
    precision: number | null;
    recall: number | null;
    sample_size: number;
    oos_validation_passed: boolean;
    reason: string;
}
/**
 * calibrate_threshold — F1 최대화 + OOS 검증.
 */
export declare function calibrateThreshold(signals: ThresholdSignal[]): ThresholdCalibrationResult;
