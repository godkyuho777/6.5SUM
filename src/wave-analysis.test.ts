import { describe, it, expect } from "vitest";

/**
 * Wave Analysis Algorithm Tests
 * btc-derivatives.ts의 analyzeWave 함수를 직접 테스트합니다.
 * 
 * 클라이언트 코드이지만 순수 함수이므로 서버 테스트에서 직접 로직을 복제하여 테스트합니다.
 */

// ── analyzeWave 로직 복제 (순수 함수) ──

interface OIDataPoint {
  timestamp: number;
  openInterest: number;
}

interface LongShortDataPoint {
  timestamp: number;
  buyRatio: number;
  sellRatio: number;
  lsRatio: number;
}

interface FundingRateDataPoint {
  timestamp: number;
  fundingRate: number;
}

interface BTCDerivativesSnapshot {
  price: number;
  markPrice: number;
  indexPrice: number;
  openInterest: number;
  openInterestValue: number;
  volume24h: number;
  turnover24h: number;
  fundingRate: number;
  nextFundingTime: number;
  highPrice24h: number;
  lowPrice24h: number;
  change24h: number;
}

interface WaveAnalysis {
  score: number;
  label: "SIDEWAYS" | "BUILDING" | "IMMINENT" | "WAVE_LIKELY";
  reasons: string[];
  oiTrend: "rising" | "falling" | "flat";
  longPressure: number;
  shortPressure: number;
  dominantLiqSide: "long" | "short" | "balanced";
  oiChangeRate: number;
  fundingBias: "long_heavy" | "short_heavy" | "neutral";
}

