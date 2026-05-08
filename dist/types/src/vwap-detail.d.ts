/**
 * VWAP Detail bundler — VWAP_STRATEGY.md §6~§9 통합 출력.
 *
 * 신규 VWAP 모듈 (Volume Profile, std-dev bands, Pullback v2, multi-TF, 5-component
 * signal) 의 결과를 한 라우트에서 일괄 반환. 헌장 규칙 3 준수: 단독 시그널 X,
 * BBDX 보조 multiplier 로만 사용 (vwapToMultiplier 출력 포함).
 *
 * 외부 호출 (fetchKlines, checkVwapMultiTfAlignment) 은 try/catch 후 graceful
 * fallback. throw 절대 X — 라우트 측 catch 가 다시 한 번 보호.
 */
import type { Candle, MultiTfAlignment, PullbackQuality, VwapBands, VwapSignal } from "./shared/types";
import { type VolumeProfile } from "./volume-profile";
export interface VwapDetail {
    symbol: string;
    tf: "1h" | "4h" | "1d";
    /** 마지막 100 개 캔들 (혹은 fetch 가능했던 만큼) */
    candles: Candle[];
    vwap: number;
    ema9: number;
    bands: VwapBands;
    volumeProfile: VolumeProfile;
    /** Pullback v2 — VWAP_STRATEGY.md §8 의 "터치 + 반등" 검증 */
    pullbackV2: PullbackQuality;
    /** legacy 4-component VwapSignal (호환 유지) */
    signal: VwapSignal | null;
    /** 5-component VwapSignal (Pullback v2 + Volume Profile 보조 점수) */
    signalV2: VwapSignal | null;
    /** vwapToMultiplier(signalV2 ?? signal) — 헌장 규칙 3 multiplier */
    vwapMult: number;
    multiTfAlignment: MultiTfAlignment;
    /** unix ms */
    computedAt: number;
}
/**
 * 단일 심볼 + TF 의 VWAP 신규 모듈 결과를 한 번에 묶어 반환.
 *
 * fetchKlines 실패 / 빈 캔들 → 모든 필드 zero/empty 로 graceful 응답.
 */
export declare function getVwapDetail(symbol: string, tf?: "1h" | "4h" | "1d"): Promise<VwapDetail>;
