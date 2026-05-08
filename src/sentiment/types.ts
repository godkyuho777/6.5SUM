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

  computedAt: string;
}

/** Bybit OI/Funding/Price 묶음 (내부용). */
export interface BybitDerivativesData {
  symbol: string;
  oiChangeRate: number; // %
  fundingRateAvg: number; // %
  priceChange24h: number; // %
  lastPrice: number;
}

/** Bybit Long/Short Ratio. */
export interface BybitLongShortData {
  symbol: string;
  longRatio: number; // %
  shortRatio: number; // %
  ratio: number; // long / short (1.0 이상이면 롱 우세)
}
