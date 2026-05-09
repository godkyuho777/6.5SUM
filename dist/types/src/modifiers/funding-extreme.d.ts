/**
 * Funding Rate Extreme Modifier — 명세서 §8.
 *
 * Bybit V5 `/v5/market/funding/history` 에서 perp funding rate fetch.
 * 8h 기준 임계값:
 *   rate > +0.001  → long_extreme   → multiplier 0.85 (LONG 약화)
 *   rate > +0.0005 → long_elevated  → 0.92
 *   -0.0005 ≤ rate ≤ +0.0005 → neutral → 1.00
 *   rate < -0.0005 → short_elevated → 1.10 (스퀴즈 가능)
 *   rate < -0.001  → short_extreme  → 1.20
 *
 * 차원 6 (macro — perp positioning). Wave Tracker 와 같은 차원이지만
 * 측정 각도 다름 (komposit sentiment vs single-symbol perp positioning).
 *
 * Spot-only 코인 (펀딩비 없음) → status="stub", multiplier=1.0.
 * 외부 호출 실패 → status="error", multiplier=1.0 (graceful, throw X).
 *
 * 캐시 5분 (in-memory).
 */
import type { ModifierResult } from "./types";
export type FundingRegime = "long_extreme" | "long_elevated" | "neutral" | "short_elevated" | "short_extreme";
export interface FundingExtremeResult extends ModifierResult {
    fundingRate: number;
    regime: FundingRegime;
}
/**
 * Funding Extreme modifier — 5 단계 regime 분류 + multiplier.
 *
 * @param symbol Bybit 심볼 (예: "BTCUSDT"). Linear (perp) 만 funding rate 존재.
 */
export declare function computeFundingExtreme(symbol: string): Promise<FundingExtremeResult>;
/** 테스트 용 — 캐시 초기화. */
export declare function __clearFundingCache(): void;
