/**
 * Composite Sentiment Score
 *
 * 명세서 §3 그대로:
 *   시작점 50 (중립)
 *   + Fear & Greed Index    (가중치 40%) — (F&G - 50) × 0.4
 *   + 글로벌 시장 데이터    (가중치 20%) — 시총변화율 × 1.5
 *   + OI 변화율             (가중치 15%) — OI변화율 × 1.0
 *   + Long/Short + Funding  (가중치 25%) — ±5 + ±3
 *   = Composite Score (clamp 0~100)
 *
 * 시장 단계 (§6):
 *   sentiment<40 + OI>+1%  → ACCUMULATION
 *   sentiment>60 + OI>+1%  → HEATING
 *   sentiment>60 + OI<-1%  → DISTRIBUTION
 *   sentiment<40 + OI<-1%  → PANIC
 *   그 외                   → HEATING (기본)
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
  const fearful = sentimentScore < 40;
  const greedy = sentimentScore > 60;
  const oiUp = oiChangeRate > 1;
  const oiDown = oiChangeRate < -1;
  if (fearful && oiUp) return { phase: "ACCUMULATION", phaseKo: "축적" };
  if (greedy && oiUp) return { phase: "HEATING", phaseKo: "가열" };
  if (greedy && oiDown) return { phase: "DISTRIBUTION", phaseKo: "분산" };
  if (fearful && oiDown) return { phase: "PANIC", phaseKo: "공포" };
  return { phase: "HEATING", phaseKo: "가열" };
}

export function computeComposite(
  fng: FearGreedPoint[],
  global: GlobalMarketData,
  derivatives: BybitDerivativesData,
  ls: BybitLongShortData
): SentimentSnapshot {
  let score = 50; // 시작점

  // 1. Fear & Greed (40%)
  const currentFng = fng[0]?.value ?? 50;
  const fngContribution = (currentFng - 50) * 0.4;
  score += fngContribution;

  // F&G 7일 추세 (변화>10pt 시 ±2)
  const old = fng[Math.min(7, fng.length - 1)]?.value ?? currentFng;
  const fngDelta7d = currentFng - old;
  if (fngDelta7d > 10) score += 2;
  else if (fngDelta7d < -10) score -= 2;

  // 2. 글로벌 시장 (20%)
  const mcContribution = global.marketCapChange24h * 1.5;
  score += mcContribution;
  if (global.btcDominance > 60) score -= 1.5;
  else if (global.btcDominance < 45) score += 1.5;

  // 3. OI 변화율 (15%)
  score += derivatives.oiChangeRate * 1.0;

  // 4. Long/Short + Funding (25%)
  const longHeavy = ls.ratio > 1.1;
  const shortHeavy = ls.ratio < 0.9;
  if (longHeavy) score += 5;
  else if (shortHeavy) score -= 5;
  if (derivatives.fundingRateAvg > 0.005) score += 3; // 펀딩 양수 (롱 과열)
  else if (derivatives.fundingRateAvg < -0.005) score -= 3; // 펀딩 음수 (숏 과열)

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
      derivatives.oiChangeRate > 2 ? "새 포지션 대량 유입" :
      derivatives.oiChangeRate < -2 ? "포지션 청산 진행" :
      "변동 미미"
    })`
  );
  reasons.push(
    `롱/숏 비율: ${ls.longRatio.toFixed(1)}% / ${ls.shortRatio.toFixed(1)}% (${
      longHeavy ? "롱 우세" : shortHeavy ? "숏 우세" : "중립"
    })`
  );
  reasons.push(
    `펀딩비: ${derivatives.fundingRateAvg >= 0 ? "+" : ""}${derivatives.fundingRateAvg.toFixed(4)}% (${
      derivatives.fundingRateAvg > 0.005 ? "롱 과열" :
      derivatives.fundingRateAvg < -0.005 ? "숏 과열" :
      "중립"
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
