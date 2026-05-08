/**
 * Multi-timeframe trend direction — server-side port.
 *
 * Computes a single direction (BULLISH / BEARISH / SIDEWAYS) per
 * timeframe by reusing the existing `calculateADX` and `calculateEMA`
 * helpers from `indicators.ts`. This is the minimal port needed to
 * feed `wave-alignment.ts`; the v2.0 spec's full ATR-dynamic +
 * weighted-regression engine (Part III.3) is bigger work and lives
 * in a future iteration. See plan B.3 / cross-cutting items.
 *
 * Pure: takes candle arrays per TF, returns labels. No I/O.
 */
import type { Candle } from "@shared/types";
export type TrendDirection = "BULLISH" | "BEARISH" | "SIDEWAYS";
export interface TimeframeTrend {
    /** Identifier supplied by caller, e.g. "15m" / "1h" / "4h" / "1d". */
    tf: string;
    direction: TrendDirection;
    /** ADX value of the timeframe, used downstream for telemetry. */
    adx: number;
    plusDi: number;
    minusDi: number;
    /** EMA alignment label: bullish when 9>21>50, bearish when 9<21<50, mixed otherwise. */
    emaAlignment: "bullish" | "bearish" | "mixed";
}
/**
 * Classify a single timeframe's trend from candles.
 *
 * - ADX < 20 → SIDEWAYS regardless of EMA (low-strength regime).
 * - +DI > -DI AND EMA bullish-aligned → BULLISH.
 * - -DI > +DI AND EMA bearish-aligned → BEARISH.
 * - Anything else → SIDEWAYS.
 *
 * Returns `direction = SIDEWAYS` and zero ADX when given too-few
 * candles. Caller can decide how to handle that.
 */
export declare function classifyTimeframeTrend(candles: Candle[], tf: string): TimeframeTrend;
/**
 * Run `classifyTimeframeTrend` over all provided timeframes. Caller
 * passes the candle array per TF in any order; result preserves order.
 */
export declare function classifyMultiTF(perTf: {
    tf: string;
    candles: Candle[];
}[]): TimeframeTrend[];
