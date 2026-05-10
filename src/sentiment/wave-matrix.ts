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
  OiDivergence,
  Signal,
  WaveMatrixState,
  MarketPhase,
} from "./types";
import { deriveMacroStance } from "./macro-stance";

// ─── v4.3 Phase C — OI Divergence (24h vs 7d) ───────────────────

/**
 * OI 24h vs 7d 괴리 분류. 단기와 장기 방향이 갈리면 추세 전환 신호.
 *
 * @param oi24h  24h OI 변화율 (%)
 * @param oi7d   7d OI 변화율 (% 또는 undefined — 데이터 없으면 CHOPPY 처리)
 */
export function deriveOiDivergence(
  oi24h: number,
  oi7d?: number,
): { divergence: OiDivergence; ko: string } {
  if (oi7d == null || isNaN(oi7d)) {
    return { divergence: "CHOPPY", ko: "다중 기간 데이터 없음" };
  }
  const big7dUp = oi7d > 10;
  const big7dDown = oi7d < -10;
  const sharp24hUp = oi24h > 3;
  const sharp24hDown = oi24h < -3;

  if (big7dDown && sharp24hUp) {
    return {
      divergence: "BULL_REVERSAL",
      ko: `7일간 청산(${oi7d.toFixed(1)}%) 후 24h 신규 롱(${oi24h.toFixed(1)}%) — 바닥 반등 신호`,
    };
  }
  if (big7dUp && sharp24hDown) {
    return {
      divergence: "BEAR_REVERSAL",
      ko: `7일간 매수누적(${oi7d.toFixed(1)}%) 후 24h 청산(${oi24h.toFixed(1)}%) — 고점 분산 신호`,
    };
  }
  if (big7dUp && sharp24hUp) {
    return {
      divergence: "BULL_ACCEL",
      ko: `7일 매수(${oi7d.toFixed(1)}%) + 24h 가속(${oi24h.toFixed(1)}%) — 상승 추세 진행`,
    };
  }
  if (big7dDown && sharp24hDown) {
    return {
      divergence: "BEAR_ACCEL",
      ko: `7일 청산(${oi7d.toFixed(1)}%) + 24h 가속(${oi24h.toFixed(1)}%) — 하락 추세 진행`,
    };
  }
  return {
    divergence: "CHOPPY",
    ko: `24h ${oi24h >= 0 ? "+" : ""}${oi24h.toFixed(1)}% / 7d ${oi7d >= 0 ? "+" : ""}${oi7d.toFixed(1)}% — 명확한 multi-period 신호 없음`,
  };
}

// ─── v4.3 Phase D — Prediction 12-ID matrix ─────────────────────

const PREDICTIONS: Record<
  string,
  { en: string; ko: string; action: string }
