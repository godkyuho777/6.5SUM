/**
 * Korea macro modifier — v6.5 §2.2.
 *
 * Stage 1 ships in Korea, so two Korean macro signals nudge the
 * macro multiplier:
 *   - BOK rate trend (90d change): tightening reduces risk-asset
 *     appetite → -0.05 modifier when rate trend > +0.5%.
 *   - KRW/USD weakening: weak won pushes locals into BTC as a
 *     hedge → +0.05 modifier when KRW depreciates > 3% in 30d.
 *
 * Final macro multiplier is `base_macro_mult × (1 + korea_modifier)`,
 * so this returns a fraction (±0.05 cap). Pure: takes raw inputs,
 * returns the result.
 */
export interface KoreaMacroInputs {
    /** BOK base-rate change over the last 90 days (fraction; 0.005 = +0.5pp). */
    bokRateChange90d?: number;
    /** KRW/USD change over 30 days (fraction; positive = KRW weakening). */
    krwUsdChange30d?: number;
}
export interface KoreaMacroResult {
    modifier: number;
    reasons: string[];
    missingInputs: string[];
}
export declare function computeKoreaModifier(inputs?: KoreaMacroInputs): KoreaMacroResult;
/** Apply Korea modifier to base macro mult. */
export declare function applyKoreaModifier(baseMacroMult: number, koreaModifier: number): number;
