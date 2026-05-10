/**
 * v6.3 EXIT orchestrator.
 *
 * Two entry points:
 *   1. `decideExitForScanner(price, ind, bearishPatterns)` — used by
 *      the per-symbol scanner. No position state, so only EXIT-A
 *      (BB-middle profit target) and EXIT-B (reversal score) can run.
 *   2. `decideExitForPosition(ctx)` — used when an open position is
 *      being managed; runs all 4 categories with priority STOP > B > A > C > D.
 *
 * Priority comes from Part II.1 §2: STOP first (capital protection),
 * then reversal (don't fight a confirmed turn), then profit-taking,
 * then defensive stop moves, then time stop last.
 */
import type { CandlePatternMatch, ExitDecision, TechnicalIndicators } from "@shared/types";
import { type PositionState } from "./protection";
export interface ScannerExitContext {
    price: number;
    indicators: TechnicalIndicators;
    bearishPatterns: CandlePatternMatch[];
    /** Optional Fib levels for tier-2/3 profit targets. */
    fib100?: number;
    fib161_8?: number;
    /** v6.3: per-TF/coin adaptive thresholds (B.2 wiring). Falls back to spec defaults. */
    reversalThresholds?: {
        full: number;
        partial: number;
    };
    /**
     * P2 (2026-05-10) — EXIT-B B4 trendline wiring (audit `01-BBDX-AUDIT.md` E2).
     * 호출 측이 candles + trendline 감지 결과 제공.
     *   "broken"          → +0.30 reversal score
     *   "confirmed_break" → +0.15
     *   "intact" / undef  → 0
     */
    trendlineState?: "intact" | "confirmed_break" | "broken";
    /**
     * P2 (2026-05-10) — EXIT-B B5 MACD bearish divergence wiring.
     *   true → +0.20 reversal score
     */
    macdBearishDivergence?: boolean;
}
/**
 * Per-symbol EXIT evaluation for the scanner. Combines reversal
 * (EXIT-B) and profit target (EXIT-A) — the two categories that
 * don't need open-position state. Returns null when neither fires.
 *
 * Priority STOP > B > A applies even at scanner-time, but STOP
 * needs an entry price so it's omitted here. Reversal beats profit
 * target so we don't keep partial-exiting through a reversal.
 */
export declare function decideExitForScanner(ctx: ScannerExitContext): ExitDecision | null;
export interface PositionExitContext extends ScannerExitContext {
    position: PositionState;
    /** Bar index of the latest candle. */
    currentBarIndex: number;
    /** Bar index when the position opened. */
    entryBarIndex: number;
    /** Optional ATR for protection layer C3 and B.2 adaptive thresholds. */
    atr?: number;
    /** Has tier-1 (BB middle) partial exit already happened for this position? */
    tier1AlreadyTaken?: boolean;
    /** True when a hard stop-loss has hit. STOP category beats everything. */
    stopLossHit?: boolean;
}
export interface PositionExitOutcome {
    decision: ExitDecision | null;
    /** When category = C (move_stop), the new stop price to set. */
    newStop?: number;
}
export declare function decideExitForPosition(ctx: PositionExitContext): PositionExitOutcome;
export { checkProfitTarget } from "./profit-target";
export { computeReversalScore, decideReversal } from "./reversal";
export { checkProtection } from "./protection";
export { checkTimeStop } from "./time-stop";
export type { ProfitTargetResult } from "./profit-target";
export type { ReversalDecision } from "./reversal";
export type { ProtectionResult, PositionState } from "./protection";
export type { TimeStopResult } from "./time-stop";
export type { ExitCategory, ExitAction } from "@shared/types";
