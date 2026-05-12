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
  confidence: number; // 0~100 (BBDX 의 final_score)
  outcome: { win: 0 | 1 };
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

const THRESHOLD_CANDIDATES = [30, 35, 40, 45, 50, 55, 60, 65, 70];
const MIN_F1_SCORE = 0.5;
const MIN_SAMPLE_SIZE = 100;

function computeMetricsAt(
  signals: ThresholdSignal[],
  threshold: number,
): { precision: number; recall: number; f1: number; tp: number; fp: number; fn: number } {
  let tp = 0,
    fp = 0,
    fn = 0;
  for (const s of signals) {
    const predicted = s.confidence >= threshold;
    const actual = s.outcome.win === 1;
    if (predicted && actual) tp++;
    else if (predicted && !actual) fp++;
    else if (!predicted && actual) fn++;
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision, recall, f1, tp, fp, fn };
}

/**
 * calibrate_threshold — F1 최대화 + OOS 검증.
 */
export function calibrateThreshold(
  signals: ThresholdSignal[],
): ThresholdCalibrationResult {
  if (signals.length < MIN_SAMPLE_SIZE) {
    return {
      threshold: null,
      f1_score: null,
      precision: null,
      recall: null,
      sample_size: signals.length,
      oos_validation_passed: false,
      reason: `표본 ${signals.length} < 임계 ${MIN_SAMPLE_SIZE}`,
    };
  }

  // 80/20 split
  const split = Math.floor(signals.length * 0.8);
  const training = signals.slice(0, split);
  const validation = signals.slice(split);

  let bestThreshold: number | null = null;
  let bestF1 = -1;
  let bestPrecision = 0;
  let bestRecall = 0;

  for (const threshold of THRESHOLD_CANDIDATES) {
    const m = computeMetricsAt(training, threshold);
    if (m.tp + m.fp === 0) continue; // 시그널 없음
    if (m.f1 > bestF1) {
      bestF1 = m.f1;
      bestThreshold = threshold;
      bestPrecision = m.precision;
      bestRecall = m.recall;
    }
  }

  if (bestThreshold === null || bestF1 < MIN_F1_SCORE) {
    return {
      threshold: null,
      f1_score: bestF1 < 0 ? null : bestF1,
      precision: null,
      recall: null,
      sample_size: signals.length,
      oos_validation_passed: false,
      reason: `F1 ${bestF1.toFixed(3)} < ${MIN_F1_SCORE} (모든 후보 임계)`,
    };
  }

  // OOS 검증
  const oosMetrics = computeMetricsAt(validation, bestThreshold);
  const oosPassed = oosMetrics.f1 >= MIN_F1_SCORE * 0.8; // OOS 는 20% degradation 허용

  return {
    threshold: bestThreshold,
    f1_score: bestF1,
    precision: bestPrecision,
    recall: bestRecall,
    sample_size: signals.length,
    oos_validation_passed: oosPassed,
    reason: oosPassed
      ? `F1 ${bestF1.toFixed(3)} @ threshold ${bestThreshold} (OOS F1 ${oosMetrics.f1.toFixed(3)})`
      : `OOS F1 ${oosMetrics.f1.toFixed(3)} 저하 — overfitting 의심`,
  };
}
