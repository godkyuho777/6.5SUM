/**
 * CVD (Cumulative Volume Delta) Divergence Modifier — 명세서 §3.
 *
 * 베타 스캐폴드 — 본격 구현은 WebSocket /v5/public/spot publicTrade
 * stream 누적 + 대용량 처리라 본 작업 범위 외.
 *
 * 차원 4 (volume/liquidity). RSI/MACD 와 다른 차원이라 헌장 규칙 1 통과.
 *
 * TODO(beta):
 *   1. WebSocket stream 구독 → trade tick 의 side (Buy/Sell) 누적
 *   2. 1h 윈도우 / 4h 윈도우 / session 윈도우 별 CVD 시계열 산출
 *   3. 가격 swing vs CVD swing 비교 → divergence 분류
 *   4. Spot vs Perp CVD 분리 (Spot 이 진짜 매수자에 가까움 — 명세서 §3.4)
 *
 * 현재 구현:
 *   - 항상 status="stub", multiplier=1.0 (영향 없음).
 *   - betaStub=true 로 식별. 향후 production 전환 시 false 로 변경.
 */

import type { Candle } from "@shared/types";
import type { ModifierResult } from "./types";

export type CvdDivergenceType = "bullish" | "bearish" | "none";

export interface CvdDivergenceResult extends ModifierResult {
  type: CvdDivergenceType;
  /** 베타 스캐폴드임을 명시. WebSocket integration 완료 시 false. */
  betaStub: true;
}

/**
 * CVD divergence — 베타 스캐폴드.
 *
 * @param symbol Bybit 심볼 (예: "BTCUSDT"). 향후 publicTrade stream 구독 키.
 * @param candles 시간순 캔들 (현재는 미사용, 향후 가격 swing 비교용).
 */
export async function detectCvdDivergence(
  symbol: string,
  candles: Candle[]
): Promise<CvdDivergenceResult> {
  // 현재는 항상 neutral stub. 입력 인자는 WebSocket integration 시 활용.
  void symbol;
  void candles;

  return {
    multiplier: 1.0,
    rawScore: 0,
    reason:
      "CVD divergence — beta stub (WebSocket /v5/public/spot publicTrade integration pending)",
    dimension: 4,
    status: "stub",
    type: "none",
    betaStub: true,
  };
}
