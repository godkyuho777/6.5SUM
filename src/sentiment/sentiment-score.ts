/**
 * Composite Sentiment Score (v4.2 — Audit 반영)
 *
 * WAVE_SENTIMENT_AUDIT.md §3 (Phase A) 변경:
 *   시작점 50 (중립)
 *   + Fear & Greed Index    (25%, 기존 40%) — (F&G - 50) × 0.25
 *   + 글로벌 시총           (15%, 기존 20%) — 시총변화율 × 1.0
 *   + BTC 도미넌스 보정     (5%)  — 알트시즌 / 알트약세 ±2
 *   + OI 변화율             (25%, 기존 15%) — gradient: ±3% strong / ±1.5% weak
 *   + Funding rate          (15%, 기존 25% 중) — 임계값 ±0.005% → ±0.01%
 *   + Long/Short            (15%, 기존 25% 중) — 임계값 1.1/0.9 → 2.0/1.0 (retail bias 보정)
 *   = Composite Score (clamp 0~100)
 *
 * 임계값 calibration (Bybit 실제 분포 반영):
 *   OI 24h: 평소 ±1.5% → strong 시그널은 ±3%
 *   Funding: Bybit 표준 ±0.01% (8h) → 0.005% 는 노이즈
 *   L/S Ratio: retail account 평균 1.5~2.0 (long-bias) → 1.1 임계값은 정보 무
 *
 * 시장 단계 (Phase OI threshold 도 ±2.5% 로 강화):
 *   sentiment<40 + OI>+2.5%  → ACCUMULATION
 *   sentiment>60 + OI>+2.5%  → HEATING
 *   sentiment>60 + OI<-2.5%  → DISTRIBUTION
 *   sentiment<40 + OI<-2.5%  → PANIC
 *   그 외                     → TRANSITIONAL (기본은 HEATING 으로 fallback)
 */

import type {
  BybitDerivativesData,
  BybitLongShortData,
  FearGreedClass,
  FearGreedPoint,
  GlobalMarketData,
  MarketPhase,
  MarketPhaseKo,
  SentimentSnapshot,
} from "./types";

function classify(score: number): FearGreedClass {
  if (score < 21) return "EXTREME_FEAR";
  if (score < 41) return "FEAR";
  if (score < 61) return "NEUTRAL";
  if (score < 81) return "GREED";
  return "EXTREME_GREED";
}

function phaseFor(sentimentScore: number, oiChangeRate: number): {
  phase: MarketPhase;
  phaseKo: MarketPhaseKo;
} {
  // v4.2 — Phase OI threshold ±1% → ±2.5% (signal threshold 와 일관성).
  const fearful = sentimentScore < 40;
  const greedy = sentimentScore > 60;
  const oiUp = oiChangeRate > 2.5;
  const oiDown = oiChangeRate < -2.5;
  if (fearful && oiUp) return { phase: "ACCUMULATION", phaseKo: "축적" };
  if (greedy && oiUp) return { phase: "HEATING", phaseKo: "가열" };
  if (greedy && oiDown) return { phase: "DISTRIBUTION", phaseKo: "분산" };
  if (fearful && oiDown) return { phase: "PANIC", phaseKo: "공포" };
  // v4.2: 명확한 phase 가 없으면 transitional 으로 분류해야 하지만,
  // 기존 type 호환을 위해 HEATING 으로 fallback 유지. (다음 PR 에서 enum 확장)
  return { phase: "HEATING", phaseKo: "가열" };
}

