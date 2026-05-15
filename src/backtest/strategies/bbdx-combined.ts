/**
 * BBDX Combined (LONG + SHORT) — v6.6 양방향 통합 backtest strategy.
 *
 * 사용자 요구 (2026-05-15): 기존 `bbdx` (LONG only) + `bbdx-short` (SHORT only)
 * 를 분리 백테스트 실행하지 않고, **단일 백테스트** 로 양쪽 path 의 signal 을
 * 동시에 추출하여 trade 배열을 concat. winRate / Sharpe 등이 양방향 결합
 * 결과로 계산된다.
 *
 * 동작 방식 (runner.ts 분기):
 *   1. runner 가 strategy="bbdx-combined" 감지 시:
 *      a. config.strategy="bbdx" 로 extractAllSignals 호출 → longTrades[]
 *      b. config.strategy="bbdx-short" 로 extractAllSignals 호출 → shortTrades[]
 *      c. concat → combinedTrades[]
 *      d. computeMetrics(combinedTrades) → overall (메인 결과)
 *      e. computeMetricsBySide(combinedTrades) → metricsBySide
 *   2. signal-extractor 는 본 strategy 의 shouldEnter / getEntryParams 를
 *      *직접 호출하지 않음*. (side === "both" 인 strategy 는 runner 분기 전용)
 *
 * 본 객체의 shouldEnter / getEntryParams 는 **방어용 stub** — 어떤 코드 경로에서
 * 본 strategy 를 일반 strategy 로 잘못 사용해도 안전하게 진입 0 으로 반환.
 *
 * 헌장 R3 (단독 시그널 X): bbdx + bbdx-short 두 LM 의 합집합이므로
 *   각 sub-strategy 가 이미 multi-차원 게이트 통과. 헌장 위반 X.
 */

import type { Candle, TechnicalIndicators } from "@shared/types";
import type { BacktestStrategy, EntryEvaluation, EntryParams } from "./types";
import { registerStrategy } from "./types";

export const bbdxCombinedStrategy: BacktestStrategy = {
  name: "bbdx-combined",
  label: "BBDX v6.6 (LONG+SHORT)",
  description:
    "LONG + SHORT 결과를 단일 백테스트로 결합. v6.6 양방향 시그널 — bbdx + bbdx-short 의 합집합.",
  // bbdx + bbdx-short 가 커버하는 차원의 union (1 momentum, 2 volatility, 3 trend, 5 structure)
  dimensionsCovered: [1, 2, 3, 5],
  side: "both",

  /**
   * Sentinel — runner 가 분기 처리하므로 직접 호출되면 안 됨.
   * 안전을 위해 항상 entry=false 반환.
   */
  shouldEnter(
    _candles: Candle[],
    _idx: number,
    _indicators: TechnicalIndicators,
    _windowCandles: Candle[],
  ): EntryEvaluation {
    return { entry: false };
  },

  /**
   * Sentinel — runner 가 분기 처리하므로 직접 호출되면 안 됨.
   * shouldEnter 가 false 반환하므로 본 함수는 실제로 호출되지 않지만,
   * 인터페이스 준수를 위해 entry 가격 그대로 반환하는 no-op 구현.
   */
  getEntryParams(
    _candles: Candle[],
    _idx: number,
    _indicators: TechnicalIndicators,
    entryPrice: number,
    _windowCandles: Candle[],
  ): EntryParams {
    return {
      target1: entryPrice,
      target2: entryPrice,
      stopLoss: entryPrice,
      signalStrength: 0,
    };
  },
};

registerStrategy(bbdxCombinedStrategy);
