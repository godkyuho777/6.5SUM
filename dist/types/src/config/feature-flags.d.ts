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
export declare const FEATURE_FLAGS: {
    readonly BBDX_VERSION: "v6.5" | "v6.6";
    readonly BBDX_MARKET: "spot" | "perp";
    readonly ENABLE_SHORT_SIGNALS: boolean;
};
export declare function isV66Enabled(): boolean;
export declare function isShortEnabled(): boolean;
