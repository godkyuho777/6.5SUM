/**
 * Wave Tracker — Sentiment & Matrix 타입 정의
 *
 * 명세서 WAVE_SENTIMENT_MATRIX.md 의 출력 데이터 구조 (§2.2) 그대로.
 * 4개 외부 API (Fear & Greed / CoinGecko Global / Bybit OI/Funding / Bybit L/S) 결과를
 * 종합한 시장 분위기 + 4-신호 confluence.
 */
export type FearGreedClass = "EXTREME_FEAR" | "FEAR" | "NEUTRAL" | "GREED" | "EXTREME_GREED";
export type Signal = "bullish" | "bearish" | "neutral";
export type MarketPhase = "ACCUMULATION" | "HEATING" | "DISTRIBUTION" | "PANIC";
export type MarketPhaseKo = "축적" | "가열" | "분산" | "공포";
/** alternative.me Fear & Greed 단일 데이터 포인트. */
export interface FearGreedPoint {
    value: number;
    classification: FearGreedClass;
    timestamp: number;
}
/** CoinGecko global market 데이터. */
export interface GlobalMarketData {
    totalMarketCapUsd: number;
    marketCapChange24h: number;
    btcDominance: number;
    ethDominance: number;
}
/** Composite Score 응답 (§2.2 SentimentSnapshot). */
export interface SentimentSnapshot {
    fearGreed: FearGreedPoint;
    fearGreedHistory: FearGreedPoint[];
    globalMarket: GlobalMarketData;
    compositeScore: number;
    compositeLabel: FearGreedClass;
    marketPhase: MarketPhase;
    marketPhaseKo: MarketPhaseKo;
    reasons: string[];
    computedAt: string;
}
/** 4-신호 종합 (§2.2 WaveMatrixState). */
export interface WaveMatrixState {
    oiSignal: Signal;
    sentimentSignal: Signal;
    fundingSignal: Signal;
    lsSignal: Signal;
    overallBias: Signal;
    confidence: number;
    prediction: string;
    predictionKo: string;
    oiChangeRate: number;
    fearGreedValue: number;
    fundingRateAvg: number;
    longRatio: number;
    shortRatio: number;
    priceChange24h: number;
    oiInterpretation: string;
    oiInterpretationSignal: Signal;
    computedAt: string;
}
/** Bybit OI/Funding/Price 묶음 (내부용). */
export interface BybitDerivativesData {
    symbol: string;
    oiChangeRate: number;
    fundingRateAvg: number;
    priceChange24h: number;
    lastPrice: number;
}
/** Bybit Long/Short Ratio. */
export interface BybitLongShortData {
    symbol: string;
    longRatio: number;
    shortRatio: number;
    ratio: number;
}
