/**
 * [EXIT-D] Time stop — Part II.1 §1.5.
 *
 * Capital turnover protection: positions that go nowhere block other
 * signals from being taken. Two thresholds:
 *   30 bars + < +0.5% PnL → full exit
 *   50 bars + < +1.0% PnL → full exit
 *
 * Bar interval is implied by the candle timeframe (4H × 30 = 5 days,
 * 4H × 50 ≈ 8 days). The B.2 "variability-aware time stop" makes
 * these thresholds adaptive to ATR — for B.1 we keep them static.
 */
export interface TimeStopContext {
    /** Index of the candle when the position opened. */
    entryBarIndex: number;
    /** Index of the latest evaluated candle. */
    currentBarIndex: number;
    /** Realized + unrealized PnL fraction (e.g. 0.012 = +1.2%). */
    pnlFraction: number;
}
export interface TimeStopResult {
    triggered: boolean;
    ratio: 1.0 | 0;
    reason: string;
    /** Threshold tier for telemetry. */
    tier?: "D1_30" | "D2_50";
}
export declare function checkTimeStop(ctx: TimeStopContext): TimeStopResult;
