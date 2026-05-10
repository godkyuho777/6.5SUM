/**
 * Wave Matrix — 4-신호 confluence (v4.2 — Audit 반영)
 *
 * WAVE_SENTIMENT_AUDIT.md §3 (Phase A) + §4 (Phase B macro stance) 변경:
 *
 *   1. OI Signal       — 복합 해석 (OI 변화 + 가격 변화 + F&G) 9가지 매트릭스 + ±3% threshold
 *   2. Sentiment Signal — composite > 60 / < 40 / 그 외
 *   3. Funding Signal  — 임계값 ±0.005% → ±0.01%
 *   4. L/S Signal      — 임계값 1.1/0.9 → 2.0/1.0 (retail bias 보정)
 *
 * 종합 편향 (투표):
 *   bullishCount >= 3                  → bullish
 *   bearishCount >= 3                  → bearish
 *   bullishCount > bearishCount        → bullish
 *   bearishCount > bullishCount        → bearish
 *   else                               → neutral (tie)
 *
 * Confidence (v4.2 symmetric):
 *   signalStrength = |compositeScore - 50| / 50  (0~1)
 *   confidence = (|bullCount - bearCount| / 4) × 100 × signalStrength
 *   tie (bull == bear) 면 0
 *
 *   기존 공식의 비대칭성 제거 — bear 일치도 bull 일치와 동일 신뢰도.
 */

import type {
  BybitDerivativesData,
  BybitLongShortData,
  Signal,
  WaveMatrixState,
  MarketPhase,
} from "./types";
import { deriveMacroStance } from "./macro-stance";

function deriveOiSignal(
  oiChangeRate: number,
  priceChange24h: number,
  fearGreedValue: number
): { signal: Signal; interpretation: string } {
  // v4.2: ±2% → ±3% (strong threshold). 평소 BTC OI 24h 변동 ±1.5% 노이즈 제거.
  const oiUp = oiChangeRate > 3;
  const oiDown = oiChangeRate < -3;
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
  // v4.2: ±0.005% → ±0.01% (Bybit 표준 펀딩 분포 반영). 0.005% 는 노이즈.
  if (fundingRateAvg > 0.01) return "bullish";
  if (fundingRateAvg < -0.01) return "bearish";
  return "neutral";
}

function deriveLsSignal(ratio: number): Signal {
  // v4.2: 1.1/0.9 → 2.0/1.0 (Bybit account-ratio retail bias 보정).
  // Bybit retail 평균 ratio 1.5~2.0 long-bias → 1.1 임계값은 거의 항상 bullish 트리거.
  if (ratio > 2.0) return "bullish"; // 롱 과열 (분산 임박)
  if (ratio < 1.0) return "bearish"; // 드문 숏 우세
  return "neutral"; // retail 평상치
}

export function computeWaveMatrix(
  derivatives: BybitDerivativesData,
  ls: BybitLongShortData,
  compositeScore: number,
  fearGreedValue: number,
  marketPhase: MarketPhase = "HEATING"
): WaveMatrixState {
  const oi = deriveOiSignal(derivatives.oiChangeRate, derivatives.priceChange24h, fearGreedValue);
  const sentimentSignal = deriveSentimentSignal(compositeScore);
  const fundingSignal = deriveFundingSignal(derivatives.fundingRateAvg);
  const lsSignal = deriveLsSignal(ls.ratio);

  const signals: Signal[] = [oi.signal, sentimentSignal, fundingSignal, lsSignal];
  const bullishCount = signals.filter((s) => s === "bullish").length;
  const bearishCount = signals.filter((s) => s === "bearish").length;

  // v4.2 — tie 명시 (2:2 또는 3:3)
  const isTie = bullishCount === bearishCount && bullishCount > 0;

  let overallBias: Signal = "neutral";
  if (bullishCount >= 3) overallBias = "bullish";
  else if (bearishCount >= 3) overallBias = "bearish";
  else if (bullishCount > bearishCount) overallBias = "bullish";
  else if (bearishCount > bullishCount) overallBias = "bearish";

  // ── Confidence v4.2 — symmetric (Audit P-2/P-3 fix) ─────────────
  // 기존: (max/4) × 100 × (score/100 + 0.5) — bear 비대칭 평가절하
  // 신규: (|bull-bear|/4) × 100 × signalStrength
  //       signalStrength = |compositeScore - 50| / 50 (0~1, 대칭)
  // tie 면 confidence=0 명시.
  let confidence: number;
  if (isTie || (bullishCount === 0 && bearishCount === 0)) {
    confidence = 0;
  } else {
    const divergence = Math.abs(bullishCount - bearishCount); // 1~4
    const signalStrength = Math.abs(compositeScore - 50) / 50; // 0~1
    confidence = Math.round((divergence / 4) * 100 * signalStrength);
    confidence = Math.max(0, Math.min(100, confidence));
  }

  // 예측 메시지 — tie 면 별도 메시지
  const { prediction, predictionKo } = isTie
    ? {
        prediction: "Signals tied — wait for clearer confluence.",
        predictionKo: "신호 미정 (4-신호 동점). 추가 데이터 확인 후 판단 권장.",
      }
    : derivePrediction(
        overallBias,
        confidence,
        bullishCount,
        bearishCount,
        derivatives,
        fearGreedValue
      );

  // ── Macro Stance (v4.2 — Audit Phase B 신설) ──────────────────
  // 사용자 명시 요청: "거시적 스탠스를 알려주는 지표".
  // BBDX 시그널의 macro 컨텍스트 라벨로만 사용 (헌장 규칙 3, modifier-only).
  const macroStance = deriveMacroStance(
    compositeScore,
    overallBias,
    confidence,
    marketPhase
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
    macroStance,
    bullishCount,
    bearishCount,
    isTie,
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
