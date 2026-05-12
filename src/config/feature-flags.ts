/**
 * Feature Flags (BBDX_v66_PERP §4.2).
 *
 * 환경변수 기반 toggle — production 영향 X (default: v6.5 spot).
 *   BBDX_VERSION       = 'v6.5' | 'v6.6'          (default 'v6.5')
 *   BBDX_MARKET        = 'spot' | 'perp'           (default 'spot')
 *   ENABLE_SHORT_SIGNALS = 'true' | 'false'        (default false)
 *
 * 모든 새 코드는 본 flag 를 통해 분기. 기존 v6.5 모듈 (src/indicators.ts,
 * src/signals/confidence.ts, src/backtest/strategies/bbdx*.ts) 절대 수정 X.
 */

export const FEATURE_FLAGS = {
  BBDX_VERSION: (process.env.BBDX_VERSION ?? "v6.5") as "v6.5" | "v6.6",
  BBDX_MARKET: (process.env.BBDX_MARKET ?? "spot") as "spot" | "perp",
  ENABLE_SHORT_SIGNALS: process.env.ENABLE_SHORT_SIGNALS === "true" || process.env.ENABLE_SHORT_SIGNALS === "1",
} as const;

export function isV66Enabled(): boolean {
  return FEATURE_FLAGS.BBDX_VERSION === "v6.6";
}

export function isShortEnabled(): boolean {
  return FEATURE_FLAGS.ENABLE_SHORT_SIGNALS;
}
