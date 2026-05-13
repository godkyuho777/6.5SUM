/**
 * JEON_IN_GU Signal Tracker — 공유 타입.
 *
 * 명세: JEON_IN_GU_SIGNAL_TRACKER.md (Phase 1.1 / Phase 2 / Phase 3).
 * Phase 1.2 단계 (현재) 에서는 DB 스키마 미러 + Modifier 인터페이스만.
 * Phase 1.3 ~ 7 은 외부 의존성 대기 — D-002 (SCHEDULE_DEFERRED.md).
 *
 * 헌장 R3 (modifier-only): 본 트래커는 BBDX v6.6 의 weighted sum 의 6차원 macro
 * layer 항으로만 작동한다. 단독 시그널 발행 X — modifierValue 만 노출.
 */

// ─── Raw content row (DB 미러) ──────────────────────────────────────

/**
 * `jeon_in_gu_contents` 테이블의 application-side mirror. drizzle row 타입
 * (`JeonInGuContentRow`) 과 모양은 같지만, 모듈 경계가 schema 에 종속되지
 * 않도록 명세서 §2 의 컬럼을 직접 반영한다.
 */
export interface JeonInGuContent {
  id: number;
  contentId: string;
  source: "youtube" | "community";
  channelName?: string | null;
  title: string;
  description?: string | null;
  transcript?: string | null;
  publishedAt: number;

  // 감정 분류 결과 (Phase 2 에서 채워짐)
  sentimentScore?: number | null;
  marketDirection?: MarketDirection | null;
  sentimentConfidence?: number | null;
  detectedAssets?: string[] | null;
  detectedKeywords?: string[] | null;
  reasoning?: string | null;

  processed: boolean;
  processedAt?: number | null;
  bbdxSignalsAffected?: unknown;
}

// ─── 감정 분류 (Phase 2) ────────────────────────────────────────────

export type MarketDirection = "bullish" | "bearish" | "neutral" | "unclear";

/**
 * LLM (Claude Haiku 4.5) 의 분류 응답 — Phase 2 가 채움.
 *
 * sentimentScore: -1.0 (강한 약세) ~ +1.0 (강한 강세).
 * confidence: 0~1. < 0.7 이면 modifier 산출에서 제외 (안전 장치).
 */
export interface SentimentResult {
  sentimentScore: number;
  marketDirection: MarketDirection;
  confidence: number;
  detectedAssets: string[];
  detectedKeywords: string[];
  reasoning: string;
}

// ─── Modifier 출력 (Phase 3) ────────────────────────────────────────

/**
 * BBDX v6.6 weighted sum 의 6차원 macro layer 항.
 *
 *   modifierValue: clamp [-0.50, +0.50]  ← 가중치 ±0.50.
 *   decay        : [0, 1] — 36h 시간 감쇠 비율 (1=방금, 0=만료).
 *   contrarianDirection : "long" | "short" | "neutral".
 *     - bullish 의견 (sentiment>0) + side="short" → 역지표 효과 → modifierValue > 0.
 *     - bearish 의견 (sentiment<0) + side="long"  → 역지표 효과 → modifierValue > 0.
 *     - 매칭 X 또는 neutral → modifierValue 약함 또는 0.
 *
 * stub 단계 (Phase 1.2) 에서는 항상 0/neutral 반환. Phase 3 에서 실제 계산.
 */
export interface JeonInGuModifierResult {
  modifierValue: number;
  source: "jeon_in_gu";
  decay: number;
  contrarianDirection: "long" | "short" | "neutral";
  sourceCount: number;
  reason: string;
}
