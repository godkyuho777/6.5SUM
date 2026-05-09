/**
 * Capital protection — Charter Part I §V enforcement.
 *
 * These helpers are called from decideEntry (early-return) and from
 * the FE positions tooltip. The constants live in charter.ts so that
 * the validator can also reference them.
 */
export interface RiskCheck {
    allowed: boolean;
    reason?: string;
    /** What was checked, for UI tooltip display. */
    rule: "perTradeMaxRisk" | "positionMax" | "dailyLossLimit" | "dryRunGate" | "circuitBreaker";
}
export declare function checkPerTradeRisk(proposedRiskFraction: number): RiskCheck;
export declare function checkPositionSize(proposedSizeFraction: number): RiskCheck;
export declare function checkDailyLoss(realizedLossFractionToday: number): RiskCheck;
export declare function checkDryRunGate(daysInDryRun: number): RiskCheck;