function analyzeWave(
  oiHistory: OIDataPoint[],
  lsHistory: LongShortDataPoint[],
  fundingHistory: FundingRateDataPoint[],
  snapshot: BTCDerivativesSnapshot | null
): WaveAnalysis {
  const reasons: string[] = [];
  let score = 0;

  let oiChangeRate = 0;
  let oiTrend: "rising" | "falling" | "flat" = "flat";

  if (oiHistory.length >= 48) {
    const recent24h = oiHistory.slice(-24);
    const prev24h = oiHistory.slice(-48, -24);
    const recentAvg = recent24h.reduce((s, d) => s + d.openInterest, 0) / recent24h.length;
    const prevAvg = prev24h.reduce((s, d) => s + d.openInterest, 0) / prev24h.length;
    oiChangeRate = ((recentAvg - prevAvg) / prevAvg) * 100;

    if (oiChangeRate > 3) {
      oiTrend = "rising";
      score += Math.min(30, oiChangeRate * 5);
      reasons.push(`OI 24h 변화율 +${oiChangeRate.toFixed(1)}% → 새로운 포지션 대량 유입`);
    } else if (oiChangeRate > 1) {
      oiTrend = "rising";
      score += 10;
      reasons.push(`OI 소폭 증가 +${oiChangeRate.toFixed(1)}%`);
    } else if (oiChangeRate < -3) {
      oiTrend = "falling";
      score += 15;
      reasons.push(`OI 24h 변화율 ${oiChangeRate.toFixed(1)}% → 포지션 대량 청산/정리`);
    } else {
      oiTrend = "flat";
      reasons.push(`OI 변화 미미 (${oiChangeRate.toFixed(1)}%) → 관망세`);
    }
  } else if (oiHistory.length >= 2) {
    const first = oiHistory[0].openInterest;
    const last = oiHistory[oiHistory.length - 1].openInterest;
    oiChangeRate = ((last - first) / first) * 100;
    oiTrend = oiChangeRate > 1 ? "rising" : oiChangeRate < -1 ? "falling" : "flat";
  }

  if (snapshot) {
    const oiValueBillions = snapshot.openInterestValue / 1e9;
    if (oiValueBillions > 5) {
      score += 15;
      reasons.push(`OI 규모 $${oiValueBillions.toFixed(1)}B → 대규모 미결제약정 축적`);
    } else if (oiValueBillions > 3) {
      score += 8;
      reasons.push(`OI 규모 $${oiValueBillions.toFixed(1)}B → 중간 수준`);
    }
  }

  let longPressure = 50;
  let shortPressure = 50;
  let dominantLiqSide: "long" | "short" | "balanced" = "balanced";

  if (lsHistory.length >= 5) {
    const recentLS = lsHistory.slice(-5);
    const avgBuyRatio = recentLS.reduce((s, d) => s + d.buyRatio, 0) / recentLS.length;
    const avgSellRatio = recentLS.reduce((s, d) => s + d.sellRatio, 0) / recentLS.length;

    longPressure = Math.round(avgBuyRatio * 100);
    shortPressure = Math.round(avgSellRatio * 100);

    if (avgBuyRatio > 0.55) {
      dominantLiqSide = "long";
      score += 15;
      reasons.push(`롱 비율 ${(avgBuyRatio * 100).toFixed(1)}% → 롱 과밀, 하방 청산 압력 높음`);
    } else if (avgSellRatio > 0.55) {
      dominantLiqSide = "short";
      score += 15;
      reasons.push(`숏 비율 ${(avgSellRatio * 100).toFixed(1)}% → 숏 과밀, 상방 청산 압력 높음`);
    } else {
      dominantLiqSide = "balanced";
      reasons.push(`롱/숏 비율 균형 (${(avgBuyRatio * 100).toFixed(1)}% / ${(avgSellRatio * 100).toFixed(1)}%)`);
    }

    if (lsHistory.length >= 24) {
      const oldLS = lsHistory.slice(-24, -12);
      const newLS = lsHistory.slice(-12);
      const oldAvgBuy = oldLS.reduce((s, d) => s + d.buyRatio, 0) / oldLS.length;
      const newAvgBuy = newLS.reduce((s, d) => s + d.buyRatio, 0) / newLS.length;
      const lsShift = (newAvgBuy - oldAvgBuy) * 100;

      if (Math.abs(lsShift) > 2) {
        score += 10;
        reasons.push(
          lsShift > 0
            ? `롱 비율 급증 추세 (+${lsShift.toFixed(1)}%p) → 편향 심화`
            : `숏 비율 급증 추세 (+${(-lsShift).toFixed(1)}%p) → 편향 심화`
        );
      }
    }
  }

  let fundingBias: "long_heavy" | "short_heavy" | "neutral" = "neutral";

  if (fundingHistory.length >= 3) {
    const recentFunding = fundingHistory.slice(-3);
    const avgFunding = recentFunding.reduce((s, d) => s + d.fundingRate, 0) / recentFunding.length;

    if (avgFunding > 0.0003) {
      fundingBias = "long_heavy";
      score += 15;
      reasons.push(`펀딩비 높음 (${(avgFunding * 100).toFixed(4)}%) → 롱 과열, 하방 청산 리스크`);
    } else if (avgFunding > 0.0001) {
      fundingBias = "long_heavy";
      score += 5;
      reasons.push(`펀딩비 양수 (${(avgFunding * 100).toFixed(4)}%) → 롱 우세`);
    } else if (avgFunding < -0.0003) {
      fundingBias = "short_heavy";
      score += 15;
      reasons.push(`펀딩비 음수 (${(avgFunding * 100).toFixed(4)}%) → 숏 과열, 상방 청산 리스크`);
    } else if (avgFunding < -0.0001) {
      fundingBias = "short_heavy";
      score += 5;
      reasons.push(`펀딩비 음수 (${(avgFunding * 100).toFixed(4)}%) → 숏 우세`);
    } else {
      fundingBias = "neutral";
      reasons.push(`펀딩비 중립 (${(avgFunding * 100).toFixed(4)}%)`);
    }

    if (fundingHistory.length >= 6) {
      const oldFunding = fundingHistory.slice(-6, -3);
      const newFunding = fundingHistory.slice(-3);
      const oldAvg = oldFunding.reduce((s, d) => s + d.fundingRate, 0) / oldFunding.length;
      const newAvg = newFunding.reduce((s, d) => s + d.fundingRate, 0) / newFunding.length;

      if (Math.abs(newAvg - oldAvg) > 0.0002) {
        score += 10;
        reasons.push(`펀딩비 급변 → 시장 심리 급격한 변화`);
      }
    }
  }

  if (oiTrend === "rising" && dominantLiqSide !== "balanced") {
    score += 10;
    reasons.push(`OI 증가 + ${dominantLiqSide === "long" ? "롱" : "숏"} 편향 → 청산 캐스케이드 가능성`);
  }

  if (oiTrend === "rising" && fundingBias !== "neutral") {
    score += 5;
    reasons.push(`OI 증가 + 펀딩비 편향 → 에너지 축적 중`);
  }

  score = Math.min(100, Math.max(0, Math.round(score)));

  let label: WaveAnalysis["label"];
  if (score >= 75) {
    label = "WAVE_LIKELY";
  } else if (score >= 50) {
    label = "IMMINENT";
  } else if (score >= 25) {
    label = "BUILDING";
  } else {
    label = "SIDEWAYS";
  }

  return {
    score,
    label,
    reasons,
    oiTrend,
    longPressure,
    shortPressure,
    dominantLiqSide,
    oiChangeRate,
    fundingBias,
  };
}