export function computeComposite(
  fng: FearGreedPoint[],
  global: GlobalMarketData,
  derivatives: BybitDerivativesData,
  ls: BybitLongShortData
): SentimentSnapshot {
  let score = 50; // 시작점

  // ── 1. Fear & Greed (25%, 기존 40% 에서 축소) ────────────────
  // 1일 1회 갱신되는 저주파 신호이므로 가중치 축소.
  const currentFng = fng[0]?.value ?? 50;
  const fngContribution = (currentFng - 50) * 0.25;
  score += fngContribution;

  // F&G 7일 추세 — gradient 보정 (기존 ±2 단일 → ±3/±5 2-tier).
  const old = fng[Math.min(7, fng.length - 1)]?.value ?? currentFng;
  const fngDelta7d = currentFng - old;
  if (fngDelta7d > 15) score += 5;        // 급격 회복
  else if (fngDelta7d > 5) score += 3;    // 회복
  else if (fngDelta7d < -15) score -= 5;  // 급격 악화
  else if (fngDelta7d < -5) score -= 3;   // 악화

  // ── 2. 글로벌 시장 (15%, 기존 20% 에서 축소) ─────────────────
  const mcContribution = global.marketCapChange24h * 1.0; // 1.5 → 1.0
  score += mcContribution;

  // BTC 도미넌스 (보정 5%) — 알트시즌 / 알트약세
  if (global.btcDominance > 60) score -= 2;       // 알트 약세
  else if (global.btcDominance < 45) score += 2;  // 알트 시즌

  // ── 3. OI 변화율 (25%, 기존 15% 에서 확대) ───────────────────
  // 24h OI 변화는 가장 직접적인 포지션 흐름. 비중 확대.
  // Gradient: ±3% strong / ±1.5% weak. multiplier 도 강화 1.0 → 1.5.
  const oiAbs = Math.abs(derivatives.oiChangeRate);
  if (oiAbs >= 3) {
    score += derivatives.oiChangeRate * 1.5; // strong
  } else if (oiAbs >= 1.5) {
    score += derivatives.oiChangeRate * 0.75; // weak
  }
  // |OI| < 1.5% 는 노이즈 — 기여 0.

  // ── 4. Funding rate (15%) — 임계값 ±0.005% → ±0.01% ───────
  // Bybit 표준 펀딩 ±0.01% (8h) 가 평범한 수준. 이 미만은 노이즈.
  // strong (±0.02%) / medium (±0.01%) 2-tier.
  const fr = derivatives.fundingRateAvg;
  if (fr > 0.02) score += 5;       // 롱 강과열
  else if (fr > 0.01) score += 3;  // 롱 과열
  else if (fr < -0.02) score -= 5; // 숏 강과열
  else if (fr < -0.01) score -= 3; // 숏 과열

  // ── 5. Long/Short (15%) — retail bias 보정 임계값 ──────────
  // Bybit account-ratio 는 retail 중심 → 평균 자체가 1.5~2.0 (long-bias).
  // 임계값 1.1/0.9 는 거의 항상 트리거 → 정보 무.
  // 새 임계값: ratio > 2.0 (강 과열) / 1.5~2.0 (정상) / < 1.0 (드문 숏 우세).
  if (ls.ratio > 2.0) score += 4;       // 롱 과열 (분산 임박 신호)
  else if (ls.ratio < 1.0) score -= 4;  // 숏 우세 (드문 베어 신호)
  // 1.0~2.0 = retail 평상치 — 기여 0.

  const compositeScore = Math.max(0, Math.min(100, Math.round(score)));
  const compositeLabel = classify(compositeScore);
  const { phase, phaseKo } = phaseFor(compositeScore, derivatives.oiChangeRate);

  // 분석 근거 (5~8개)
  const reasons: string[] = [];
  reasons.push(
    `Fear & Greed: ${currentFng} (${labelKo(classify(currentFng))}) → ${
      currentFng < 40 ? "공포 구간, 바닥 탐색 중" :
      currentFng > 60 ? "탐욕 구간, 과열 주의" :
      "중립 구간, 방향성 약함"
    }`
  );
  if (Math.abs(fngDelta7d) > 5) {
    reasons.push(
      `F&G 7일 추세: ${fngDelta7d >= 0 ? "+" : ""}${fngDelta7d.toFixed(0)}pt (${
        fngDelta7d > 0 ? "심리 회복 중" : "심리 악화 중"
      })`
    );
  }
  reasons.push(
    `글로벌 시총 24h: ${global.marketCapChange24h >= 0 ? "+" : ""}${global.marketCapChange24h.toFixed(2)}% (${
      Math.abs(global.marketCapChange24h) < 1 ? "보합" :
      global.marketCapChange24h > 0 ? "상승" : "하락"
    })`
  );
  reasons.push(
    `BTC 도미넌스: ${global.btcDominance.toFixed(1)}% (${
      global.btcDominance > 60 ? "알트코인 약세" :
      global.btcDominance < 45 ? "알트코인 강세 (알트 시즌)" :
      "중립"
    })`
  );
  reasons.push(
    `OI 변화율: ${derivatives.oiChangeRate >= 0 ? "+" : ""}${derivatives.oiChangeRate.toFixed(2)}% (${
      derivatives.oiChangeRate > 3 ? "새 포지션 대량 유입 (strong)" :
      derivatives.oiChangeRate > 1.5 ? "포지션 유입 (weak)" :
      derivatives.oiChangeRate < -3 ? "포지션 청산 대량 (strong)" :
      derivatives.oiChangeRate < -1.5 ? "포지션 축소 (weak)" :
      "변동 미미 (노이즈 구간)"
    })`
  );
  reasons.push(
    `롱/숏 비율: ${ls.longRatio.toFixed(1)}% / ${ls.shortRatio.toFixed(1)}% (ratio ${ls.ratio.toFixed(2)}x — ${
      ls.ratio > 2.0 ? "롱 과열 (분산 임박 가능)" :
      ls.ratio < 1.0 ? "숏 우세 (드문 신호)" :
      "retail 평상치"
    })`
  );
  reasons.push(
    `펀딩비: ${derivatives.fundingRateAvg >= 0 ? "+" : ""}${derivatives.fundingRateAvg.toFixed(4)}% (${
      derivatives.fundingRateAvg > 0.02 ? "롱 강과열 (스퀘즈 위험)" :
      derivatives.fundingRateAvg > 0.01 ? "롱 과열" :
      derivatives.fundingRateAvg < -0.02 ? "숏 강과열" :
      derivatives.fundingRateAvg < -0.01 ? "숏 과열" :
      "중립 (노이즈)"
    })`
  );

  return {
    fearGreed: fng[0] ?? { value: 50, classification: "NEUTRAL", timestamp: Date.now() },
    fearGreedHistory: fng,
    globalMarket: global,
    compositeScore,
    compositeLabel,
    marketPhase: phase,
    marketPhaseKo: phaseKo,
    reasons,
    computedAt: new Date().toISOString(),
  };
}

function labelKo(c: FearGreedClass): string {
  switch (c) {
    case "EXTREME_FEAR": return "극도의 공포";
    case "FEAR": return "공포";
    case "NEUTRAL": return "중립";
    case "GREED": return "탐욕";
    case "EXTREME_GREED": return "극도의 탐욕";
  }
}
