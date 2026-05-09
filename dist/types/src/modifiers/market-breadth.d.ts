/**
 * Market Breadth Modifier — 명세서 §7.
 *
 * 96개 코인 universe 일괄 RSI / EMA(200) 위치 / 24h 변화율 계산 후
 * 5단계 sentiment 분류:
 *
 *   rsiBelow30Pct > 0.6  → panic     → 1.30 (역행 베팅, LONG 가산)
 *   rsiBelow30Pct > 0.3  → fear      → 1.10
 *   rsiAbove70Pct > 0.5  → euphoria  → 0.60 (천장 근접, LONG 약화)
 *   rsiAbove70Pct > 0.3  → greed     → 0.90
 *   else                 → neutral   → 1.00
 *
 * 역행 베팅(contrarian) 철학 — 사용자 호불호 갈릴 수 있어 옵션 토글 권장.
 *
 * 차원 6 (macro — 시장 전체 sentiment). Wave Tracker 와 같은 차원이지만
 * 측정 각도 다름 (펀딩/OI 기반 vs RSI 분포 기반).
 *
 * 캐시 5분 (TF 별).
 */
import type { ModifierResult } from "./types";
export type MarketBreadthSentiment = "panic" | "fear" | "neutral" | "greed" | "euphoria";
export interface MarketBreadthResult extends ModifierResult {
    sentiment: MarketBreadthSentiment;
    breakdown: {
        totalCoins: number;
        rsiBelow30Pct: number;
        rsiAbove70Pct: number;
        aboveEMA200Pct: number;
    };
}
/**
 * Market Breadth modifier.
 *
 * @param symbols universe (보통 TOP_COINS). 호출자가 슬라이스 가능.
 * @param tf 타임프레임 (1h | 4h | 1d).
 *
 * 모든 심볼 fetch 실패 시 status="stub", multiplier=1.0 반환.
 * 외부 호출 throw X — 호출 체인 안전.
 */
export declare function computeMarketBreadth(symbols: string[], tf?: "1h" | "4h" | "1d"): Promise<MarketBreadthResult>;
/** 테스트 용. */
export declare function __clearBreadthCache(): void;
