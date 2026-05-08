/**
 * Composite Sentiment Score
 *
 * 명세서 §3 그대로:
 *   시작점 50 (중립)
 *   + Fear & Greed Index    (가중치 40%) — (F&G - 50) × 0.4
 *   + 글로벌 시장 데이터    (가중치 20%) — 시총변화율 × 1.5
 *   + OI 변화율             (가중치 15%) — OI변화율 × 1.0
 *   + Long/Short + Funding  (가중치 25%) — ±5 + ±3
 *   = Composite Score (clamp 0~100)
 *
 * 시장 단계 (§6):
 *   sentiment<40 + OI>+1%  → ACCUMULATION
 *   sentiment>60 + OI>+1%  → HEATING
 *   sentiment>60 + OI<-1%  → DISTRIBUTION
 *   sentiment<40 + OI<-1%  → PANIC
 *   그 외                   → HEATING (기본)
 */
import type { BybitDerivativesData, BybitLongShortData, FearGreedPoint, GlobalMarketData, SentimentSnapshot } from "./types";
export declare function computeComposite(fng: FearGreedPoint[], global: GlobalMarketData, derivatives: BybitDerivativesData, ls: BybitLongShortData): SentimentSnapshot;
