import { describe, expect, test } from "vitest";

import {
  computeRiskScore,
  computeMarketRisk,
  linMap,
  classifyBand,
  RISK_WEIGHTS,
} from "../score";

describe("linMap — clamped linear map to 0-100", () => {
  test("below x0 → 0, above x1 → 100, midpoint → 50", () => {
    expect(linMap(0, 1.5, 12)).toBe(0);
    expect(linMap(20, 1.5, 12)).toBe(100);
    expect(linMap(50, 0, 100)).toBeCloseTo(50, 6);
  });

  test("x0 == x1 → 0 (no division by zero)", () => {
    expect(linMap(5, 5, 5)).toBe(0);
  });
});

describe("classifyBand — Risk v1 boundaries (<25 / <50 / <75 / else)", () => {
  test("each band boundary", () => {
    expect(classifyBand(0)).toBe("low");
    expect(classifyBand(24)).toBe("low");
    expect(classifyBand(25)).toBe("moderate"); // 25 is NOT low
    expect(classifyBand(49)).toBe("moderate");
    expect(classifyBand(50)).toBe("high"); // 50 is NOT moderate
    expect(classifyBand(74)).toBe("high");
    expect(classifyBand(75)).toBe("extreme"); // 75 is NOT high
    expect(classifyBand(100)).toBe("extreme");
  });
});

describe("computeRiskScore — empty / sparse inputs", () => {
  test("empty inputs → score 0, low band, coverage 0, no dims", () => {
    const r = computeRiskScore("BTCUSDT", {});
    expect(r.score).toBe(0);
    expect(r.band).toBe("low");
    expect(r.coverage).toBe(0);
    expect(r.includedDimensions).toEqual([]);
    expect(r.breakdown.volatility).toBeNull();
    expect(r.breakdown.liquidity).toBeNull();
    expect(r.breakdown.leverage).toBeNull();
    expect(r.breakdown.trend).toBeNull();
    expect(r.breakdown.regime).toBeNull();
    expect(r.symbol).toBe("BTCUSDT");
    expect(typeof r.asOf).toBe("string");
  });

  test("coverage reflects only the dimensions whose inputs are present", () => {
    // only volatility input → 1 of 5 dims.
    const r = computeRiskScore("BTCUSDT", { atrPct: 5 });
    expect(r.includedDimensions).toEqual(["volatility"]);
    expect(r.coverage).toBeCloseTo(1 / 5, 6);
    expect(r.breakdown.volatility).not.toBeNull();
    expect(r.breakdown.liquidity).toBeNull();
  });

  test("single-dimension score == that dimension's value (renormalized weight = 1)", () => {
    // atrPct 6.75 = midpoint of [1.5, 12] → volatility 50. Only dim → score 50.
    const r = computeRiskScore("BTCUSDT", { atrPct: 6.75 });
    expect(r.breakdown.volatility).toBeCloseTo(50, 4);
    expect(r.score).toBe(50);
    expect(r.band).toBe("high"); // 50 → high (boundary)
  });
});

describe("computeRiskScore — per-dimension formulas", () => {
  test("volatility — atrPct 1.5 → 0, 12 → 100", () => {
    expect(computeRiskScore("X", { atrPct: 1.5 }).breakdown.volatility).toBeCloseTo(0, 4);
    expect(computeRiskScore("X", { atrPct: 12 }).breakdown.volatility).toBeCloseTo(100, 4);
  });

  test("liquidity — only volume present uses volume sub-part alone", () => {
    // log10(1e6)=6 → riskVol = 100 - 0 = 100.
    const r = computeRiskScore("X", { volumeUsd: 1e6 });
    expect(r.breakdown.liquidity).toBeCloseTo(100, 4);
    expect(r.includedDimensions).toEqual(["liquidity"]);
  });

  test("liquidity — only market cap present uses mcap sub-part alone", () => {
    // log10(1e10)=10 → riskMcap = 100 - 100 = 0.
    const r = computeRiskScore("X", { marketCapUsd: 1e10 });
    expect(r.breakdown.liquidity).toBeCloseTo(0, 4);
  });

  test("trend — drawdown contributes ×0.7 and falling knife adds +30", () => {
    // drawdown 45 → linMap=100 ×0.7 = 70; +30 knife = 100 (clamped).
    const withKnife = computeRiskScore("X", { drawdownFromHigh30: 45, fallingKnife: true });
    expect(withKnife.breakdown.trend).toBeCloseTo(100, 4);
    const noKnife = computeRiskScore("X", { drawdownFromHigh30: 45, fallingKnife: false });
    expect(noKnife.breakdown.trend).toBeCloseTo(70, 4);
  });

  test("regime — greed side and fear side both raise risk; macro maps by label", () => {
    // greed 95 → fgRisk 100; macro absent → regime 100.
    const greed = computeRiskScore("X", { fearGreed: 95 });
    expect(greed.breakdown.regime).toBeCloseTo(100, 4);
    // crisis macro alone → 90.
    const crisis = computeRiskScore("X", { macroRegime: "crisis" });
    expect(crisis.breakdown.regime).toBeCloseTo(90, 4);
    // unknown label → default 40.
    const unknown = computeRiskScore("X", { macroRegime: "wat" });
    expect(unknown.breakdown.regime).toBeCloseTo(40, 4);
  });
});

