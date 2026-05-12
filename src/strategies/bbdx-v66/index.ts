/**
 * BBDX v6.6 — public exports.
 *
 * v6.5 wrapping + calibrated weights/threshold + LONG/SHORT 양방향.
 */

export {
  evaluateLongV66,
  type V66LongInput,
  type V66LongResult,
} from "./long-entry";

export {
  computeShortStopIndicator,
  evaluateShortV66,
  type V66ShortInput,
  type V66ShortResult,
} from "./short-entry";

export {
  evaluatePositionSignalsV66,
  type V66EvaluateInput,
  type V66EvaluateOutput,
} from "./evaluate";

export {
  extractScoreComponents,
  type ScoreComponents,
  type ScoreExtractInput,
} from "./score-components";
