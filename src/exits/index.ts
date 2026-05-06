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

import type {
  CandlePatternMatch,
  ExitDecision,
  TechnicalIndicators,
} from "@shared/types";

import { checkProfitTarget } from "./profit-target";
import { decideReversal, type ReversalContext } from "./reversal";
import { checkProtection, type PositionState } from "./protection";
import { checkTimeStop } from "./time-stop";

// ──────────────────────────────────────────────────────────────────
// Legacy v6.1 trigger reconstruction.
//
// The FE still consumes the `triggers`/`conditionsMet`/`relaxedToBearish`
// fields from older signal cards. We populate them deterministically
// from the same inputs so existing UI keeps rendering. New code
// reads `category` / `action` / `ratio` instead.
// ──────────────────────────────────────────────────────────────────

interface LegacyShape {
  triggers: ExitDecision["triggers"];
  conditionsMet: number;
  relaxedToBearish: boolean;
}

function legacyV61Triggers(
  price: number,
  ind: TechnicalIndicators,
  bearishPresent: boolean
): LegacyShape {
  const triggers: ExitDecision["triggers"] = [];
  if (price >= ind.bbMiddle) triggers.push("bbMiddle");
  if (ind.rsi >= 65) triggers.push("rsi65");
  if (ind.adx >= 30) triggers.push("adx30");
  if (ind.plusDi >= 25) triggers.push("plusDi25");
  return {
    triggers,
    conditionsMet: triggers.length,
    relaxedToBearish: bearishPresent && triggers.length < 3,
  };
}

// ──────────────────────────────────────────────────────────────────
// Scanner-side entry point (no position state).
// ──────────────────────────────────────────────────────────────────

export interface ScannerExitContext {
  price: number;
  indicators: TechnicalIndicators;
  bearishPatterns: CandlePatternMatch[];
  /** Optional Fib levels for tier-2/3 profit targets. */
  fib100?: number;
  fib161_8?: number;
  /** v6.3: per-TF/coin adaptive thresholds (B.2 wiring). Falls back to spec defaults. */
  reversalThresholds?: { full: number; partial: number };
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
export function decideExitForScanner(
  ctx: ScannerExitContext
): ExitDecision | null {
  const reversalCtx: ReversalContext = {
    indicators: ctx.indicators,
    bearishPatterns: ctx.bearishPatterns,
  };
  const reversal = decideReversal(reversalCtx, ctx.reversalThresholds);

  if (reversal.action === "full_exit" || reversal.action === "partial_exit") {
    const legacy = legacyV61Triggers(
      ctx.price,
      ctx.indicators,
      ctx.bearishPatterns.length > 0
    );
    return {
      category: "B",
      action: reversal.action,
      ratio: reversal.ratio,
      reasons: reversal.reasons,
      reversalScore: reversal.score,
      reversalBreakdown: reversal.breakdown,
      ...legacy,
    };
  }

  // No reversal → check profit target tier 1.
  const profit = checkProfitTarget({
    price: ctx.price,
    indicators: ctx.indicators,
    fib100: ctx.fib100,
    fib161_8: ctx.fib161_8,
  });

  if (profit.triggered) {
    const legacy = legacyV61Triggers(
      ctx.price,
      ctx.indicators,
      ctx.bearishPatterns.length > 0
    );
    return {
      category: "A",
      action: profit.ratio === 1.0 ? "full_exit" : "partial_exit",
      ratio: profit.ratio,
      reasons: [profit.reason],
      ...legacy,
    };
  }

  return null;
}

// ──────────────────────────────────────────────────────────────────
// Position-aware entry point (used in B.2+ once position state is
// threaded through routers/positions update logic).
// ──────────────────────────────────────────────────────────────────

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

export function decideExitForPosition(
  ctx: PositionExitContext
): PositionExitOutcome {
  // STOP first.
  if (ctx.stopLossHit) {
    const legacy = legacyV61Triggers(
      ctx.price,
      ctx.indicators,
      ctx.bearishPatterns.length > 0
    );
    return {
      decision: {
        category: "STOP",
        action: "full_exit",
        ratio: 1.0,
        reasons: [
          `Stop loss hit at ${ctx.price.toFixed(2)} (stop ${ctx.position.currentStop.toFixed(2)}).`,
        ],
        ...legacy,
      },
    };
  }

  // EXIT-B reversal.
  const reversal = decideReversal(
    {
      indicators: ctx.indicators,
      bearishPatterns: ctx.bearishPatterns,
    },
    ctx.reversalThresholds
  );
  if (reversal.action) {
    const legacy = legacyV61Triggers(
      ctx.price,
      ctx.indicators,
      ctx.bearishPatterns.length > 0
    );
    return {
      decision: {
        category: "B",
        action: reversal.action,
        ratio: reversal.ratio,
        reasons: reversal.reasons,
        reversalScore: reversal.score,
        reversalBreakdown: reversal.breakdown,
        ...legacy,
      },
    };
  }

  // EXIT-A profit target.
  const profit = checkProfitTarget({
    price: ctx.price,
    indicators: ctx.indicators,
    fib100: ctx.fib100,
    fib161_8: ctx.fib161_8,
    tier1Already: ctx.tier1AlreadyTaken,
  });
  if (profit.triggered) {
    const legacy = legacyV61Triggers(
      ctx.price,
      ctx.indicators,
      ctx.bearishPatterns.length > 0
    );
    return {
      decision: {
        category: "A",
        action: profit.ratio === 1.0 ? "full_exit" : "partial_exit",
        ratio: profit.ratio,
        reasons: [profit.reason],
        ...legacy,
      },
    };
  }

  // EXIT-C protection (move stop, no exit).
  const protection = checkProtection({
    position: ctx.position,
    price: ctx.price,
    atr: ctx.atr,
  });
  if (protection.triggered && protection.newStop != null) {
    const legacy = legacyV61Triggers(
      ctx.price,
      ctx.indicators,
      ctx.bearishPatterns.length > 0
    );
    return {
      decision: {
        category: "C",
        action: "move_stop",
        ratio: 0,
        reasons: [protection.reason],
        ...legacy,
      },
      newStop: protection.newStop,
    };
  }

  // EXIT-D time stop.
  const pnl = (ctx.price - ctx.position.entryPrice) / ctx.position.entryPrice;
  const time = checkTimeStop({
    entryBarIndex: ctx.entryBarIndex,
    currentBarIndex: ctx.currentBarIndex,
    pnlFraction: pnl,
  });
  if (time.triggered) {
    const legacy = legacyV61Triggers(
      ctx.price,
      ctx.indicators,
      ctx.bearishPatterns.length > 0
    );
    return {
      decision: {
        category: "D",
        action: "full_exit",
        ratio: time.ratio,
        reasons: [time.reason],
        ...legacy,
      },
    };
  }

  return { decision: null };
}

// Re-export sub-modules for tests / external callers.
export { checkProfitTarget } from "./profit-target";
export { computeReversalScore, decideReversal } from "./reversal";
export { checkProtection } from "./protection";
export { checkTimeStop } from "./time-stop";

export type { ProfitTargetResult } from "./profit-target";
export type { ReversalDecision } from "./reversal";
export type { ProtectionResult, PositionState } from "./protection";
export type { TimeStopResult } from "./time-stop";
export type { ExitCategory, ExitAction } from "@shared/types";
