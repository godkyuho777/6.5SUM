/**
 * Wave Matrix — 4-신호 confluence (v4.2 — Audit 반영)
 *
 * WAVE_SENTIMENT_AUDIT.md §3 (Phase A) + §4 (Phase B macro stance) 변경:
 *
 *   1. OI Signal       — 복합 해석 (OI 변화 + 가격 변화 + F&G) 9가지 매트릭스 + ±3% threshold
 *   2. Sentiment Signal — composite > 60 / < 40 / 그 외
 *   3. Funding Signal  — 임계값 ±0.005% → ±0.01%
 *   4. L/S Signal      — 임계값 1.1/0.9 → 2.0/1.0 (retail bias 보정)
 *
 * 종합 편향 (투표):
 *   bullishCount >= 3                  → bullish
 *   bearishCount >= 3                  → bearish
 *   bullishCount > bearishCount        → bullish
 *   bearishCount > bullishCount        → bearish
 *   else                               → neutral (tie)
 *
 * Confidence (v4.2 symmetric):
 *   signalStrength = |compositeScore - 50| / 50  (0~1)
 *   confidence = (|bullCount - bearCount| / 4) × 100 × signalStrength
 *   tie (bull == bear) 면 0
 *
 *   기존 공식의 비대칭성 제거 — bear 일치도 bull 일치와 동일 신뢰도.
 */
import type { BybitDerivativesData, BybitLongShortData, OiDivergence, WaveMatrixState, MarketPhase } from "./types";
/**
 * OI 24h vs 7d 괴리 분류. 단기와 장기 방향이 갈리면 추세 전환 신호.
 *
 * @param oi24h  24h OI 변화율 (%)
 * @param oi7d   7d OI 변화율 (% 또는 undefined — 데이터 없으면 CHOPPY 처리)
 */
export declare function deriveOiDivergence(oi24h: number, oi7d?: number): {
    divergence: OiDivergence;
    ko: string;
};
export declare function computeWaveMatrix(derivatives: BybitDerivativesData, ls: BybitLongShortData, compositeScore: number, fearGreedValue: number, marketPhase?: MarketPhase): WaveMatrixState;
