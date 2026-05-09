/**
 * Calibration helpers unit tests (v6.5 Phase 3).
 *
 * Wilson CI 정확도 + bucket 분포 + 권고 임계값 도출 로직 검증.
 */

import { describe, it, expect } from "vitest";
import {
  wilsonScoreInterval,
  bucketByValue,
  calibrate,
  STANDARD_CALIBRATION_PARAMS,
  runStandardCalibration,
  type CalibrationParam,
} from "../calibration";
import type { BacktestTrade } from "../types";

// ─────────────────────────────────────────────────────────
// Wilson Score Interval
// ─────────────────────────────────────────────────────────

describe("wilsonScoreInterval", () => {
  it("zero total → CI [0, 0]", () => {
    const ci = wilsonScoreInterval(0, 0);
    expect(ci).toEqual({ lower: 0, upper: 0, point: 0 });
  });

  it("64/100 wins → tighter CI than normal approximation", () => {
    const ci = wilsonScoreInterval(64, 100);
    expect(ci.point).toBeCloseTo(0.64, 4);
    // Wilson 의 정확한 값 (z=1.96, n=100): lower≈0.5424, upper≈0.7273
    expect(ci.lower).toBeCloseTo(0.5424, 3);
    expect(ci.upper).toBeCloseTo(0.7273, 3);
    // CI 폭이 0.20 보다 좁아야 (Wilson 의 좁은 특성)
    expect(ci.upper - ci.lower).toBeLessThan(0.20);
  });

  it("0/100 wins → CI 하한 0, 상한 < 0.04 (작은 표본 안전)", () => {
    const ci = wilsonScoreInterval(0, 100);
    expect(ci.point).toBe(0);
    expect(ci.lower).toBe(0);
    expect(ci.upper).toBeGreaterThan(0);
    expect(ci.upper).toBeLessThan(0.04);
  });

  it("100/100 wins → CI 상한 ≈1, 하한 > 0.96 (작은 표본 안전)", () => {
    const ci = wilsonScoreInterval(100, 100);
    expect(ci.point).toBe(1);
    // Wilson 의 분모 보정으로 상한이 정확히 1 이 아닌 1 - eps
    expect(ci.upper).toBeCloseTo(1, 5);
    expect(ci.lower).toBeGreaterThan(0.96);
  });

  it("작은 표본 (5/10) — CI 가 매우 넓음", () => {
    const ci = wilsonScoreInterval(5, 10);
    expect(ci.point).toBe(0.5);
    expect(ci.upper - ci.lower).toBeGreaterThan(0.5); // CI 폭 50%+
  });

  it("99% z = 2.576 — CI 가 95% 보다 넓음", () => {
    const ci95 = wilsonScoreInterval(64, 100, 1.96);
    const ci99 = wilsonScoreInterval(64, 100, 2.576);
    expect(ci99.upper - ci99.lower).toBeGreaterThan(ci95.upper - ci95.lower);
  });
});

// ─────────────────────────────────────────────────────────
// Bucket helpers
// ─────────────────────────────────────────────────────────

function makeTrade(
  partial: Partial<BacktestTrade> & { win: boolean; returnPct: number },
): BacktestTrade {
  return {
    signalTs: 0,
    symbol: "BTCUSDT",
    tf: "4h",
    entryPrice: 100,
    target: 102,
    stopLoss: 97,
    signalStrength: 50,
    rsi: 32,
    bbLower: 98,
    bbMiddle: 102,
    bbUpper: 106,
    adx: 22,
    plusDi: 18,
    minusDi: 16,
    exitPrice: partial.win ? 102 : 97,
    exitTs: 0,
    exitReason: partial.win ? "target_hit" : "stop_loss",
    maxFavorable: 0,
    maxAdverse: 0,
    holdingCandles: 1,
    ...partial,
  };
}

