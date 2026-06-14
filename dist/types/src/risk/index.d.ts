/**
 * Risk Score 모듈 — public surface 재노출.
 *
 * ⚠ DISPLAY-ONLY (헌장 규칙 3): 이 모듈의 어떤 값도 BBDX 시그널/strength/
 * 포지션 결정에 사용되지 않는다. UI 표시 전용.
 */
export { computeRiskScore, computeMarketRisk, linMap, classifyBand, volatilityRisk, liquidityRisk, leverageRisk, trendRisk, regimeRisk, RISK_WEIGHTS, RISK_BAND_THRESHOLDS, MACRO_REGIME_RISK, type RiskInputs, } from "./score";
export { fetchRiskScore, fetchMarketRisk } from "./score-fetch";
export type { RiskBand, RiskDimensionName, RiskBreakdown, RiskScoreResult, MarketRiskResult, } from "./types";