// ── Helpers ──

function makeOI(count: number, baseOI: number, trend: "up" | "down" | "flat" = "flat"): OIDataPoint[] {
  const arr: OIDataPoint[] = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    let oi = baseOI;
    if (trend === "up") oi = baseOI + (i / count) * baseOI * 0.1;
    if (trend === "down") oi = baseOI - (i / count) * baseOI * 0.1;
    arr.push({ timestamp: now - (count - i) * 3600000, openInterest: oi });
  }
  return arr;
}

function makeLS(count: number, buyRatio: number): LongShortDataPoint[] {
  const arr: LongShortDataPoint[] = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const sell = 1 - buyRatio;
    arr.push({
      timestamp: now - (count - i) * 3600000,
      buyRatio,
      sellRatio: sell,
      lsRatio: sell > 0 ? buyRatio / sell : 1,
    });
  }
  return arr;
}

function makeFunding(count: number, rate: number): FundingRateDataPoint[] {
  const arr: FundingRateDataPoint[] = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    arr.push({ timestamp: now - (count - i) * 28800000, fundingRate: rate });
  }
  return arr;
}

function makeSnapshot(overrides: Partial<BTCDerivativesSnapshot> = {}): BTCDerivativesSnapshot {
  return {
    price: 70000,
    markPrice: 70000,
    indexPrice: 70000,
    openInterest: 50000,
    openInterestValue: 3500000000,
    volume24h: 100000,
    turnover24h: 7000000000,
    fundingRate: 0.0001,
    nextFundingTime: Date.now() + 28800000,
    highPrice24h: 72000,
    lowPrice24h: 68000,
    change24h: 2.5,
    ...overrides,
  };
}

// ── Tests ──