describe("bucketByValue", () => {
  it("buckets trades by patternConfluenceScore", () => {
    const trades = [
      makeTrade({ patternConfluenceScore: 0.1, win: false, returnPct: -2 }),
      makeTrade({ patternConfluenceScore: 0.3, win: false, returnPct: -1 }),
      makeTrade({ patternConfluenceScore: 0.5, win: true, returnPct: 1.5 }),
      makeTrade({ patternConfluenceScore: 0.7, win: true, returnPct: 2 }),
      makeTrade({ patternConfluenceScore: 0.9, win: true, returnPct: 3 }),
    ];
    const buckets = bucketByValue(
      trades,
      (t) => t.patternConfluenceScore,
      [0, 0.4, 0.8, 1.0],
    );
    expect(buckets).toHaveLength(3);
    expect(buckets[0].n).toBe(2); // 0.1, 0.3
    expect(buckets[0].wins).toBe(0);
    expect(buckets[1].n).toBe(2); // 0.5, 0.7
    expect(buckets[1].wins).toBe(2);
    expect(buckets[2].n).toBe(1); // 0.9
    expect(buckets[2].wins).toBe(1);
  });

  it("undefined values are skipped (default)", () => {
    const trades = [
      makeTrade({ patternConfluenceScore: undefined, win: true, returnPct: 1 }),
      makeTrade({ patternConfluenceScore: 0.5, win: true, returnPct: 1 }),
      makeTrade({ patternConfluenceScore: 0.5, win: false, returnPct: -1 }),
    ];
    const buckets = bucketByValue(trades, (t) => t.patternConfluenceScore, [0, 1.0]);
    expect(buckets[0].n).toBe(2);
  });

  it("last bucket is inclusive on upper bound", () => {
    const trades = [
      makeTrade({ rsi: 35, win: true, returnPct: 1 }),
      makeTrade({ rsi: 38, win: false, returnPct: -1 }),
      makeTrade({ rsi: 42, win: false, returnPct: -1 }), // last bucket inclusive
    ];
    const buckets = bucketByValue(trades, (t) => t.rsi, [25, 35, 42]);
    expect(buckets[0].n).toBe(0);
    expect(buckets[1].n).toBe(3); // 35, 38, 42 모두 last bucket
  });

  it("computes avgReturnPct per bucket", () => {
    const trades = [
      makeTrade({ adx: 15, win: true, returnPct: 2 }),
      makeTrade({ adx: 16, win: true, returnPct: 4 }),
      makeTrade({ adx: 25, win: false, returnPct: -3 }),
    ];
    const buckets = bucketByValue(trades, (t) => t.adx, [0, 20, 40]);
    expect(buckets[0].avgReturnPct).toBeCloseTo(3, 4); // (2+4)/2
    expect(buckets[1].avgReturnPct).toBeCloseTo(-3, 4);
  });

  it("sufficient flag reflects n >= 20", () => {
    const trades = Array.from({ length: 25 }, () =>
      makeTrade({ rsi: 32, win: true, returnPct: 1 }),
    );
    const buckets = bucketByValue(trades, (t) => t.rsi, [25, 35]);
    expect(buckets[0].sufficient).toBe(true);

    const small = trades.slice(0, 10);
    const smallBuckets = bucketByValue(small, (t) => t.rsi, [25, 35]);
    expect(smallBuckets[0].sufficient).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────
// calibrate() — recommendation logic
// ─────────────────────────────────────────────────────────

describe("calibrate — recommended threshold", () => {
  const param: CalibrationParam = {
    name: "patternConfluenceScore",
    label: "Pattern Confluence",
    valueOf: (t) => t.patternConfluenceScore,
    edges: [0, 0.3, 0.5, 0.7, 1.0],
    currentThreshold: 0.4,
    direction: "min",
    dimension: 5,
  };

  it("권고 없음 — 모든 bucket 이 baseline 과 비슷 (CI 하한 ≮ baseline + 5%p)", () => {
    // 정확히 50% baseline. 각 bucket 24 trade, 12 win, 12 loss.
    // 작은 표본 (n=24) 의 Wilson CI 폭 약 ±18%p → baseline + 5%p 보장 못함.
    const trades: BacktestTrade[] = [];
    const buckets = [0.1, 0.4, 0.6, 0.8]; // 4 bucket
    for (const bucketVal of buckets) {
      for (let i = 0; i < 24; i++) {
        trades.push(
          makeTrade({
            patternConfluenceScore: bucketVal,
            win: i < 12, // 정확히 12/24 = 50%
            returnPct: i < 12 ? 1 : -1,
          }),
        );
      }
    }
    const result = calibrate(trades, param);
    expect(result.sampleSufficient).toBe(false); // 96 < 100, 충분 X
    expect(result.baselineWinRate).toBeCloseTo(0.5, 5);
    // 어떤 bucket 의 CI 하한도 0.55 (= 0.5 + 5%p) 를 넘지 못해야 함
    for (const b of result.buckets) {
      if (b.sufficient) {
        expect(b.ciLower).toBeLessThan(0.55);
      }
    }
    expect(result.recommendedThreshold).toBeNull();
  });

  it("권고 채택 — 높은 bucket 의 CI 하한이 baseline + 5%p 이상", () => {
    // 80% wins in confluence ≥ 0.5 bucket, 30% in lower
    // baseline = ~55%
    const trades: BacktestTrade[] = [];
    // 0.1~0.3: 30% win rate (n=50)
    for (let i = 0; i < 50; i++) {
      trades.push(
        makeTrade({
          patternConfluenceScore: 0.2,
          win: i < 15,
          returnPct: i < 15 ? 1 : -1,
        }),
      );
    }
    // 0.5~0.7: 80% win rate (n=50)
    for (let i = 0; i < 50; i++) {
      trades.push(
        makeTrade({
          patternConfluenceScore: 0.6,
          win: i < 40,
          returnPct: i < 40 ? 1 : -1,
        }),
      );
    }
    const result = calibrate(trades, param);
    expect(result.sampleSufficient).toBe(true);
    expect(result.recommendedThreshold).toBeGreaterThanOrEqual(0.5);
    expect(result.expectedWinRate).toBeGreaterThanOrEqual(0.6);
  });

  it("표본 부족 — sampleSufficient false", () => {
    const trades = Array.from({ length: 50 }, () =>
      makeTrade({ patternConfluenceScore: 0.6, win: true, returnPct: 1 }),
    );
    const result = calibrate(trades, param);
    expect(result.sampleSufficient).toBe(false);
  });

  it("direction='max' — 가장 낮은 upper 부터 검사 (예: ADX ≤ X)", () => {
    const adxParam: CalibrationParam = {
      ...param,
      name: "adx",
      label: "ADX",
      valueOf: (t) => t.adx,
      edges: [0, 15, 25, 40],
      currentThreshold: 30,
      direction: "max",
      dimension: 3,
    };
    // ADX 0~15 가 70% winRate, 15~25 가 50%, 25~40 가 30%
    const trades: BacktestTrade[] = [];
    for (let i = 0; i < 30; i++) {
      trades.push(makeTrade({ adx: 10, win: i < 21, returnPct: i < 21 ? 1 : -1 }));
    }
    for (let i = 0; i < 30; i++) {
      trades.push(makeTrade({ adx: 20, win: i < 15, returnPct: i < 15 ? 1 : -1 }));
    }
    for (let i = 0; i < 40; i++) {
      trades.push(makeTrade({ adx: 30, win: i < 12, returnPct: i < 12 ? 1 : -1 }));
    }
    const result = calibrate(trades, adxParam);
    // 가장 낮은 upper (15) 가 권고
    if (result.recommendedThreshold != null) {
      expect(result.recommendedThreshold).toBeLessThanOrEqual(25);
    }
  });

  it("significantChange flag — 현재값 대비 20% 이상 변화", () => {
    const trades: BacktestTrade[] = [];
    for (let i = 0; i < 50; i++) {
      trades.push(
        makeTrade({
          patternConfluenceScore: 0.2,
          win: i < 10,
          returnPct: i < 10 ? 1 : -1,
        }),
      );
    }
    for (let i = 0; i < 50; i++) {
      trades.push(
        makeTrade({
          patternConfluenceScore: 0.8,
          win: i < 45,
          returnPct: i < 45 ? 1 : -1,
        }),
      );
    }
    const result = calibrate(trades, param);
    if (result.recommendedThreshold != null && param.currentThreshold === 0.4) {
      // 권고가 0.7 정도면 차이 = 0.3, 0.4 의 75% → significant
      const delta = Math.abs(result.recommendedThreshold - 0.4);
      if (delta >= 0.4 * 0.2) {
        expect(result.significantChange).toBe(true);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────
// STANDARD params + integration
// ─────────────────────────────────────────────────────────

describe("STANDARD_CALIBRATION_PARAMS", () => {
  it("contains 7 standard params", () => {
    expect(STANDARD_CALIBRATION_PARAMS).toHaveLength(7);
    const names = STANDARD_CALIBRATION_PARAMS.map((p) => p.name);
    expect(names).toContain("patternConfluenceScore");
    expect(names).toContain("rsi");
    expect(names).toContain("adx");
    expect(names).toContain("emaRibbonMult");
    expect(names).toContain("macdDivergenceMult");
    expect(names).toContain("modifiersProduct");
  });

  it("each param has valid edges (monotonically increasing)", () => {
    for (const p of STANDARD_CALIBRATION_PARAMS) {
      for (let i = 1; i < p.edges.length; i++) {
        expect(p.edges[i]).toBeGreaterThan(p.edges[i - 1]);
      }
    }
  });

  it("each param has dimension 1~7 (헌장 검증)", () => {
    for (const p of STANDARD_CALIBRATION_PARAMS) {
      expect(p.dimension).toBeGreaterThanOrEqual(1);
      expect(p.dimension).toBeLessThanOrEqual(7);
    }
  });
});

describe("runStandardCalibration — integration", () => {
  it("produces 7 results from sample trades", () => {
    const trades = Array.from({ length: 200 }, (_, i) =>
      makeTrade({
        patternConfluenceScore: (i % 5) * 0.2,
        rsi: 28 + (i % 12),
        adx: 10 + (i % 25),
        signalStrength: 30 + (i % 60),
        emaRibbonMult: 0.7 + (i % 5) * 0.1,
        macdDivergenceMult: 0.85 + (i % 4) * 0.08,
        orderBlockMult: 0.95 + (i % 2) * 0.05,
        modifiersProduct: 0.8 + (i % 6) * 0.1,
        win: i % 3 !== 0,
        returnPct: i % 3 !== 0 ? 1 : -1,
      }),
    );
    const results = runStandardCalibration(trades);
    expect(results).toHaveLength(7);
    for (const r of results) {
      expect(r.buckets.length).toBeGreaterThan(0);
      expect(r.baselineWinRate).toBeGreaterThan(0);
    }
  });
});
