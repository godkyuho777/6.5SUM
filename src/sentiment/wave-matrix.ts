/**
 * Wave Matrix — 4-신호 confluence
 *
 * 명세서 §4 그대로:
 *   1. OI Signal       — 복합 해석 (OI 변화 + 가격 변화 + F&G) 9가지 매트릭스
 *   2. Sentiment Signal — composite > 60 / < 40 / 그 외
 *   3. Funding Signal  — 펀딩 양수/음수
 *   4. L/S Signal      — 롱 우세 / 숏 우세
 *
 * 종합 편향 (투표):
 *   bullishCount >= 3            → bullish
 *   bearishCount >= 3            → bearish
 *   bullishCount > bearishCount  → bullish
 *   bearishCount > bullishCount  → bearish
 *   else                         → neutral
 *
 * 신뢰도:
 *   confidence = (max(bullishCount, bearishCount) / 4) × 100 × (compositeScore/100 + 0.5)
 *   clamp 0~100
 */

import type {
  BybitDerivativesData,
  BybitLongShortData,
  Signal,
  WaveMatrixState,
} from "./types";

function deriveOiSignal(
  oiChangeRate: number,
  priceChange24h: number,
  fearGreedValue: number
): { signal: Signal; interpretation: string } {
  const oiUp = oiChangeRate > 2;
  const oiDown = oiChangeRate < -2;
  const oiFlat = !oiUp && !oiDown;
  const priceUp = priceChange24h > 1;
  const priceDown = priceChange24h < -1;
  const fearful = fearGreedValue < 35;
  const greedy = fearGreedValue > 65;

  const oiStr = `OI ${oiChangeRate >= 0 ? "+" : ""}${oiChangeRate.toFixed(2)}%`;
  const priceStr = `가격 ${priceChange24h >= 0 ? "+" : ""}${priceChange24h.toFixed(2)}%`;

  // 9가지 케이스
  if (oiUp && priceUp && greedy) {
    return {
      signal: "bullish",
      interpretation: `${oiStr} ↑ + ${priceStr} ↑ + 탐욕 → 새 롱 포지션 대량 유입 + 상승 가속`,
    };
  }
  if (oiUp && priceUp && fearful) {
    return {
      signal: "bullish",
      interpretation: `${oiStr} ↑ + ${priceStr} ↑ + 공포 → 스마트머니 매집 (초기 상승)`,
    };
  }
  if (oiUp && priceUp) {
    return {
      signal: "bullish",
      interpretation: `${oiStr} ↑ + ${priceStr} ↑ → 새 포지션 유입 + 상승 진행`,
    };
  }
  if (oiUp && priceDown) {
    return {
      signal: "bearish",
      interpretation: `${oiStr} ↑ + ${priceStr} ↓ → 새 숏 포지션 또는 롱 물타기 (하방 압력)`,
    };
  }
  if (oiDown && priceDown && fearful) {
    return {
      signal: "neutral",
      interpretation: `${oiStr} ↓ + ${priceStr} ↓ + 공포 → 롱 강제 청산 (바닥 탐색)`,
    };
  }
  if (oiDown && priceDown) {
    return {
      signal: "bearish",
      interpretation: `${oiStr} ↓ + ${priceStr} ↓ → 롱 청산 진행 (추가 하락 가능)`,
    };
  }
  if (oiDown && priceUp && greedy) {
    return {
      signal: "bullish",
      interpretation: `${oiStr} ↓ + ${priceStr} ↑ + 탐욕 → 숏 스퀘즈 (숏 강제 청산)`,
    };
  }
  if (oiDown && priceUp) {
    return {
      signal: "neutral",
      interpretation: `${oiStr} ↓ + ${priceStr} ↑ → 숏 청산 진행 (반등 강도 확인 필요)`,
    };
  }
  if (oiFlat && priceUp) {
    return {
      signal: "neutral",
      interpretation: `${oiStr} (변동 미미) + ${priceStr} ↑ → 기존 포지션 유지 속 약한 상승`,
    };
  }
  if (oiFlat && priceDown) {
    return {
      signal: "neutral",
      interpretation: `${oiStr} (변동 미미) + ${priceStr} ↓ → 기존 포지션 유지 속 약한 하락`,
    };
  }
  return {
    signal: "neutral",
    interpretation: `${oiStr} + ${priceStr} → 방향성 불명확`,
  };
}

