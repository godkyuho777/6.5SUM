/**
 * Composite Sentiment Score (v4.2 — Audit 반영)
 *
 * WAVE_SENTIMENT_AUDIT.md §3 (Phase A) 변경:
 *   시작점 50 (중립)
 *   + Fear & Greed Index    (25%, 기존 40%) — (F&G - 50) × 0.25
 *   + 글로벌 시총           (15%, 기존 20%) — 시총변화율 × 1.0
 *   + BTC 도미넌스 보정     (5%)  — 알트시즌 / 알트약세 ±2
 *   + OI 변화율             (25%, 기존 15%) — gradient: ±3% strong / ±1.5% weak
 *   + Funding rate          (15%, 기존 25% 중) — 임계값 ±0.005% → ±0.01%
 *   + Long/Short            (15%, 기존 25% 중) — 임계값 1.1/0.9 → 2.0/1.0 (retail bias 보정)
 *   = Composite Score (clamp 0~100)
 *
 * 임계값 calibration (Bybit 실제 분포 반영):
 *   OI 24h: 평소 ±1.5% → strong 시그널은 ±3%
 *   Funding: Bybit 표준 ±0.01% (8h) → 0.005% 는 노이즈
 *   L/S Ratio: retail account 평균 1.5~2.0 (long-bias) → 1.1 임계값은 정보 무
 *
 * 시장 단계 (Phase OI threshold 도 ±2.5% 로 강화):
 *   sentiment<40 + OI>+2.5%  → ACCUMULATION
 *   sentiment>60 + OI>+2.5%  → HEATING
 *   sentiment>60 + OI<-2.5%  → DISTRIBUTION
 *   sentiment<40 + OI<-2.5%  → PANIC
 *   그 외                     → TRANSITIONAL (기본은 HEATING 으로 fallback)
 */
import type { BybitDerivativesData, BybitLongShortData, FearGreedPoint, GlobalMarketData, SentimentSnapshot } from "./types";
export declare function computeComposite(fng: FearGreedPoint[], global: GlobalMarketData, derivatives: BybitDerivativesData, ls: BybitLongShortData): SentimentSnapshot;