describe("Wave Analysis Algorithm", () => {
  describe("Score Labels", () => {
    it("returns SIDEWAYS for low score (empty/minimal data)", () => {
      const result = analyzeWave([], [], [], null);
      expect(result.score).toBe(0);
      expect(result.label).toBe("SIDEWAYS");
      expect(result.oiTrend).toBe("flat");
      expect(result.dominantLiqSide).toBe("balanced");
    });

    it("returns BUILDING or higher for moderate conditions", () => {
      // OI slightly rising
      const oi: OIDataPoint[] = [];
      const now = Date.now();
      for (let i = 0; i < 48; i++) {
        const val = i < 24 ? 50000 : 51500; // +3% rise
        oi.push({ timestamp: now - (48 - i) * 3600000, openInterest: val });
      }
      const ls = makeLS(5, 0.56); // Long dominant
      const funding = makeFunding(3, 0.00015);
      const snapshot = makeSnapshot({ openInterestValue: 4000000000 });

      const result = analyzeWave(oi, ls, funding, snapshot);
      expect(result.score).toBeGreaterThanOrEqual(25);
      expect(["BUILDING", "IMMINENT", "WAVE_LIKELY"]).toContain(result.label);
    });
  });

  describe("OI Trend Detection", () => {
    it("detects rising OI trend when OI increases significantly", () => {
      // Create OI data where recent 24h avg is much higher than prev 24h avg
      const arr: OIDataPoint[] = [];
      const now = Date.now();
      for (let i = 0; i < 48; i++) {
        const oi = i < 24 ? 50000 : 53000; // +6% jump
        arr.push({ timestamp: now - (48 - i) * 3600000, openInterest: oi });
      }
      const result = analyzeWave(arr, [], [], null);
      expect(result.oiTrend).toBe("rising");
      expect(result.oiChangeRate).toBeGreaterThan(3);
    });

    it("detects falling OI trend", () => {
      const arr: OIDataPoint[] = [];
      const now = Date.now();
      for (let i = 0; i < 48; i++) {
        const oi = i < 24 ? 53000 : 50000; // -5.7% drop
        arr.push({ timestamp: now - (48 - i) * 3600000, openInterest: oi });
      }
      const result = analyzeWave(arr, [], [], null);
      expect(result.oiTrend).toBe("falling");
      expect(result.oiChangeRate).toBeLessThan(-3);
    });

    it("detects flat OI trend", () => {
      const oi = makeOI(48, 50000, "flat");
      const result = analyzeWave(oi, [], [], null);
      expect(result.oiTrend).toBe("flat");
    });

    it("handles sparse OI data (< 48 but >= 2)", () => {
      const oi: OIDataPoint[] = [
        { timestamp: Date.now() - 7200000, openInterest: 50000 },
        { timestamp: Date.now(), openInterest: 51000 },
      ];
      const result = analyzeWave(oi, [], [], null);
      expect(result.oiChangeRate).toBeCloseTo(2, 0);
      expect(result.oiTrend).toBe("rising");
    });
  });

  describe("Long/Short Ratio Analysis", () => {
    it("detects long-heavy market (buy ratio > 55%)", () => {
      const ls = makeLS(5, 0.58);
      const result = analyzeWave([], ls, [], null);
      expect(result.dominantLiqSide).toBe("long");
      expect(result.longPressure).toBe(58);
      expect(result.shortPressure).toBe(42);
    });

    it("detects short-heavy market (sell ratio > 55%)", () => {
      const ls = makeLS(5, 0.42); // buyRatio=0.42, sellRatio=0.58
      const result = analyzeWave([], ls, [], null);
      expect(result.dominantLiqSide).toBe("short");
    });

    it("detects balanced market", () => {
      const ls = makeLS(5, 0.51);
      const result = analyzeWave([], ls, [], null);
      expect(result.dominantLiqSide).toBe("balanced");
    });

    it("handles insufficient LS data (< 5 points)", () => {
      const ls = makeLS(3, 0.6);
      const result = analyzeWave([], ls, [], null);
      // Should not crash, defaults to balanced
      expect(result.dominantLiqSide).toBe("balanced");
      expect(result.longPressure).toBe(50);
    });
  });

  describe("Funding Rate Analysis", () => {
    it("detects long_heavy funding bias (high positive rate)", () => {
      const funding = makeFunding(3, 0.0005);
      const result = analyzeWave([], [], funding, null);
      expect(result.fundingBias).toBe("long_heavy");
    });

    it("detects short_heavy funding bias (negative rate)", () => {
      const funding = makeFunding(3, -0.0005);
      const result = analyzeWave([], [], funding, null);
      expect(result.fundingBias).toBe("short_heavy");
    });

    it("detects neutral funding", () => {
      const funding = makeFunding(3, 0.00005);
      const result = analyzeWave([], [], funding, null);
      expect(result.fundingBias).toBe("neutral");
    });

    it("detects funding rate rapid change", () => {
      const funding: FundingRateDataPoint[] = [];
      const now = Date.now();
      // Old 3: low funding
      for (let i = 0; i < 3; i++) {
        funding.push({ timestamp: now - (6 - i) * 28800000, fundingRate: 0.0001 });
      }
      // New 3: high funding (jump of 0.0004)
      for (let i = 0; i < 3; i++) {
        funding.push({ timestamp: now - (3 - i) * 28800000, fundingRate: 0.0005 });
      }
      const result = analyzeWave([], [], funding, null);
      expect(result.reasons.some((r) => r.includes("펀딩비 급변"))).toBe(true);
    });
  });

  describe("Snapshot OI Value Analysis", () => {
    it("adds score for large OI value (> $5B)", () => {
      const snapshot = makeSnapshot({ openInterestValue: 6000000000 });
      const result = analyzeWave([], [], [], snapshot);
      expect(result.score).toBeGreaterThanOrEqual(15);
      expect(result.reasons.some((r) => r.includes("대규모 미결제약정"))).toBe(true);
    });

    it("adds moderate score for medium OI value ($3B-$5B)", () => {
      const snapshot = makeSnapshot({ openInterestValue: 4000000000 });
      const result = analyzeWave([], [], [], snapshot);
      expect(result.score).toBeGreaterThanOrEqual(8);
      expect(result.reasons.some((r) => r.includes("중간 수준"))).toBe(true);
    });

    it("adds no score for low OI value (< $3B)", () => {
      const snapshot = makeSnapshot({ openInterestValue: 2000000000 });
      const result = analyzeWave([], [], [], snapshot);
      expect(result.score).toBe(0);
    });
  });

  describe("Composite Conditions", () => {
    it("gives high score for OI rising + long heavy + high funding", () => {
      // OI rising sharply
      const oi: OIDataPoint[] = [];
      const now = Date.now();
      for (let i = 0; i < 48; i++) {
        const val = i < 24 ? 50000 : 55000; // +10%
        oi.push({ timestamp: now - (48 - i) * 3600000, openInterest: val });
      }

      // Long heavy
      const ls = makeLS(24, 0.58);

      // High funding
      const funding = makeFunding(6, 0.0005);

      // Large OI
      const snapshot = makeSnapshot({ openInterestValue: 6000000000 });

      const result = analyzeWave(oi, ls, funding, snapshot);
      expect(result.score).toBeGreaterThanOrEqual(75);
      expect(result.label).toBe("WAVE_LIKELY");
      expect(result.oiTrend).toBe("rising");
      expect(result.dominantLiqSide).toBe("long");
      expect(result.fundingBias).toBe("long_heavy");
    });

    it("gives low score for flat OI + balanced LS + neutral funding", () => {
      const oi = makeOI(48, 50000, "flat");
      const ls = makeLS(24, 0.50);
      const funding = makeFunding(6, 0.00005);
      const snapshot = makeSnapshot({ openInterestValue: 2000000000 });

      const result = analyzeWave(oi, ls, funding, snapshot);
      expect(result.score).toBeLessThan(25);
      expect(result.label).toBe("SIDEWAYS");
    });

    it("score is always capped at 100", () => {
      // Extreme conditions
      const oi: OIDataPoint[] = [];
      const now = Date.now();
      for (let i = 0; i < 48; i++) {
        const val = i < 24 ? 40000 : 60000; // +50%
        oi.push({ timestamp: now - (48 - i) * 3600000, openInterest: val });
      }
      const ls = makeLS(24, 0.65);
      const funding: FundingRateDataPoint[] = [];
      for (let i = 0; i < 3; i++) {
        funding.push({ timestamp: now - (6 - i) * 28800000, fundingRate: 0.0001 });
      }
      for (let i = 0; i < 3; i++) {
        funding.push({ timestamp: now - (3 - i) * 28800000, fundingRate: 0.001 });
      }
      const snapshot = makeSnapshot({ openInterestValue: 10000000000 });

      const result = analyzeWave(oi, ls, funding, snapshot);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it("score is always >= 0", () => {
      const result = analyzeWave([], [], [], null);
      expect(result.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Edge Cases", () => {
    it("handles all empty arrays gracefully", () => {
      const result = analyzeWave([], [], [], null);
      expect(result).toBeDefined();
      expect(result.score).toBe(0);
      expect(result.reasons).toHaveLength(0);
    });

    it("handles null snapshot gracefully", () => {
      const oi = makeOI(48, 50000, "up");
      const result = analyzeWave(oi, [], [], null);
      expect(result).toBeDefined();
      expect(result.oiTrend).toBe("rising");
    });

    it("handles single OI data point", () => {
      const oi = [{ timestamp: Date.now(), openInterest: 50000 }];
      const result = analyzeWave(oi, [], [], null);
      expect(result.oiTrend).toBe("flat");
      expect(result.oiChangeRate).toBe(0);
    });
  });
});
