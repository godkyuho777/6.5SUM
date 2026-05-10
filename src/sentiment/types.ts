/**
 * Wave Tracker — Sentiment & Matrix 타입 정의
 *
 * 명세서 WAVE_SENTIMENT_MATRIX.md 의 출력 데이터 구조 (§2.2) 그대로.
 * 4개 외부 API (Fear & Greed / CoinGecko Global / Bybit OI/Funding / Bybit L/S) 결과를
 * 종합한 시장 분위기 + 4-신호 confluence.
 */

export type FearGreedClass =
  | "EXTREME_FEAR"
  | "FEAR"
  | "NEUTRAL"
  | "GREED"
  | "EXTREME_GREED";

export type Signal = "bullish" | "bearish" | "neutral";

export type MarketPhase =
  | "ACCUMULATION"
  | "HEATING"
  | "DISTRIBUTION"
  | "PANIC";

export type MarketPhaseKo =
  | "축적"
  | "가열"
  | "분산"
  | "공포";

/** alternative.me Fear & Greed 단일 데이터 포인트. */
export interface FearGreedPoint {
  value: number;
  classification: FearGreedClass;
  timestamp: number; // unix ms
}

/** CoinGecko global market 데이터. */
export interface GlobalMarketData {
  totalMarketCapUsd: number;
  marketCapChange24h: number; // %
  btcDominance: number; // %
  ethDominance: number; // %
}

/** Composite Score 응답 (§2.2 SentimentSnapshot). */
export interface SentimentSnapshot {
  fearGreed: FearGreedPoint;
  fearGreedHistory: FearGreedPoint[]; // 최근 30일 (또는 그 이하)
  globalMarket: GlobalMarketData;

  compositeScore: number; // 0~100
  compositeLabel: FearGreedClass;
  marketPhase: MarketPhase;
  marketPhaseKo: MarketPhaseKo;
  reasons: string[]; // 5~8개

  computedAt: string;
}

/** 4-신호 종합 (§2.2 WaveMatrixState). */
export interface WaveMatrixState {
  // 4개 신호
  oiSignal: Signal;
  sentimentSignal: Signal;
  fundingSignal: Signal;
  lsSignal: Signal;

  // 종합 판단
  overallBias: Signal;
  confidence: number; // 0~100
  prediction: string; // 영문
  predictionKo: string; // 한글

  // 수치 표기 (v4.1)
  oiChangeRate: number; // %
  fearGreedValue: number;
  fundingRateAvg: number; // % (보통 -0.01% ~ +0.05% 범위)
  longRatio: number; // %
  shortRatio: number; // %
  priceChange24h: number; // %

  // OI 복합 해석 (v4.1)
  oiInterpretation: string; // 한글 해석
  oiInterpretationSignal: Signal;

  // ── v4.2 Audit 개선 ───────────────────────────────────────
  /**
   * 거시 스탠스 (Macro Stance).
   *
   * WAVE_SENTIMENT_AUDIT.md §4 — 사용자가 "거시적 스탠스" 로 사용 중.
   * 5단계: RISK_ON / NEUTRAL_BULL / NEUTRAL / NEUTRAL_BEAR / RISK_OFF / DEFENSIVE.
   * BBDX 시그널의 macro 컨텍스트 라벨로만 사용 (헌장 규칙 3, modifier-only).
   */
  macroStance: import("./macro-stance").MacroStanceResult;

  /** 4-신호 vote 결과 — bullish 갯수 (0-4). UI 차트용. */
  bullishCount: number;
  /** 4-신호 vote 결과 — bearish 갯수 (0-4). UI 차트용. */
  bearishCount: number;
  /** tie 여부 (2:2 또는 3:3 동점). UI 에서 "신호 미정" 표기 용. */
  isTie: boolean;

  // ── v4.3 Phase C — Multi-period ─────────────────────────────
  /** OI 7일 변화율 (%, 가능 시). */
  oiChange7d?: number;
  /** Funding 7일 평균 (%). */
  fundingAvg7d?: number;
  /** Funding 추세. */
  fundingTrend7d?: "rising" | "falling" | "flat";
  /** OI Divergence 분류 (24h vs 7d). */
  oiDivergence?: OiDivergence;
  /** OI Divergence 한글 해석. */
  oiDivergenceKo?: string;

  // ── v4.3 Phase D — Prediction 메타 ──────────────────────────
  /** Prediction 매핑 ID — 12종 중 하나 + tied/mixed. */
  predictionId?: string;
  /** Prediction 권장 액션 (한글). */
  recommendedAction?: string;

  computedAt: string;
}

/** Bybit OI/Funding/Price 묶음 (내부용). */
export interface BybitDerivativesData {
  symbol: string;
  oiChangeRate: number; // % (24h)
  fundingRateAvg: number; // % (최근 3 펀딩 평균, 1일치)
  priceChange24h: number; // %
  lastPrice: number;

  // ── v4.3 Phase C — Multi-period ─────────────────────────────
  /** OI 7일 변화율 (%, 일봉 8일치 기준). */
  oiChange7d?: number;
  /** Funding 7일 평균 (%, 21개 펀딩 기준). */
  fundingAvg7d?: number;
  /** Funding 추세 방향 (slope 부호). */
  fundingTrend7d?: "rising" | "falling" | "flat";
  /** Funding 7일 slope (% per day). */
  fundingSlope7d?: number;
}

// ─── v4.3 Phase D — Source Health ───────────────────────────

export type SourceStatus = "live" | "stale" | "fallback";

export interface SourceHealthEntry {
  status: SourceStatus;
  /** unix ms — 마지막 성공한 fetch 시각 (fallback 면 0). */
  lastUpdated: number;
  /** 데이터 age 초 단위 (UI 표기 용). */
  ageSec: number;
}

export interface SourceHealth {
  fearGreed: SourceHealthEntry;
  globalMarket: SourceHealthEntry;
  bybitDerivatives: SourceHealthEntry;
  bybitLongShort: SourceHealthEntry;
  /** 4개 중 live 인 것의 갯수 (4 = perfect, 0 = all fallback). */
  healthScore: number;
}

// ─── v4.3 Phase C — OI Divergence ────────────────────────────

export type OiDivergence =
  | "BULL_REVERSAL" // 7d ↓ + 24h ↑ — 바닥 반등
  | "BEAR_REVERSAL" // 7d ↑ + 24h ↓ — 고점 분산
  | "BULL_ACCEL"    // 7d ↑ + 24h ↑ — 상승 가속
  | "BEAR_ACCEL"    // 7d ↓ + 24h ↓ — 하락 가속
  | "CHOPPY";       // 그 외

/** Bybit Long/Short Ratio. */
export interface BybitLongShortData {
  symbol: string;
  longRatio: number; // %
  shortRatio: number; // %
  ratio: number; // long / short (1.0 이상이면 롱 우세)
}
