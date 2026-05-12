/**
 * BBDX v6.6 Weight Calibration — public exports.
 *
 * 외부 manifest + LSQ + R²/OOS/Wilson 검증 + 3 계층 fallback + F1 임계 calibration.
 */

export {
  DEFAULT_THRESHOLDS,
  DEFAULT_WEIGHTS,
  EXTERNAL_WEIGHTS_MANIFEST,
  classifySymbol,
  getExternalWeights,
  weightsFromSource,
} from "./external-manifest";
export type {
  ExternalWeightSource,
  SymbolClass,
  WeightMetadata,
  WeightPath,
  WeightSide,
  WeightTf,
  WeightVector,
} from "./external-manifest";

export {
  VALIDATION_THRESHOLDS,
  validateWeights,
} from "./validation";
export type {
  Recommendation,
  ValidationInput,
  WeightSource,
  WeightValidationResult,
} from "./validation";

export {
  computeOOSMatch,
  computeRSquared,
  computeWilsonCIWidth,
  solveConstrainedLSQ,
} from "./statistics";
export type { HistoricalSignal } from "./statistics";

export { calibrateThreshold } from "./threshold-calibration";
export type {
  ThresholdCalibrationResult,
  ThresholdSignal,
} from "./threshold-calibration";

export {
  autoCorrectThreshold,
  autoCorrectWeights,
} from "./auto-correction";
export type {
  AutoCorrectionResult,
  ThresholdAutoCorrectionResult,
} from "./auto-correction";

export {
  clearWeightCaches,
  getThresholdForSignal,
  getWeightsForSignal,
  getWeightsHistory,
  saveCalibratedThreshold,
  saveCalibratedWeights,
} from "./fetch";
export type {
  ThresholdFetchResult,
  WeightFetchInput,
  WeightFetchResult,
} from "./fetch";
