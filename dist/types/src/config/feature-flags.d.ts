/**
 * Feature Flags (BBDX_v66_PERP §4.2).
 *
 * 환경변수 기반 toggle — production 영향 X (default: v6.5 spot).
 *   BBDX_VERSION         = 'v6.5' | 'v6.6'        (default 'v6.5')
 *   BBDX_MARKET          = 'spot' | 'perp'         (default 'spot')
 *   ENABLE_SHORT_SIGNALS = 'true' | 'false'        (default false)
 *   ENABLE_JEON_IN_GU    = 'true' | 'false'        (default false — D-002)
 *
 * 모든 새 코드는 본 flag 를 통해 분기. 기존 v6.5 모듈 (src/indicators.ts,
 * src/signals/confidence.ts, src/backtest/strategies/bbdx*.ts) 절대 수정 X.
 */
export declare const FEATURE_FLAGS: {
    readonly BBDX_VERSION: "v6.5" | "v6.6";
    readonly BBDX_MARKET: "spot" | "perp";
    readonly ENABLE_SHORT_SIGNALS: boolean;
    /**
     * JEON_IN_GU Signal Tracker (가중치 ±0.50 의 6차원 macro modifier).
     * Phase 1.2 단계: stub-only. true 로 둬도 외부 키 + 변호사 검토 통과 전까지
     * stub modifier 가 0 반환 — 안전 default false. 자세히는 D-002.
     */
    readonly ENABLE_JEON_IN_GU: boolean;
};
export declare function isV66Enabled(): boolean;
export declare function isShortEnabled(): boolean;
