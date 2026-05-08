/**
 * Wave Matrix — 4-신호 confluence
 *
 * 명세서 §4 그대로:
 *   1. OI Signal       — 복합 해석 (OI 변화 + 가격 변화 + F&G) 9가지 매트릭스
 *   2. Sentiment Signal — composite > 60 / < 40 / 그 외
 *   3. Funding Signal  — 펀딩 양수/음수
 *   4. L/S Signal      — 롱 우세 / 숏 우세
 *
 * 종합 편향 (투표):
 *   bullishCount >= 3            → bullish
 *   bearishCount >= 3            → bearish
 *   bullishCount > bearishCount  → bullish
 *   bearishCount > bullishCount  → bearish
 *   else                         → neutral
 *
 * 신뢰도:
 *   confidence = (max(bullishCount, bearishCount) / 4) × 100 × (compositeScore/100 + 0.5)
 *   clamp 0~100
 */
import type { BybitDerivativesData, BybitLongShortData, WaveMatrixState } from "./types";
export declare function computeWaveMatrix(derivatives: BybitDerivativesData, ls: BybitLongShortData, compositeScore: number, fearGreedValue: number): WaveMatrixState;
