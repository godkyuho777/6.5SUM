export { CHARTER_VERSION, CAPITAL_LIMITS, DIMENSIONS, DIMENSION_META, RULES, type Dimension, type DimensionMeta, type RuleId, } from "./charter";
export { INDICATOR_REGISTRY, getIndicatorMeta, type IndicatorMeta, } from "./dimension-mapping";
export { validateAgainstCharter, formatValidationReport, type IndicatorRef, type StrategyDefinition, type ValidationResult, type Violation, type MissingDimension, } from "./validator";
export { checkPerTradeRisk, checkPositionSize, checkDailyLoss, checkDryRunGate, type RiskCheck, } from "./limits";
