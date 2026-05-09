/**
 * [EXIT-C] Protection — Part II.1 §1.4.
 *
 * Three layers of stop movement (no exit, just protect what's earned):
 *   C1. Breakeven move at +2% PnL — moves stop to entry
 *   C2. Trailing stop at +5% PnL — chases at -3%
 *   C3. ATR-based trailing at +3% PnL — uses 1.5× ATR
 *
 * Returns the new stop price to set, or null if no movement is due.
 * Always picks the highest stop among the layers that fire (never
 * lowers the stop).
 */
export interface PositionState {
    entryPrice: number;
    /** Current stop price set on the position. */
    currentStop: number;
    /** True after a breakeven move has already been applied. */
    stopMovedToBreakeven: boolean;
}
export interface ProtectionContext {
    position: PositionState;
    price: number;
    /** ATR(14) value — used by the C3 layer. Pass undefined to skip. */
    atr?: number;
}
export interface ProtectionResult {
    triggered: boolean;
    newStop: number | null;
    reason: string;
    /** Which sub-layer fired (C1/C2/C3) for telemetry. */
    layer?: "C1" | "C2" | "C3";
}
export declare function checkProtection(ctx: ProtectionContext): ProtectionResult;
