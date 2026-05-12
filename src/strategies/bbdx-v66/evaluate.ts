/**
 * BBDX v6.6 Bidirectional Evaluator (BBDX_v66_PERP §2.4).
 *
 * LONG/SHORT 둘 다 평가 → 충돌 처리 → 최종 결정:
 *   - 둘 다 발생 + 점수 차이 < 10 → 양쪽 차단 (혼란 상황, both_triggered=true)
 *   - 차이 ≥ 10 → 더 강한 시그널만
 *
 * 본 evaluator 는 라이브 시그널 + 백테스트 양쪽에서 사용 가능.
 *
 * 헌장 규칙 1/2/3 모두 통과:
 *   - R1: v6.5 BBDX 차원 안에서 작동 (decideEntry/decideShortEntry 그대로 사용)
 *   - R2: weights/threshold 모두 calibration (외부 manifest fallback)
 *   - R3: SHORT 도 modifier 형태 — 단독 시그널 X
 */

import type { Candle, TechnicalIndicators } from "../../shared/types";
import { evaluateLongV66, type V66LongResult } from "./long-entry";
import { evaluateShortV66, type V66ShortResult } from "./short-entry";
import { isShortEnabled } from "../../config/feature-flags";

export interface V66EvaluateInput {
  symbol: string;
  tf: string;
  candles: Candle[];
  windowCandles: Candle[];
  indicators: TechnicalIndicators;
}

export interface V66EvaluateOutput {
  long: V66LongResult | null;
  short: V66ShortResult | null;
  meta: {
    version: "v6.6";
    bothTriggered: boolean;
    conflictResolution?: "long_stronger" | "short_stronger" | "both_blocked" | "none";
    note?: string;
  };
}

/**
 * evaluatePositionSignalsV66 — LONG/SHORT 동시 평가 + 충돌 처리.
 *
 * SHORT 평가는 `ENABLE_SHORT_SIGNALS` flag 가 있어야 활성. 미설정 시 LONG only.
 */
export async function evaluatePositionSignalsV66(
  input: V66EvaluateInput,
): Promise<V66EvaluateOutput> {
  // LONG 평가 (항상)
  const longResult = await evaluateLongV66({
    symbol: input.symbol,
    tf: input.tf,
    candles: input.candles,
    windowCandles: input.windowCandles,
    indicators: input.indicators,
  });

  // SHORT 평가 (flag 가 켜졌을 때만)
  let shortResult: V66ShortResult | null = null;
  if (isShortEnabled()) {
    shortResult = await evaluateShortV66({
      symbol: input.symbol,
      tf: input.tf,
      candles: input.candles,
      windowCandles: input.windowCandles,
      indicators: input.indicators,
    });
  }

  // 충돌 처리: 둘 다 triggered
  if (longResult.triggered && shortResult?.triggered) {
    const diff = Math.abs(longResult.finalScore - shortResult.finalScore);
    if (diff < 10) {
      // 양쪽 차단
      return {
        long: null,
        short: null,
        meta: {
          version: "v6.6",
          bothTriggered: true,
          conflictResolution: "both_blocked",
          note: `시그널 충돌 (LONG ${longResult.finalScore.toFixed(1)} vs SHORT ${shortResult.finalScore.toFixed(1)}, 차이 ${diff.toFixed(1)} < 10) — 시장 방향 불명`,
        },
      };
    }
    // 더 강한 쪽만
    if (longResult.finalScore > shortResult.finalScore) {
      return {
        long: longResult,
        short: null,
        meta: {
          version: "v6.6",
          bothTriggered: true,
          conflictResolution: "long_stronger",
          note: `LONG (${longResult.finalScore.toFixed(1)}) 채택 — SHORT (${shortResult.finalScore.toFixed(1)}) 무시`,
        },
      };
    }
    return {
      long: null,
      short: shortResult,
      meta: {
        version: "v6.6",
        bothTriggered: true,
        conflictResolution: "short_stronger",
        note: `SHORT (${shortResult.finalScore.toFixed(1)}) 채택 — LONG (${longResult.finalScore.toFixed(1)}) 무시`,
      },
    };
  }

  // 한 쪽만 또는 둘 다 미발생
  return {
    long: longResult.triggered ? longResult : null,
    short: shortResult?.triggered ? shortResult : null,
    meta: {
      version: "v6.6",
      bothTriggered: false,
      conflictResolution: "none",
    },
  };
}
