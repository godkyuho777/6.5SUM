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

export function checkProtection(ctx: ProtectionContext): ProtectionResult {
  const { position, price, atr } = ctx;
  const entry = position.entryPrice;
  if (entry <= 0) {
    return { triggered: false, newStop: null, reason: "" };
  }

  const unrealizedPct = (price - entry) / entry;

  let candidate = position.currentStop;
  let layer: "C1" | "C2" | "C3" | undefined;
  let reason = "";

  // C1. Breakeven move at +2%.
  if (unrealizedPct >= 0.02 && !position.stopMovedToBreakeven) {
    if (entry > candidate) {
      candidate = entry;
      layer = "C1";
      reason = `Breakeven stop moved to entry ${entry.toFixed(2)} (+${(unrealizedPct * 100).toFixed(2)}% unrealized)`;
    }
  }

  // C2. Percentage trailing at +5%.
  if (unrealizedPct >= 0.05) {
    const trailing = price * 0.97;
    if (trailing > candidate) {
      candidate = trailing;
      layer = "C2";
      reason = `Trailing stop at ${trailing.toFixed(2)} (3% behind ${price.toFixed(2)})`;
    }
  }

  // C3. ATR-based trailing at +3%.
  if (unrealizedPct >= 0.03 && atr != null && atr > 0) {
    const atrStop = price - 1.5 * atr;
    if (atrStop > candidate) {
      candidate = atrStop;
      layer = "C3";
      reason = `ATR trailing stop at ${atrStop.toFixed(2)} (1.5× ATR ${atr.toFixed(4)})`;
    }
  }

  if (candidate === position.currentStop) {
    return { triggered: false, newStop: null, reason: "" };
  }

  return {
    triggered: true,
    newStop: candidate,
    reason,
    layer,
  };
}
