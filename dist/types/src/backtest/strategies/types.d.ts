/**
 * Backtest Strategy 인터페이스 — 전략별 진입 조건과 청산 파라미터를 정의.
 *
 * 4 전략 지원 (Signal Tracker + Wave Tracker):
 *   1. bbdx        — RSI/BB/ADX (v6.5 Phase 1+2+3)
 *   2. fibonacci   — Fibonacci & Trendline 골든 zone 진입
 *   3. vwap        — VWAP + EMA(9) Parker Brooks pullback
 *   4. trend       — Wave Tracker multi-TF Trend Analysis
 *
 * 각 전략은 (1) shouldEnter (진입 조건) (2) getEntryParams (Tier 1/2 + Stop)
 * 둘만 구현하면 됨. 나머지 outcome 측정 / partial exit / 통계는 framework 가
 * 처리.
 *
 * Look-ahead-free 보장:
 *   shouldEnter 와 getEntryParams 는 candles[0..idx] 만 사용해야 함.
 *   (signal-extractor 가 idx+1 부터의 결과 측정을 분리)
 */
import type { Candle, TechnicalIndicators } from "@shared/types";
/** 전략 식별자 */
export type StrategyName = "bbdx" | "bbdx-short" | "fibonacci" | "vwap" | "trend" | "trend-follow";
/** 매매 방향 — outcome 측정 시 가격 방향 기준이 됨. */
export type StrategySide = "long" | "short";
/** 진입 조건 평가 결과 */
export interface EntryEvaluation {
    /** 진입 여부 */
    entry: boolean;
    /** 사람이 읽을 수 있는 충족 조건 (UI 표시용) */
    reasons?: string[];
    /** 전략별 메타 (BacktestTrade 에 surface 됨) */
    metadata?: {
        /** Pattern Confluence (BBDX) — 0~1 */
        patternConfluenceScore?: number;
        /** Higher-TF SMA Bullish (BBDX) */
        higherTfBullish?: boolean;
        /** Fib level 진입 시점 (Fibonacci) — 0.382 / 0.5 / 0.618 등 */
        fibLevel?: number;
        /** VWAP 위치 (VWAP) — "ABOVE" | "BELOW" | "AT" */
        vwapPosition?: string;
        /** Pullback 감지 (VWAP) */
        pullbackDetected?: boolean;
        /** Multi-TF alignment (Trend) — "ALIGNED_BULL" 등 */
        trendAlignment?: string;
        /** Multi-TF confidence (Trend) — 0~100 */
        trendConfidence?: number;
        /** Modifier multipliers (BBDX 와 다른 전략에서도 추적 가능) */
        emaRibbonMult?: number;
        macdDivergenceMult?: number;
        orderBlockMult?: number;
        modifiersProduct?: number;
        [key: string]: unknown;
    };
}
/** 진입 시점의 청산 파라미터 */
export interface EntryParams {
    /** Tier 1 목표가 (50% 부분 청산) */
    target1: number;
    /** Tier 2 목표가 (잔여 50% 청산) */
    target2: number;
    /** 손절가 */
    stopLoss: number;
    /** 신호 강도 (0~100, 보고서/필터링용) */
    signalStrength: number;
}
/**
 * BacktestStrategy — 모든 전략이 구현해야 하는 인터페이스.
 *
 * 헌장 규칙 3 (단독 시그널 X) 검증:
 *   각 전략은 BBDX 단일 차원 또는 multi-차원 modifier 형태여야 하며,
 *   shouldEnter 가 단독으로 진입 신호를 발행하지 않도록 metadata 에
 *   `dimensionsCovered` 필드로 명시.
 */
export interface BacktestStrategy {
    /** 전략 식별자 (CLI / tRPC --strategy 플래그 값) */
    name: StrategyName;
    /** 사람이 읽을 수 있는 라벨 */
    label: string;
    /** 1줄 설명 */
    description: string;
    /** 헌장 7차원 중 어느 차원을 측정하는지 */
    dimensionsCovered: Array<1 | 2 | 3 | 4 | 5 | 6 | 7>;
    /**
     * 매매 방향 (default: "long").
     * "long"  → target > entry, stop < entry, profit when price ↑
     * "short" → target < entry, stop > entry, profit when price ↓
     *
     * 미지정 시 "long" 으로 간주 (backward compat).
     */
    side?: StrategySide;
    /**
     * 진입 조건 평가.
     * 룩어헤드 안전: candles[0..idx] 만 사용.
     *
     * @param candles      전체 캔들 배열
     * @param idx          현재 시점 인덱스
     * @param indicators   현재 시점 기술지표 (calculateAllIndicators 결과)
     * @param windowCandles candles.slice(max(0, idx-199), idx+1) — 룩어헤드 안전 슬라이스
     */
    shouldEnter(candles: Candle[], idx: number, indicators: TechnicalIndicators, windowCandles: Candle[]): EntryEvaluation;
    /**
     * 진입 시 청산 파라미터 산출.
     * 룩어헤드 안전: candles[0..idx] 만 사용.
     */
    getEntryParams(candles: Candle[], idx: number, indicators: TechnicalIndicators, entryPrice: number, windowCandles: Candle[]): EntryParams;
}
/** 전략 레지스트리 (signal-extractor 가 lookup) */
export declare const STRATEGY_REGISTRY: Map<StrategyName, BacktestStrategy>;
/** 전략 등록 헬퍼 */
export declare function registerStrategy(s: BacktestStrategy): void;
/** 전략 lookup */
export declare function getStrategy(name: StrategyName): BacktestStrategy;
