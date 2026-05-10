/**
 * Backtesting Engine — Type Definitions
 *
 * 04_TREND_WEIGHTING_FRAMEWORK.md Phase 2 기반:
 * - BBDX Signal Tracker를 과거 데이터에 재생
 * - 각 시그널의 승/패 outcome 측정
 * - 통계 기반 캘리브레이션 보고서 생성
 */
import type { TimeframeValue } from "@shared/types";
/**
 * 전략 식별자 — `src/backtest/strategies/` 의 등록된 BacktestStrategy.name 와 일치.
 */
export type BacktestStrategyName = "bbdx" | "fibonacci" | "vwap" | "trend";
export interface BacktestConfig {
    /** 백테스팅할 심볼 목록 */
    symbols: string[];
    /** 타임프레임 (기본: 4h) */
    tf: TimeframeValue;
    /** 시작일 (Date 객체 또는 ISO string) */
    startDate: Date;
    /** 종료일 */
    endDate: Date;
    /**
     * 지표 계산에 필요한 최소 워밍업 캔들 수
     * ADX(14) 안정화: ~35캔들 / BB(20): 20캔들 → 기본 60
     */
    minWarmupCandles: number;
    /**
     * 시그널 발생 후 결과 측정 윈도우 (캔들 수)
     * 4h × 42 = 7일 / 1d × 14 = 14일
     */
    outcomeWindowCandles: number;
    /** 중복 시그널 방지: 같은 심볼에서 시그널 후 N캔들 동안 재진입 금지 */
    cooldownCandles: number;
    /** DB에 개별 trade 결과 저장 여부 */
    saveToDb: boolean;
    /** 실행 이름 (리포트 파일명 등에 사용) */
    runName?: string;
    /**
     * 사용할 전략 (기본: bbdx).
     * Signal Tracker 의 모든 투자 전략 + Wave Tracker Trend Analysis 백테스트.
     */
    strategy?: BacktestStrategyName;
}
export declare const DEFAULT_BACKTEST_CONFIG: Omit<BacktestConfig, "symbols" | "startDate" | "endDate">;
export type ExitReason = "target_hit" | "stop_loss" | "window_expired" | "tier1_then_window" | "tier2_full" | "tier1_then_stop";
/** v6.5 phase1: 부분 청산 한 단계 */
export interface PartialExit {
    /** 1=Tier 1 (50% partial), 2=Tier 2 (full) */
    tier: 1 | 2;
    /** 부분 청산 시점 캔들 인덱스 (signalIdx 부터의 offset) */
    candleOffset: number;
    /** 부분 청산 가격 */
    price: number;
    /** 청산 비율 (0~1, 누적이 1.0 이 되어야 함) */
    ratio: number;
    /** 이 부분의 수익률 % (entryPrice 대비) */
    returnPct: number;
}
export interface BacktestTrade {
    /** 시그널 발생 캔들의 openTime (ms) */
    signalTs: number;
    symbol: string;
    tf: TimeframeValue;
    /** 어떤 전략으로 시그널이 발생했는지 (per-strategy 통계 분리용) */
    strategy?: BacktestStrategyName;
    /** 진입 충족 사유 (strategy.shouldEnter 의 reasons) */
    entryReasons?: string[];
    /** 전략별 메타 (Fib level, VWAP position, Trend confidence 등) */
    strategyMeta?: Record<string, unknown>;
    /** 진입 가격 (시그널 발생 캔들 close) */
    entryPrice: number;
    /** Tier 1 목표가 (BB-middle, 50% 부분 청산) */
    target: number;
    /** Tier 2 목표가 (BB-upper 또는 entry×1.05, 잔여 50% 청산) */
    target2?: number;
    /** 손절가 (max(BB-lower × 0.97, entry × 0.98)) */
    stopLoss: number;
    signalStrength: number;
    rsi: number;
    bbLower: number;
    bbMiddle: number;
    bbUpper: number;
    adx: number;
    plusDi: number;
    minusDi: number;
    /** Pattern Confluence score (0~1, 게이트: ≥ 0.4) */
    patternConfluenceScore?: number;
    /** Higher-TF SMA(50) 통과 여부 (price > SMA50 + slope > 0) */
    higherTfBullish?: boolean;
    /** EMA Ribbon multiplier (3번 trend, 0.30~1.15) */
    emaRibbonMult?: number;
    /** MACD Divergence multiplier (1번 momentum, 0.80~1.20) */
    macdDivergenceMult?: number;
    /** Order Block multiplier (5번 structure, 0.95~1.05) */
    orderBlockMult?: number;
    /** 곱셈 합산 modifier (= emaRibbon × macd × ob) */
    modifiersProduct?: number;
    /** signalStrength × modifiersProduct = adjustedConfidence */
    adjustedConfidence?: number;
    /** 가중 평균 청산 가격 (Tier 1 + Tier 2 weighted) */
    exitPrice: number;
    /** 마지막 청산 시점 ts */
    exitTs: number;
    exitReason: ExitReason;
    /** 가중 평균 수익률 % (= 50%*tier1Return + 50%*tier2Return) */
    returnPct: number;
    /** 보유 기간 중 최대 순방향 수익률 % */
    maxFavorable: number;
    /** 보유 기간 중 최대 역방향 손실률 % */
    maxAdverse: number;
    /** 가중 평균 수익률 > 0 = win */
    win: boolean;
    /** 마지막 청산까지 보유한 캔들 수 */
    holdingCandles: number;
    /** v6.5 phase1: 부분 청산 단계들 (1~2 개) */
    partialExits?: PartialExit[];
}
export interface BacktestMetrics {
    totalTrades: number;
    wins: number;
    losses: number;
    /** 승률 0~1 */
    winRate: number;
    /** 평균 수익률 % */
    avgReturn: number;
    /** 수익률 표준편차 */
    stdReturn: number;
    /**
     * Simplified Sharpe: avgReturn / stdReturn
     * (연환산 없이 트레이드 단위 — 상대 비교용)
     */
    sharpe: number;
    /** 최대 낙폭 % (누적 equity curve 기준) */
    maxDrawdown: number;
    /** 총 이익 / 총 손실 절대값 */
    profitFactor: number;
    /** 평균 승리 트레이드 수익률 % */
    avgWin: number;
    /** 평균 패배 트레이드 손실률 % */
    avgLoss: number;
    /** 기댓값: winRate×avgWin − lossRate×|avgLoss| */
    expectancy: number;
    /** 평균 보유 캔들 수 */
    avgHoldingCandles: number;
    /** 평균 최대 순방향 수익률 */
    avgMaxFavorable: number;
    /** 평균 최대 역방향 손실률 */
    avgMaxAdverse: number;
}
export interface BacktestResult {
    config: BacktestConfig;
    /** 전체 통계 */
    overall: BacktestMetrics;
    /** 심볼별 통계 */
    bySymbol: Record<string, BacktestMetrics>;
    /** 타임프레임별 통계 (단일 TF 백테스트에선 1개) */
    byTf: Record<string, BacktestMetrics>;
    /** 개별 트레이드 목록 */
    trades: BacktestTrade[];
    /** 실행 시각 ISO string */
    runAt: string;
    /** 전체 소요 시간 ms */
    durationMs: number;
    /** DB에 저장된 run ID (saveToDb=true일 때) */
    runId?: number;
}
export interface FetchHistoricalOptions {
    symbol: string;
    tf: TimeframeValue;
    startMs: number;
    endMs: number;
    /** 요청 간 딜레이 ms (rate-limit 방지, 기본 200) */
    requestDelayMs?: number;
}
export interface BacktestCliArgs {
    symbols?: string[];
    tf?: TimeframeValue;
    start?: string;
    end?: string;
    outcomeWindow?: number;
    cooldown?: number;
    saveToDb?: boolean;
    runName?: string;
    quickMode?: boolean;
}
