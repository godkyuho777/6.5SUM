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

/** Cap matches the spec — Korea modifier never exceeds ±0.05. */
const KOREA_MODIFIER_CAP = 0.05;

export function computeKoreaModifier(
  inputs: KoreaMacroInputs = {}
): KoreaMacroResult {
  let modifier = 0;
  const reasons: string[] = [];
  const missingInputs: string[] = [];

  if (inputs.bokRateChange90d == null) {
    missingInputs.push("bok_rate_change_90d");
  } else if (inputs.bokRateChange90d > 0.005) {
    // Tightening cycle — locals less risk-on.
    modifier -= 0.05;
    reasons.push(
      `BOK rate up ${(inputs.bokRateChange90d * 100).toFixed(2)}% in 90d → -0.05`
    );
  }

  if (inputs.krwUsdChange30d == null) {
    missingInputs.push("krw_usd_change_30d");
  } else if (inputs.krwUsdChange30d > 0.03) {
    // KRW weakening — BTC hedge demand.
    modifier += 0.05;
    reasons.push(
      `KRW weakened ${(inputs.krwUsdChange30d * 100).toFixed(2)}% in 30d → +0.05`
    );
  }

  // Cap to ±0.05 (in case both legs fire on a future modifier expansion).
  modifier = Math.max(-KOREA_MODIFIER_CAP, Math.min(KOREA_MODIFIER_CAP, modifier));

  return { modifier, reasons, missingInputs };
}

/** Apply Korea modifier to base macro mult. */
export function applyKoreaModifier(baseMacroMult: number, koreaModifier: number): number {
  return baseMacroMult * (1 + koreaModifier);
}
