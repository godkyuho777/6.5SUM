/**
 * Lite Mode Types — 일반인 친화 라벨 시스템
 *
 * 헌장 규칙 3 준수: Lite 라벨은 BBDX 시그널 결과를 *번역*만 한다. 단독 시그널 X.
 * 모든 추천은 entryDecision (BBDX path 결과) + onchain multiplier 결과를 받아
 * 라벨로 압축한 형태.
 */
import type { OnchainRegime } from "../onchain/types";
/** 추천 액션 — Lite UI 의 핵심 라벨. */
export type Recommendation = "STRONG_BUY" | "BUY" | "WATCH" | "HOLD" | "SELL" | "STRONG_SELL" | "BLOCKED";
/** 위험도 — 5단계 게이지. */
export type RiskLevel = "very_low" | "low" | "medium" | "high" | "very_high";
/** 시장 분위기 — 4-TF 종합 또는 종합 strength 기반 한 단어. */
export type MoodLabel = "bullish_strong" | "bullish" | "neutral" | "bearish" | "bearish_strong";
/** 라벨에 함께 흐르는 색조 — UI 가 cyberpunk 색 토큰으로 매핑. */
export type Tone = "good" | "caution" | "bad" | "neutral" | "muted";
/** 단일 translate 함수의 표준 반환 형태 (UI tooltip / 학습 카드 공용). */
export interface TranslatedLabel {
    /** 한국어 라벨 (UI 에 직접 표시). */
    label: string;
    /** Lite UI 색상 토큰 ("neon-green" / "neon-cyan" / "neon-yellow" / "neon-red" / "muted"). */
    color: string;
    /** 의미적 톤. */
    tone: Tone;
    /** 한 문장 설명 (학습 카드 / tooltip 용). */
    oneLiner: string;
}
/** 코인 카드 — Lite Dashboard / Lite CoinDetail 공용. */
export interface LiteCoinCard {
    symbol: string;
    /** 표시용 베이스 (BTCUSDT → BTC). */
    base: string;
    price: number;
    change24h: number;
    recommendation: Recommendation;
    /** 추천 라벨 한국어 ("강한 매수 추천" 등). */
    recommendationLabel: string;
    recommendationTone: Tone;
    riskLevel: RiskLevel;
    riskLabel: string;
    /** 추천 근거 1~2줄 — raw 지표 노출 X, 일상 언어. */
    reasons: string[];
    /** Pro 화면에서도 그대로 쓸 수 있는 강도 점수 (0~100). */
    strength: number;
}
/** 포지션 카드 — Lite Portfolio. */
export interface LitePositionCard {
    positionId: number;
    symbol: string;
    base: string;
    entryPrice: number;
    currentPrice: number | null;
    pnlPercent: number | null;
    pnlAmount: number | null;
    /** 다음 행동 추천 ("계속 보유" / "익절 고려" / "손절 고려" 등). */
    suggestedAction: string;
    suggestedActionTone: Tone;
}
/** Lite Dashboard 응답. */
export interface LiteDashboard {
    topBuy: LiteCoinCard[];
    topSell: LiteCoinCard[];
    marketMood: MoodLabel;
    marketMoodLabel: string;
    marketMoodOneLiner: string;
    computedAt: string;
}
/** translate procedure 의 input. */
export type TranslateKind = "strength" | "path" | "regime" | "phase" | "adx" | "rsi" | "bb_position";
/** 추천 라벨 한국어 매핑 — Lite UI 가 직접 사용. */
export declare const RECOMMENDATION_LABEL: Record<Recommendation, {
    label: string;
    tone: Tone;
}>;
export declare const RISK_LABEL: Record<RiskLevel, string>;
export declare const MOOD_LABEL: Record<MoodLabel, {
    label: string;
    oneLiner: string;
    tone: Tone;
}>;
/** Onchain regime → 사람이 읽는 라벨. */
export declare const REGIME_LABEL: Record<OnchainRegime, {
    label: string;
    oneLiner: string;
    tone: Tone;
}>;
