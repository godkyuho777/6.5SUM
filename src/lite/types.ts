/**
 * Lite Mode Types — 일반인 친화 라벨 시스템
 *
 * 헌장 규칙 3 준수: Lite 라벨은 BBDX 시그널 결과를 *번역*만 한다. 단독 시그널 X.
 * 모든 추천은 entryDecision (BBDX path 결과) + onchain multiplier 결과를 받아
 * 라벨로 압축한 형태.
 */

import type { OnchainRegime } from "../onchain/types";

/** 추천 액션 — Lite UI 의 핵심 라벨. */
export type Recommendation =
  | "STRONG_BUY"
  | "BUY"
  | "WATCH"      // 진입 path 있지만 강도 약함, 관찰만
  | "HOLD"       // 진입/청산 시그널 없음
  | "SELL"
  | "STRONG_SELL"
  | "BLOCKED";   // 자본 보호 차단 (strong_distribution + mean reversion)

/** 위험도 — 5단계 게이지. */
export type RiskLevel =
  | "very_low"
  | "low"
  | "medium"
  | "high"
  | "very_high";

/** 시장 분위기 — 4-TF 종합 또는 종합 strength 기반 한 단어. */
export type MoodLabel =
  | "bullish_strong"
  | "bullish"
  | "neutral"
  | "bearish"
  | "bearish_strong";

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
export type TranslateKind =
  | "strength"
  | "path"
  | "regime"
  | "phase"
  | "adx"
  | "rsi"
  | "bb_position";

/** 추천 라벨 한국어 매핑 — Lite UI 가 직접 사용. */
export const RECOMMENDATION_LABEL: Record<Recommendation, { label: string; tone: Tone }> = {
  STRONG_BUY: { label: "강한 매수 추천", tone: "good" },
  BUY: { label: "매수 추천", tone: "good" },
  WATCH: { label: "관찰", tone: "caution" },
  HOLD: { label: "지금은 추천 없음", tone: "muted" },
  SELL: { label: "매도 고려", tone: "caution" },
  STRONG_SELL: { label: "강한 매도", tone: "bad" },
  BLOCKED: { label: "지금은 추천 없음", tone: "muted" },
};

export const RISK_LABEL: Record<RiskLevel, string> = {
  very_low: "매우 낮음",
  low: "낮음",
  medium: "보통",
  high: "높음",
  very_high: "매우 높음",
};

export const MOOD_LABEL: Record<MoodLabel, { label: string; oneLiner: string; tone: Tone }> = {
  bullish_strong: {
    label: "강한 상승 분위기",
    oneLiner: "여러 코인이 함께 오르는 흐름이에요. 다만 너무 뜨거우면 식기 쉬워요.",
    tone: "good",
  },
  bullish: {
    label: "상승 분위기",
    oneLiner: "전반적으로 매수세가 우세해요.",
    tone: "good",
  },
  neutral: {
    label: "관망세",
    oneLiner: "방향이 뚜렷하지 않아요. 무리한 진입은 자제하세요.",
    tone: "neutral",
  },
  bearish: {
    label: "하락 분위기",
    oneLiner: "전반적으로 매도세가 우세해요. 새 진입은 신중하게.",
    tone: "caution",
  },
  bearish_strong: {
    label: "강한 하락 분위기",
    oneLiner: "큰 자금이 빠지고 있어요. 보호 우선.",
    tone: "bad",
  },
};

/** Onchain regime → 사람이 읽는 라벨. */
export const REGIME_LABEL: Record<OnchainRegime, { label: string; oneLiner: string; tone: Tone }> = {
  strong_accumulation: {
    label: "기관 매집 중",
    oneLiner: "큰 자금이 코인을 모으는 흐름이에요. 강세 신호가 강해져요.",
    tone: "good",
  },
  accumulation: {
    label: "매집",
    oneLiner: "조용히 매수가 들어오고 있어요.",
    tone: "good",
  },
  neutral: {
    label: "중립",
    oneLiner: "특별한 자금 흐름이 보이지 않아요.",
    tone: "neutral",
  },
  distribution: {
    label: "분배",
    oneLiner: "큰 손이 코인을 시장에 풀고 있어요. 약세 신호.",
    tone: "caution",
  },
  strong_distribution: {
    label: "강한 분배",
    oneLiner: "큰 자금이 빠르게 빠지고 있어요. 자본 보호 모드.",
    tone: "bad",
  },
};
