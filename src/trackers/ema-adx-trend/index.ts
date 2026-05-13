/**
 * EMA + ADX 정배열 추세 트래커 — barrel export.
 */

export {
  evaluateEmaAdxSignal,
  scanEmaAdxSignals,
  type EmaAdxSignal,
  type EmaAdxSide,
  type EmaAdxBreakdown,
} from "./signal";

export {
  META,
  ENTRY_THRESHOLD,
  CONFIDENCE_WEIGHTS,
  EMA_PERIODS,
  ADX_MIN,
  ADX_STRONG,
} from "./constants";
