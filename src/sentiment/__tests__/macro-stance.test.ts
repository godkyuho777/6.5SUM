/**
 * Macro Stance + symmetric confidence — v4.2 Audit 검증.
 *
 * 핵심 회귀 테스트:
 *   1. Confidence symmetric — bull 4/4 와 bear 4/4 가 동일 신뢰도
 *   2. Tie 처리 — bull 2 / bear 2 → confidence=0
 *   3. Macro Stance 5단계 분류
 *   4. 임계값 calibration — 1.5% OI 는 노이즈, 3% 는 strong
 */

import { describe, expect, it } from "vitest";
import { computeWaveMatrix } from "../wave-matrix";
import { deriveMacroStance } from "../macro-stance";
import type { BybitDerivativesData, BybitLongShortData } from "../types";

const baseDeriv: BybitDerivativesData = {
  symbol: "BTCUSDT",
  oiChangeRate: 0,
  fundingRateAvg: 0,
  priceChange24h: 0,
  lastPrice: 100000,
};

const baseLs: BybitLongShortData = {
  symbol: "BTCUSDT",
  longRatio: 60,
  shortRatio: 40,
  ratio: 1.5, // retail 평상치
};

describe("Wave Matrix v4.2 — Symmetric confidence (Audit P-2)", () => {
  it("bull 4/4 (compositeScore=80) 의 confidence 가 bear 4/4 (compositeScore=20) 와 동일", () => {
    // 4 bullish 신호. fearGreedValue=50 으로 OI 9-case neutral 예외(fearful+oiDown+priceDown) 회피.
    const bullDeriv: BybitDerivativesData = {
      ...baseDeriv,
      oiChangeRate: 5,
      fundingRateAvg: 0.025,
      priceChange24h: 3,
    };
    const bullLs: BybitLongShortData = {
      symbol: "BTCUSDT",
      longRatio: 70,
      shortRatio: 30,
      ratio: 2.5,
    };
    const bull = computeWaveMatrix(bullDeriv, bullLs, 80, 50, "HEATING");

    // 4 bearish 신호.
    const bearDeriv: BybitDerivativesData = {
      ...baseDeriv,
      oiChangeRate: -5,
      fundingRateAvg: -0.025,
      priceChange24h: -3,
    };
    const bearLs: BybitLongShortData = {
      symbol: "BTCUSDT",
      longRatio: 45,
      shortRatio: 55,
      ratio: 0.8,
    };
    // fearGreedValue=50 (neutral) 로 oiDown+priceDown+fearful 예외 회피 → bearish 4/4.
    const bear = computeWaveMatrix(bearDeriv, bearLs, 20, 50, "DISTRIBUTION");

    expect(bull.bullishCount).toBe(4);
    expect(bear.bearishCount).toBe(4);
    // 동일한 |compositeScore - 50| = 30 이므로 confidence 동일해야 함
    expect(bull.confidence).toBe(bear.confidence);
    expect(bull.confidence).toBeGreaterThan(0);
  });

  it("강한 bearish 4/4 일치 + composite=20 → confidence ≥55 (기존 비대칭 평가절하 제거)", () => {
    const bearDeriv: BybitDerivativesData = {
      ...baseDeriv,
      oiChangeRate: -5,
      fundingRateAvg: -0.025,
      priceChange24h: -3,
    };
    const bearLs: BybitLongShortData = {
      symbol: "BTCUSDT",
      longRatio: 45,
      shortRatio: 55,
      ratio: 0.8,
    };
    // fearGreedValue=50 으로 9-case 예외 회피
    const bear = computeWaveMatrix(bearDeriv, bearLs, 20, 50, "DISTRIBUTION");

    // 신규 공식: 4/4 divergence × signalStrength(|20-50|/50=0.6) = 60%
    expect(bear.confidence).toBeGreaterThanOrEqual(55);
    expect(bear.bearishCount).toBe(4);
    expect(bear.bullishCount).toBe(0);
  });
});

describe("Wave Matrix v4.2 — Tie handling (Audit P-3)", () => {
  it("bull 2 / bear 2 면 confidence=0 + isTie=true", () => {
    // 2 bull (sentiment + funding 양수) vs 2 bear (OI 강하락 + ls 약세).
    // priceChange24h=-2 로 oiDown && priceDown → bearish OI 시그널 확보.
    // fearGreedValue=50 으로 fearful 예외 회피.
    const tieDeriv: BybitDerivativesData = {
      ...baseDeriv,
      oiChangeRate: -5,        // bearish OI
      fundingRateAvg: 0.025,   // bullish funding
      priceChange24h: -2,
    };
    const tieLs: BybitLongShortData = {
      symbol: "BTCUSDT",
      longRatio: 45,
      shortRatio: 55,
      ratio: 0.8, // bearish
    };
    // composite=65 → bullish sentiment
    const result = computeWaveMatrix(tieDeriv, tieLs, 65, 50, "HEATING");

    expect(result.bullishCount).toBe(2);
    expect(result.bearishCount).toBe(2);
    expect(result.isTie).toBe(true);
    expect(result.confidence).toBe(0);
    expect(result.predictionKo).toContain("미정");
  });

  it("4-신호 모두 neutral → confidence=0", () => {
    // 모두 neutral 영역
    const neutralDeriv: BybitDerivativesData = {
      ...baseDeriv,
      oiChangeRate: 1, // <3
      fundingRateAvg: 0.005, // <0.01
      priceChange24h: 0.5,
    };
    const result = computeWaveMatrix(neutralDeriv, baseLs, 50, 50, "HEATING");
    expect(result.confidence).toBe(0);
    expect(result.bullishCount).toBe(0);
    expect(result.bearishCount).toBe(0);
  });
});