> = {
  // HEATING (탐욕 + OI↑)
  HEATING_bullish_strong: {
    en: "Strong bullish acceleration in heating phase.",
    ko: "강한 상승 가속 (가열). 추세 추종 진입 + 분할 익절 준비.",
    action: "추세 매수 OK. 50% 익절 라인 미리 설정. 펀딩 폭주 시 절반 청산.",
  },
  HEATING_bullish_med: {
    en: "Moderate bullish bias in heating phase.",
    ko: "상승 편향 (가열). 추가 모멘텀 확인 권장.",
    action: "분할 매수 OK. 사이즈 70%. 손절 BB-Lower 기준.",
  },
  HEATING_bullish_weak: {
    en: "Weak bullish bias in heating phase.",
    ko: "약한 상승 편향. 신중 접근.",
    action: "사이즈 30%. 확정 캔들 대기. 즉각 손절 룰.",
  },
  // ACCUMULATION (공포 + OI↑)
  ACCUMULATION_bullish_strong: {
    en: "Smart money accumulation phase, strong setup.",
    ko: "스마트머니 매집 (공포 + OI↑). 분할 매수 가능.",
    action: "분할 매수 OK (3~5회). 사이즈 80%. 시간 분산.",
  },
  ACCUMULATION_bullish_med: {
    en: "Mild accumulation phase setup.",
    ko: "공포 + OI↑ 의 약한 매집 신호. 추가 신호 대기.",
    action: "분할 매수 60%. 추가 dip 시 추매 여력 보존.",
  },
  ACCUMULATION_bearish_strong: {
    en: "Bearish despite OI uptick — fake bounce risk.",
    ko: "공포 + OI↑ 인데 베어 우세 — 가짜 반등 가능. 신중.",
    action: "신규 롱 자제. 보유 시 짧은 stop. 반등 거부 캔들 시 청산.",
  },
  // DISTRIBUTION (탐욕 + OI↓)
  DISTRIBUTION_bullish_med: {
    en: "Top distribution risk despite remaining demand.",
    ko: "탐욕 + OI↓ 인데 매수세 잔존 — 분산 임박.",
    action: "익절 타이밍. 신규 롱 자제. 50% 익절 우선.",
  },
  DISTRIBUTION_bearish_strong: {
    en: "Strong distribution — top likely formed.",
    ko: "고점 분산 진행 (강). 신규 롱 자제. 짧은 stop 으로 숏 검토.",
    action: "보유 청산 우선. 숏 진입 시 사이즈 50% + 짧은 stop.",
  },
  DISTRIBUTION_bearish_weak: {
    en: "Distribution risk — tighten stops.",
    ko: "분산 가능성. 보유 stop 강화.",
    action: "익절선 끌어올리기. 신규 진입 보류.",
  },
  // PANIC (공포 + OI↓)
  PANIC_bearish_strong: {
    en: "Panic-sell continuing. Wait for capitulation signal.",
    ko: "패닉셀 진행 (강). 매수 자제. F&G < 20 + OI 반등 시 분할 진입.",
    action: "현금 보유. 캐피츌레이션 시그널 (F&G < 20 + 거래량 폭증) 대기.",
  },
  PANIC_bearish_weak: {
    en: "Panic ongoing but signal weak.",
    ko: "패닉 진행 중이나 신뢰도 낮음. 관망 우선.",
    action: "관망. 사이즈 0%. 추가 데이터 대기.",
  },
  PANIC_bullish_med: {
    en: "Panic + buying pressure — capitulation reversal possible.",
    ko: "패닉 + 매수세 — 캐피츌레이션 반등 가능. 분할 진입.",
    action: "분할 매수 (40%). 추가 dip 50% 추매 여력. stop 직전 저점.",
  },
  // 공통
  mixed: {
    en: "Mixed signals — wait for stronger confluence.",
    ko: "신호 혼재. 추가 데이터 확인 후 판단 권장.",
    action: "관망 우선. 진입 시 작은 사이즈 + 명확한 stop.",
  },
  tied: {
    en: "Signals tied — no clear direction.",
    ko: "신호 미정 (4-신호 동점). 관망 권장.",
    action: "관망. 사이즈 0%. 4-신호 중 1개라도 명확해질 때까지 대기.",
  },
};

function predictionKey(
  phase: MarketPhase,
  bias: Signal,
  confidence: number,
): string {
  if (bias === "neutral") return "mixed";
  const conf = confidence >= 70 ? "strong" : confidence >= 60 ? "med" : "weak";
  const candidate = `${phase}_${bias}_${conf}`;
  if (candidate in PREDICTIONS) return candidate;
  // Fallback: try lower confidence
  for (const fallback of [
    `${phase}_${bias}_med`,
    `${phase}_${bias}_weak`,
    `${phase}_${bias}_strong`,
  ]) {
    if (fallback in PREDICTIONS) return fallback;
  }
  return "mixed";
}

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

  // ── Prediction v4.3 — 12-ID matrix (Phase D) ───────────────
  const predId = isTie
    ? "tied"
    : predictionKey(marketPhase, overallBias, confidence);
  const predEntry = PREDICTIONS[predId] ?? PREDICTIONS.mixed;

  // ── Macro Stance (v4.2 — Audit Phase B 신설) ──────────────────
  // 사용자 명시 요청: "거시적 스탠스를 알려주는 지표".
  // BBDX 시그널의 macro 컨텍스트 라벨로만 사용 (헌장 규칙 3, modifier-only).
  const macroStance = deriveMacroStance(
    compositeScore,
    overallBias,
    confidence,
    marketPhase
  );

  // ── OI Divergence v4.3 (Phase C) ─────────────────────────────
  const oiDivResult = deriveOiDivergence(
    derivatives.oiChangeRate,
    derivatives.oiChange7d
  );

  return {
    oiSignal: oi.signal,
    sentimentSignal,
    fundingSignal,
    lsSignal,
    overallBias,
    confidence,
    prediction: predEntry.en,
    predictionKo: predEntry.ko,
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
    // v4.3 Phase C
    oiChange7d: derivatives.oiChange7d,
    fundingAvg7d: derivatives.fundingAvg7d,
    fundingTrend7d: derivatives.fundingTrend7d,
    oiDivergence: oiDivResult.divergence,
    oiDivergenceKo: oiDivResult.ko,
    // v4.3 Phase D
    predictionId: predId,
    recommendedAction: predEntry.action,
    computedAt: new Date().toISOString(),
  };
}

// (v4.3 — old derivePrediction removed; replaced by predictionKey + PREDICTIONS map above)