function deriveSentimentSignal(score: number): Signal {
  if (score > 60) return "bullish";
  if (score < 40) return "bearish";
  return "neutral";
}

function deriveFundingSignal(fundingRateAvg: number): Signal {
  if (fundingRateAvg > 0.005) return "bullish";
  if (fundingRateAvg < -0.005) return "bearish";
  return "neutral";
}

function deriveLsSignal(ratio: number): Signal {
  if (ratio > 1.1) return "bullish";
  if (ratio < 0.9) return "bearish";
  return "neutral";
}

export function computeWaveMatrix(
  derivatives: BybitDerivativesData,
  ls: BybitLongShortData,
  compositeScore: number,
  fearGreedValue: number
): WaveMatrixState {
  const oi = deriveOiSignal(derivatives.oiChangeRate, derivatives.priceChange24h, fearGreedValue);
  const sentimentSignal = deriveSentimentSignal(compositeScore);
  const fundingSignal = deriveFundingSignal(derivatives.fundingRateAvg);
  const lsSignal = deriveLsSignal(ls.ratio);

  const signals: Signal[] = [oi.signal, sentimentSignal, fundingSignal, lsSignal];
  const bullishCount = signals.filter((s) => s === "bullish").length;
  const bearishCount = signals.filter((s) => s === "bearish").length;

  let overallBias: Signal = "neutral";
  if (bullishCount >= 3) overallBias = "bullish";
  else if (bearishCount >= 3) overallBias = "bearish";
  else if (bullishCount > bearishCount) overallBias = "bullish";
  else if (bearishCount > bullishCount) overallBias = "bearish";

  // 신뢰도: 명세서 §4.4 공식 그대로
  const maxCount = Math.max(bullishCount, bearishCount);
  const confidenceRaw = (maxCount / 4) * 100 * (compositeScore / 100 + 0.5);
  const confidence = Math.max(0, Math.min(100, Math.round(confidenceRaw)));

  // 예측 메시지
  const { prediction, predictionKo } = derivePrediction(
    overallBias,
    confidence,
    bullishCount,
    bearishCount,
    derivatives,
    fearGreedValue
  );

  return {
    oiSignal: oi.signal,
    sentimentSignal,
    fundingSignal,
    lsSignal,
    overallBias,
    confidence,
    prediction,
    predictionKo,
    oiChangeRate: derivatives.oiChangeRate,
    fearGreedValue,
    fundingRateAvg: derivatives.fundingRateAvg,
    longRatio: ls.longRatio,
    shortRatio: ls.shortRatio,
    priceChange24h: derivatives.priceChange24h,
    oiInterpretation: oi.interpretation,
    oiInterpretationSignal: oi.signal,
    computedAt: new Date().toISOString(),
  };
}

function derivePrediction(
  bias: Signal,
  confidence: number,
  bullCount: number,
  bearCount: number,
  derivatives: BybitDerivativesData,
  fng: number
): { prediction: string; predictionKo: string } {
  if (bias === "bullish" && confidence >= 70) {
    return {
      prediction: "Strong bullish confluence. Trend-following entries with tight stops.",
      predictionKo: "강한 상승 일치. 추세 추종 진입 + 익절 계획 필수.",
    };
  }
  if (bias === "bullish") {
    return {
      prediction: "Mild bullish bias. Wait for confirmation.",
      predictionKo: "약한 상승 편향. 확정 캔들 대기 권장.",
    };
  }
  if (bias === "bearish" && confidence >= 70) {
    return {
      prediction: "Strong bearish confluence. Avoid counter-trend longs.",
      predictionKo: "강한 하락 일치. 역추세 롱 자제. 분할 매수 검토.",
    };
  }
  if (bias === "bearish") {
    return {
      prediction: "Mild bearish bias. Tighten risk.",
      predictionKo: "약한 하락 편향. 리스크 관리 강화.",
    };
  }
  return {
    prediction: "Mixed signals — wait for stronger confluence.",
    predictionKo: "신호 혼재. 추가 데이터 확인 후 판단 권장.",
  };
}
