/**
 * Backtesting Engine — Type Definitions
 *
 * 04_TREND_WEIGHTING_FRAMEWORK.md Phase 2 기반:
 * - BBDX Signal Tracker를 과거 데이터에 재생
 * - 각 시그널의 승/패 outcome 측정
 * - 통계 기반 캘리브레이션 보고서 생성
 */

import type { TimeframeValue } from "@shared/types";

// ─────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────

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
}

export const DEFAULT_BACKTEST_CONFIG: Omit<BacktestConfig, "symbols" | "startDate" | "endDate"> = {
  tf: "4h",
  minWarmupCandles: 60,
  outcomeWindowCandles: 42, // 7 days on 4h
  cooldownCandles: 5,
  saveToDb: false,
};

// ─────────────────────────────────────────────────────────
// Individual Trade
// ─────────────────────────────────────────────────────────

export type ExitReason = "target_hit" | "stop_loss" | "window_expired";

export interface BacktestTrade {
  /** 시그널 발생 캔들의 openTime (ms) */
  signalTs: number;
  symbol: string;
  tf: TimeframeValue;

  // ── 진입 정보 ─────────────────────────────────────────
  /** 진입 가격 (시그널 발생 캔들 close) */
  entryPrice: number;
  /** 목표가 (시그널 시점의 BB-middle) */
  target: number;
  /** 손절가 (시그널 시점의 BB-lower × 0.97) */
  stopLoss: number;

  // ── 시그널 발생 시점 지표 ─────────────────────────────
  signalStrength: number;
  rsi: number;
  bbLower: number;
  bbMiddle: number;
  bbUpper: number;
  adx: number;
  plusDi: number;
  minusDi: number;

  // ── 결과 ─────────────────────────────────────────────
  exitPrice: number;
  exitTs: number;
  exitReason: ExitReason;
  /** (exitPrice − entryPrice) / entryPrice × 100 */
  returnPct: number;
  /** 보유 기간 중 최대 순방향 수익률 % */
  maxFavorable: number;
  /** 보유 기간 중 최대 역방향 손실률 % */
  maxAdverse: number;
  /** 목표가 도달 = true (손절 or 만료 = false) */
  win: boolean;
  /** 보유한 캔들 수 */
  holdingCandles: number;
}

// ─────────────────────────────────────────────────────────
// Metrics
// ─────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────
// Full Result
// ─────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────
// Data Loader
// ─────────────────────────────────────────────────────────

export interface FetchHistoricalOptions {
  symbol: string;
  tf: TimeframeValue;
  startMs: number;
  endMs: number;
  /** 요청 간 딜레이 ms (rate-limit 방지, 기본 200) */
  requestDelayMs?: number;
}

// ─────────────────────────────────────────────────────────
// CLI Args
// ─────────────────────────────────────────────────────────

export interface BacktestCliArgs {
  symbols?: string[];
  tf?: TimeframeValue;
  start?: string;
  end?: string;
  outcomeWindow?: number;
  cooldown?: number;
  saveToDb?: boolean;
  runName?: string;
  quickMode?: boolean; // top-5 coins only, 3 months
}
