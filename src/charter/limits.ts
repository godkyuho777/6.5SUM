/**
 * Capital protection — Charter Part I §V enforcement.
 *
 * These helpers are called from decideEntry (early-return) and from
 * the FE positions tooltip. The constants live in charter.ts so that
 * the validator can also reference them.
 */

import { CAPITAL_LIMITS } from "./charter";

export interface RiskCheck {
  allowed: boolean;
  reason?: string;
  /** What was checked, for UI tooltip display. */
  rule:
    | "perTradeMaxRisk"
    | "positionMax"
    | "dailyLossLimit"
    | "dryRunGate"
    | "circuitBreaker";
}

export function checkPerTradeRisk(
  proposedRiskFraction: number
): RiskCheck {
  if (proposedRiskFraction > CAPITAL_LIMITS.perTradeMaxRisk) {
    return {
      allowed: false,
      rule: "perTradeMaxRisk",
      reason: `Per-trade risk ${(proposedRiskFraction * 100).toFixed(2)}% exceeds Charter limit of ${(CAPITAL_LIMITS.perTradeMaxRisk * 100).toFixed(0)}%.`,
    };
  }
  return { allowed: true, rule: "perTradeMaxRisk" };
}

export function checkPositionSize(
  proposedSizeFraction: number
): RiskCheck {
  if (proposedSizeFraction > CAPITAL_LIMITS.positionMax) {
    return {
      allowed: false,
      rule: "positionMax",
      reason: `Position size ${(proposedSizeFraction * 100).toFixed(2)}% exceeds Charter limit of ${(CAPITAL_LIMITS.positionMax * 100).toFixed(0)}%.`,
    };
  }
  return { allowed: true, rule: "positionMax" };
}

export function checkDailyLoss(
  realizedLossFractionToday: number
): RiskCheck {
  if (realizedLossFractionToday >= CAPITAL_LIMITS.dailyLossLimit) {
    return {
      allowed: false,
      rule: "dailyLossLimit",
      reason: `Daily loss ${(realizedLossFractionToday * 100).toFixed(2)}% reached Charter limit of ${(CAPITAL_LIMITS.dailyLossLimit * 100).toFixed(0)}%. New entries blocked for 24h.`,
    };
  }
  return { allowed: true, rule: "dailyLossLimit" };
}

export function checkDryRunGate(daysInDryRun: number): RiskCheck {
  if (daysInDryRun < CAPITAL_LIMITS.dryRunDays) {
    return {
      allowed: false,
      rule: "dryRunGate",
      reason: `Live bot requires ${CAPITAL_LIMITS.dryRunDays} days dry-run; currently ${daysInDryRun}.`,
    };
  }
  return { allowed: true, rule: "dryRunGate" };
}