describe("computeRiskScore — renormalization when leverage absent", () => {
  test("4-dim (no leverage) renormalizes weights over present dims", () => {
    // All four non-leverage dims = 80 each. Renormalized weighted mean of
    // identical values is the value itself → score 80.
    //   volatility 80: linMap(atrPct,1.5,12)=80 → atrPct = 1.5 + 0.8*10.5 = 9.9
    //   trend 80 (no knife): linMap(dd,3,45)*0.7=80 → impossible (max 70).
    //     so use knife: linMap(dd,3,45)*0.7 + 30 = 80 → linMap=71.43 → dd≈33.0
    //   regime 80: macro? no exact 80 label. use fear/greed: greed linMap(fg,50,95)=80
    //     → fg = 50 + 0.8*45 = 86
    //   liquidity 80: pick volume so riskVol=80 → linMap(log10v,6,9.3)=20 →
    //     log10v = 6 + 0.2*3.3 = 6.66 → v = 10^6.66
    const r = computeRiskScore("ALT", {
      atrPct: 9.9,
      volumeUsd: 10 ** 6.66,
      drawdownFromHigh30: 33.0,
      fallingKnife: true,
      fearGreed: 86,
    });
    expect(r.includedDimensions).toEqual([
      "volatility",
      "liquidity",
      "trend",
      "regime",
    ]);
    expect(r.breakdown.leverage).toBeNull();
    // each dim ≈ 80 → score ≈ 80 regardless of weight split.
    expect(r.score).toBeGreaterThanOrEqual(79);
    expect(r.score).toBeLessThanOrEqual(81);
    expect(r.band).toBe("extreme");
  });

  test("leverage present (funding/ls/oi) is renormalized over present sub-parts", () => {
    // funding only: |0.0015| → 100. ls/oi absent → leverage = 100.
    const r = computeRiskScore("X", { fundingRate: 0.0015 });
    expect(r.breakdown.leverage).toBeCloseTo(100, 4);
    expect(r.includedDimensions).toEqual(["leverage"]);
  });

  test("leverage long/short ratio uses |ln(ratio)|", () => {
    // ratio 1 → ln=0 → risk 0.
    expect(computeRiskScore("X", { longShortRatio: 1 }).breakdown.leverage).toBeCloseTo(0, 4);
    // |ln(ratio)| 1.1 → risk 100. ratio = e^1.1 ≈ 3.004.
    const hot = computeRiskScore("X", { longShortRatio: Math.exp(1.1) });
    expect(hot.breakdown.leverage).toBeCloseTo(100, 3);
  });
});

describe("computeRiskScore — worked example (high-risk small alt)", () => {
  test("realistic small-alt inputs → high or extreme band with notes", () => {
    const r = computeRiskScore("VIRTUALUSDT", {
      atrPct: 11,
      volumeUsd: 8e6,
      marketCapUsd: 6e7,
      drawdownFromHigh30: 32,
      fallingKnife: true,
      fearGreed: 82,
      macroRegime: "tight",
    });
    // leverage skipped, other 4 present.
    expect(r.includedDimensions).toEqual([
      "volatility",
      "liquidity",
      "trend",
      "regime",
    ]);
    expect(["high", "extreme"]).toContain(r.band);
    expect(r.score).toBeGreaterThanOrEqual(75); // computed ≈ 81
    expect(r.coverage).toBeCloseTo(4 / 5, 6);
    // notes surface the high dimensions in Korean.
    expect(r.notes.length).toBeGreaterThan(0);
    expect(r.notes.some((n) => n.includes("저유동성"))).toBe(true);
    expect(r.notes.some((n) => n.includes("30일 고점"))).toBe(true);
  });
});

describe("RISK_WEIGHTS — charter sanity", () => {
  test("weights sum to 1.0", () => {
    const sum =
      RISK_WEIGHTS.volatility +
      RISK_WEIGHTS.liquidity +
      RISK_WEIGHTS.leverage +
      RISK_WEIGHTS.trend +
      RISK_WEIGHTS.regime;
    expect(sum).toBeCloseTo(1.0, 6);
  });
});

describe("computeMarketRisk — systemic risk", () => {
  test("fear & greed + macro combine to regime risk", () => {
    // greed 82 → fgRisk 71.11; tight macro → 65; 0.5/0.5 → 68.06 → round 68 → high.
    const r = computeMarketRisk({
      fearGreed: 82,
      fearGreedLabel: "탐욕",
      macroRegime: "tight",
    });
    expect(r.score).toBe(68);
    expect(r.band).toBe("high");
    expect(r.fearGreed).toBe(82);
    expect(r.fearGreedLabel).toBe("탐욕");
    expect(r.macroRegime).toBe("tight");
    expect(r.components.fgRisk).toBe(71); // round(71.11)
    expect(r.components.macroRisk).toBe(65);
  });

  test("empty inputs → score 0, low band, empty label", () => {
    const r = computeMarketRisk({});
    expect(r.score).toBe(0);
    expect(r.band).toBe("low");
    expect(r.fearGreed).toBe(0);
    expect(r.fearGreedLabel).toBe("");
    expect(r.macroRegime).toBe("");
  });

  test("only fear & greed present uses fg risk alone", () => {
    // extreme greed 95 → 100 → extreme.
    const r = computeMarketRisk({ fearGreed: 95 });
    expect(r.score).toBe(100);
    expect(r.band).toBe("extreme");
  });
});
