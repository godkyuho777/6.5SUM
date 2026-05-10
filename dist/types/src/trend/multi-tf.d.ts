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
export type EmaArrayState = "GOLDEN" | "DEATH" | "BULLISH_ALIGNED" | "BEARISH_ALIGNED" | "MIXED";
export type AdxStrength = "STRONG" | "WEAK" | "BORDERLINE";
export type StructureState = "HH_HL_x2" | "HH_HL_x1" | "MIXED" | "LH_LL_x1" | "LH_LL_x2";
export type VolumeConfirmation = "INCREASING" | "FLAT" | "DECREASING";
export interface DeepTimeframeTrend {
    tf: string;
    side: "BULLISH" | "BEARISH" | "SIDEWAYS";
    /** 4-tier confirmation: trendline + EMA + ADX + structure (+ volume aux). */
    confirmations: {
        trendline: boolean;
        emaArray: EmaArrayState;
        adxStrength: AdxStrength;
        hhHlStructure: StructureState;
        volumeConfirm: VolumeConfirmation;
    };
    /** 0~100, side 부합 confirmations 갯수 × 25. */
    confidenceScore: number;
    emas: {
        ema9: number;
        ema21: number;
        ema50: number;
    };
    adx: number;
    diPlus: number;
    diMinus: number;
}
/**
 * Deep multi-TF trend 분석. v2.0 명세서 §4.5~§4.10 의 단순화 구현 —
 * weighted-LSQ regression / dynamic ATR threshold 는 후속 iteration.
 *
 * 입력 캔들 부족 시 (50 미만) SIDEWAYS + 0 confidence + neutral confirmations.
 */
export declare function analyzeTimeframeTrendDeep(candles: Candle[], tf: string): DeepTimeframeTrend;