describe("Wave Matrix v4.2 — Threshold calibration (Audit P-4/5/6)", () => {
  it("OI 변화 1.5% (기존 임계값 ±2% 초과, 신규 ±3% 미달) → neutral", () => {
    const deriv: BybitDerivativesData = {
      ...baseDeriv,
      oiChangeRate: 1.5,
      priceChange24h: 1,
    };
    const result = computeWaveMatrix(deriv, baseLs, 50, 50, "HEATING");
    // OI 시그널은 oi.signal 인데 1.5% 는 oiFlat 영역 → neutral
    expect(result.oiSignal).toBe("neutral");
  });

  it("OI 변화 4% + 가격 +2% → bullish (strong)", () => {
    const deriv: BybitDerivativesData = {
      ...baseDeriv,
      oiChangeRate: 4,
      priceChange24h: 2,
    };
    const result = computeWaveMatrix(deriv, baseLs, 65, 60, "HEATING");
    expect(result.oiSignal).toBe("bullish");
  });

  it("Funding 0.008% (기존 임계값 0.005% 초과, 신규 0.01% 미달) → neutral", () => {
    const deriv: BybitDerivativesData = {
      ...baseDeriv,
      fundingRateAvg: 0.008,
    };
    const result = computeWaveMatrix(deriv, baseLs, 50, 50, "HEATING");
    expect(result.fundingSignal).toBe("neutral");
  });

  it("L/S Ratio 1.5 (retail 평상치) → neutral, 신규 임계값", () => {
    const ls: BybitLongShortData = {
      symbol: "BTCUSDT",
      longRatio: 60,
      shortRatio: 40,
      ratio: 1.5,
    };
    const result = computeWaveMatrix(baseDeriv, ls, 50, 50, "HEATING");
    expect(result.lsSignal).toBe("neutral");
  });

  it("L/S Ratio 2.5 → bullish (롱 과열)", () => {
    const ls: BybitLongShortData = {
      symbol: "BTCUSDT",
      longRatio: 71,
      shortRatio: 29,
      ratio: 2.5,
    };
    const result = computeWaveMatrix(baseDeriv, ls, 50, 50, "HEATING");
    expect(result.lsSignal).toBe("bullish");
  });
});

describe("Macro Stance — 5단계 분류 (Audit Phase B)", () => {
  it("DEFENSIVE — PANIC + composite ≤25 + bear + conf ≥75", () => {
    const r = deriveMacroStance(20, "bearish", 80, "PANIC");
    expect(r.stance).toBe("DEFENSIVE");
    expect(r.label).toContain("방어");
    expect(r.color).toBe("red");
  });

  it("RISK_ON — composite ≥65 + bull + conf ≥60", () => {
    const r = deriveMacroStance(70, "bullish", 70, "HEATING");
    expect(r.stance).toBe("RISK_ON");
    expect(r.color).toBe("green");
  });

  it("RISK_OFF — composite ≤35 + bear + conf ≥60 (PANIC 외)", () => {
    const r = deriveMacroStance(30, "bearish", 70, "DISTRIBUTION");
    expect(r.stance).toBe("RISK_OFF");
    expect(r.color).toBe("red");
  });

  it("NEUTRAL_BULL — bull + conf 40~60", () => {
    const r = deriveMacroStance(60, "bullish", 50, "HEATING");
    expect(r.stance).toBe("NEUTRAL_BULL");
    expect(r.color).toBe("cyan");
  });

  it("NEUTRAL_BEAR — bear + conf 40~60", () => {
    const r = deriveMacroStance(40, "bearish", 50, "DISTRIBUTION");
    expect(r.stance).toBe("NEUTRAL_BEAR");
    expect(r.color).toBe("orange");
  });

  it("NEUTRAL — bias=neutral 또는 conf < 40", () => {
    const r1 = deriveMacroStance(50, "neutral", 30, "HEATING");
    expect(r1.stance).toBe("NEUTRAL");
    expect(r1.color).toBe("yellow");

    const r2 = deriveMacroStance(50, "bullish", 20, "HEATING");
    // confidence 너무 낮으면 NEUTRAL_BULL 도 못 받음 (조건: conf >= 40 또는 score >= 55)
    // score=50 + conf=20 → fallback NEUTRAL
    expect(r2.stance).toBe("NEUTRAL");
  });

  it("DEFENSIVE 가 RISK_OFF 보다 우선 — PANIC + composite=20 + conf=80", () => {
    const r = deriveMacroStance(20, "bearish", 80, "PANIC");
    expect(r.stance).toBe("DEFENSIVE"); // not RISK_OFF
  });
});
