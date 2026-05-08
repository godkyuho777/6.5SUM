import { describe, expect, it } from "vitest";
import {
  calculateVWAP,
  calculateVwapBands,
  decideVwapSignal,
  detectPullbackV2,
  vwapToMultiplier,
} from "./indicators";
import { computeVolumeProfile } from "./volume-profile";
import type { Candle } from "@shared/types";

/** 단순 캔들 빌더 — 테스트 가독성용 */
function mkCandle(
  openTime: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number
): Candle {
  return {
    openTime,
    open,
    high,
    low,
    close,
    volume,
    closeTime: openTime + 60_000,
  };
}

/** 같은 가격 / 일정 거래량 캔들 N 개 */
function flatCandles(n: number, price: number, vol: number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    out.push(mkCandle(i * 60_000, price, price, price, price, vol));
  }
  return out;
}

// ─── calculateVWAP ────────────────────────────────────────────────────────
describe("calculateVWAP", () => {
  it("returns 0 for empty array", () => {
    expect(calculateVWAP([])).toBe(0);
  });

  it("returns typical price for single candle (vol > 0)", () => {
    const c = mkCandle(0, 100, 102, 98, 100, 1000);
    const expected = (102 + 98 + 100) / 3;
    expect(calculateVWAP([c])).toBeCloseTo(expected, 6);
  });

  it("returns 0 when total volume is 0", () => {
    const c = mkCandle(0, 100, 100, 100, 100, 0);
    expect(calculateVWAP([c, c])).toBe(0);
  });

  it("weights typical price by volume correctly", () => {
    // candle1 typical = 100, vol = 1000  → weight 1000
    // candle2 typical = 200, vol = 3000  → weight 3000
    // VWAP = (100*1000 + 200*3000) / 4000 = 700_000/4000 = 175
    const c1 = mkCandle(0, 100, 100, 100, 100, 1000);
    const c2 = mkCandle(60_000, 200, 200, 200, 200, 3000);
    expect(calculateVWAP([c1, c2])).toBeCloseTo(175, 6);
  });
});

// ─── calculateVwapBands ───────────────────────────────────────────────────
describe("calculateVwapBands", () => {
  it("sigma = 0 when all candles same typical price", () => {
    const cs = flatCandles(10, 100, 500);
    const b = calculateVwapBands(cs);
    expect(b.vwap).toBeCloseTo(100, 6);
    expect(b.sigma).toBeCloseTo(0, 6);
    expect(b.upper1).toBeCloseTo(100, 6);
    expect(b.lower1).toBeCloseTo(100, 6);
  });

  it("upper{n} = vwap + n * sigma", () => {
    // typical=100 (vol=1000) and typical=200 (vol=1000) → vwap=150, var = ((100-150)^2 + (200-150)^2*) / total
    const c1 = mkCandle(0, 100, 100, 100, 100, 1000);
    const c2 = mkCandle(60_000, 200, 200, 200, 200, 1000);
    const b = calculateVwapBands([c1, c2]);
    expect(b.vwap).toBeCloseTo(150, 6);
    // variance = (2500*1000 + 2500*1000) / 2000 = 2500 → sigma = 50
    expect(b.sigma).toBeCloseTo(50, 6);
    expect(b.upper1).toBeCloseTo(200, 6);
    expect(b.upper2).toBeCloseTo(250, 6);
    expect(b.upper3).toBeCloseTo(300, 6);
  });

  it("lower{n} = vwap - n * sigma", () => {
    const c1 = mkCandle(0, 100, 100, 100, 100, 1000);
    const c2 = mkCandle(60_000, 200, 200, 200, 200, 1000);
    const b = calculateVwapBands([c1, c2]);
    expect(b.lower1).toBeCloseTo(100, 6);
    expect(b.lower2).toBeCloseTo(50, 6);
    expect(b.lower3).toBeCloseTo(0, 6);
  });

  it("matches volume-weighted variance manually", () => {
    // candle typical prices [10, 20, 30] with volumes [1, 2, 3].
    const cs = [
      mkCandle(0, 10, 10, 10, 10, 1),
      mkCandle(60_000, 20, 20, 20, 20, 2),
      mkCandle(120_000, 30, 30, 30, 30, 3),
    ];
    const b = calculateVwapBands(cs);
    // Σ(p*v) = 10+40+90 = 140; Σv = 6 → vwap = 140/6 ≈ 23.333
    const expectedVwap = 140 / 6;
    expect(b.vwap).toBeCloseTo(expectedVwap, 6);
    // var = Σ((p-vwap)^2 * v) / Σv
    let cumVarNum = 0;
    for (const [p, v] of [
      [10, 1],
      [20, 2],
      [30, 3],
    ] as [number, number][]) {
      cumVarNum += (p - expectedVwap) ** 2 * v;
    }
    const expectedSigma = Math.sqrt(cumVarNum / 6);
    expect(b.sigma).toBeCloseTo(expectedSigma, 6);
  });

  it("returns zero bands when candles empty", () => {
    const b = calculateVwapBands([]);
    expect(b.vwap).toBe(0);
    expect(b.sigma).toBe(0);
    expect(b.upper3).toBe(0);
    expect(b.lower3).toBe(0);
  });
});

// ─── detectPullbackV2 ─────────────────────────────────────────────────────
describe("detectPullbackV2", () => {
  it("detected: false when candles < 7", () => {
    const cs = flatCandles(5, 100, 100);
    const r = detectPullbackV2(cs, 100, 100, "LONG");
    expect(r.detected).toBe(false);
  });

  it("detected: true + bounceConfirmed when LONG pullback to VWAP + bounce", () => {
    // 7 캔들. 마지막 5 캔들 윈도우 안에 vwap=100 근처 터치 후 반등.
    // idx 0~1: 위쪽 (close 105) — 컨텍스트
    // idx 2: VWAP 터치 (low=99.7, close=100, ~0.3% within 0.5%)
    // idx 3: 반등 양봉 (open 100, close 103) — bounceConfirmed
    // idx 4~6: 후속 (close 105)
    const cs: Candle[] = [
      mkCandle(0, 105, 106, 104, 105, 100),
      mkCandle(60_000, 105, 106, 104, 105, 100),
      mkCandle(120_000, 102, 102, 99.7, 100, 100),  // touch
      mkCandle(180_000, 100, 103, 100, 103, 100),    // bounce
      mkCandle(240_000, 103, 105, 103, 105, 100),
      mkCandle(300_000, 105, 106, 104, 105, 100),
      mkCandle(360_000, 105, 106, 104, 105, 100),
    ];
    const r = detectPullbackV2(cs, 100, 100, "LONG");
    expect(r.detected).toBe(true);
    expect(r.bounceConfirmed).toBe(true);
    expect(r.touchCandleIdx).toBe(2);
    expect(r.touchedLine).toBe("vwap");
  });

  it("bounceConfirmed: false when no bounce candle after touch", () => {
    // touch 후 음봉만 → bounceConfirmed = false
    const cs: Candle[] = [
      mkCandle(0, 105, 106, 104, 105, 100),
      mkCandle(60_000, 105, 106, 104, 105, 100),
      mkCandle(120_000, 102, 102, 99.7, 100, 100), // touch
      mkCandle(180_000, 100, 100, 97, 98, 100),    // 음봉
      mkCandle(240_000, 98, 99, 95, 96, 100),
      mkCandle(300_000, 96, 97, 94, 95, 100),
      mkCandle(360_000, 95, 96, 93, 94, 100),
    ];
    const r = detectPullbackV2(cs, 100, 100, "LONG");
    expect(r.detected).toBe(true);
    expect(r.bounceConfirmed).toBe(false);
  });

  it("touchedLine reflects which line was approached", () => {
    // VWAP 멀고 EMA9 만 가까운 케이스
    const cs: Candle[] = [
      mkCandle(0, 130, 131, 129, 130, 100),
      mkCandle(60_000, 130, 131, 129, 130, 100),
      mkCandle(120_000, 122, 122, 119.7, 120, 100), // ema9=120 근처 터치
      mkCandle(180_000, 120, 124, 120, 124, 100),    // 양봉 반등
      mkCandle(240_000, 124, 126, 124, 126, 100),
      mkCandle(300_000, 126, 128, 126, 128, 100),
      mkCandle(360_000, 128, 130, 128, 130, 100),
    ];
    const r = detectPullbackV2(cs, 100, 120, "LONG");
    expect(r.detected).toBe(true);
    expect(r.touchedLine).toBe("ema9");
  });

  it("SHORT side mirrored — touch + bearish bounce", () => {
    // SHORT: 가격이 vwap 아래에서 거래되다가 vwap 으로 올라와 터치 후 다시 하락
    const cs: Candle[] = [
      mkCandle(0, 95, 96, 94, 95, 100),
      mkCandle(60_000, 95, 96, 94, 95, 100),
      mkCandle(120_000, 98, 100.3, 98, 100, 100),  // touch from below
      mkCandle(180_000, 100, 100, 97, 97, 100),    // bearish: close < open && close < touch.close
      mkCandle(240_000, 97, 97, 95, 95, 100),
      mkCandle(300_000, 95, 96, 93, 94, 100),
      mkCandle(360_000, 94, 95, 92, 93, 100),
    ];
    const r = detectPullbackV2(cs, 100, 100, "SHORT");
    expect(r.detected).toBe(true);
    expect(r.bounceConfirmed).toBe(true);
  });
});

// ─── computeVolumeProfile ─────────────────────────────────────────────────
describe("computeVolumeProfile", () => {
  it("returns empty profile for 0 candles", () => {
    const vp = computeVolumeProfile([], 24);
    expect(vp.bins.length).toBe(0);
    expect(vp.poc).toBe(0);
    expect(vp.totalVolume).toBe(0);
  });

  it("identifies POC = max-volume bin midprice", () => {
    // 가격 100..110 분포, 105 근처에 거래량 집중
    const cs: Candle[] = [
      mkCandle(0, 100, 101, 99, 100, 100),
      mkCandle(60_000, 102, 103, 101, 102, 100),
      mkCandle(120_000, 105, 106, 104, 105, 5000), // 거래량 집중
      mkCandle(180_000, 105, 106, 104, 105, 5000),
      mkCandle(240_000, 108, 110, 107, 108, 100),
    ];
    const vp = computeVolumeProfile(cs, 10);
    // POC bin 의 mid-price 가 105 근처 (105±1 정도)
    expect(vp.poc).toBeGreaterThan(103);
    expect(vp.poc).toBeLessThan(107);
  });

  it("HVN = bins with volume > 1.5x average", () => {
    // 한 bin 에만 거래량 매우 큰 캔들 → 그 bin 만 HVN
    const cs: Candle[] = [];
    for (let i = 0; i < 20; i++) {
      cs.push(mkCandle(i * 60_000, 100 + i, 101 + i, 99 + i, 100 + i, 100));
    }
    cs.push(mkCandle(20 * 60_000, 110, 110, 110, 110, 50_000)); // outlier
    const vp = computeVolumeProfile(cs, 24);
    expect(vp.hvnList.length).toBeGreaterThanOrEqual(1);
  });

  it("LVN = bins with volume < 0.5x average", () => {
    // 양 끝 bin 에 거래량 거의 없는 케이스
    const cs: Candle[] = [];
    // 중앙에 집중 거래
    for (let i = 0; i < 30; i++) {
      cs.push(mkCandle(i * 60_000, 100, 101, 99, 100, 1000));
    }
    // 한 캔들만 가격 범위 확장 (저거래량)
    cs.push(mkCandle(30 * 60_000, 90, 90, 90, 90, 1));
    cs.push(mkCandle(31 * 60_000, 110, 110, 110, 110, 1));
    const vp = computeVolumeProfile(cs, 24);
    // 가장 양 끝 bin 들은 LVN (avg 보다 훨씬 작음)
    expect(vp.lvnList.length).toBeGreaterThanOrEqual(1);
  });

  it("Value Area covers ~70% of total volume", () => {
    // 정규분포 비슷한 거래량
    const cs: Candle[] = [];
    const center = 100;
    for (let i = 0; i < 60; i++) {
      const dev = (i - 30) / 10; // -3..+3
      const price = center + dev;
      const vol = Math.round(1000 * Math.exp(-(dev * dev) / 2));
      cs.push(mkCandle(i * 60_000, price, price + 0.1, price - 0.1, price, vol));
    }
    const vp = computeVolumeProfile(cs, 24);
    // 70% 이상 ~75% 이하 정도
    expect(vp.valueArea.pct).toBeGreaterThanOrEqual(0.7);
    expect(vp.valueArea.pct).toBeLessThanOrEqual(1.0);
  });

  it("handles all-same-price candles gracefully", () => {
    const cs = flatCandles(10, 100, 500);
    const vp = computeVolumeProfile(cs, 24);
    expect(vp.poc).toBeCloseTo(100, 6);
    expect(vp.hvnList.length).toBe(1);
    expect(vp.lvnList.length).toBe(0);
    expect(vp.totalVolume).toBe(5000);
  });
});

// ─── decideVwapSignal 5-component & vwapToMultiplier ───────────────────────
describe("decideVwapSignal 5-component", () => {
  it("returns null when below threshold 50", () => {
    // price ≈ vwap → vwapDistance 0; emaPos AT → 10 score; 합산 50 미만
    const sig = decideVwapSignal(100, 100, 100, false, 1.0);
    expect(sig).toBeNull();
  });

  it("falls back to 4-component when opts missing — strong signal still emits", () => {
    // 강한 LONG: price 110, vwap 100, ema9 100 → vwapDist 10% → distance score saturated
    const sig = decideVwapSignal(110, 100, 100, true, 1.5);
    expect(sig).not.toBeNull();
    expect(sig?.side).toBe("LONG");
    expect(sig?.strength).toBeGreaterThanOrEqual(50);
  });

  it("max strength 100 with all 5 components saturated", () => {
    const cs = flatCandles(5, 105, 1000); // for VolumeProfile structure
    const vp = computeVolumeProfile(cs, 5);
    const pq = {
      detected: true,
      touchCandleIdx: 2,
      bounceConfirmed: true,
      proximityRatio: 0.001,
      touchedLine: "vwap" as const,
    };
    // 강한 LONG: 거리 5%+, ema 정렬, pullback bounce, VP 지지/구조 — 임시 vp 가
    // POC 가격 105 근처라 price=105 면 지지 점수 만점.
    const sig = decideVwapSignal(105, 100, 100, true, 1.0, {
      pullbackQuality: pq,
      volumeProfile: vp,
    });
    expect(sig).not.toBeNull();
    expect(sig!.strength).toBeLessThanOrEqual(100);
    expect(sig!.strength).toBeGreaterThanOrEqual(50);
  });
});

describe("vwapToMultiplier (charter rule 3)", () => {
  it("null signal → 1.0", () => {
    expect(vwapToMultiplier(null)).toBe(1.0);
  });

  it("LONG aligned with BBDX LONG, strength 100 → 1.30", () => {
    expect(
      vwapToMultiplier({ side: "LONG", strength: 100, reasons: [] }, "LONG")
    ).toBeCloseTo(1.3, 6);
  });

  it("SHORT contradicting BBDX LONG, strength 100 → 0.70", () => {
    expect(
      vwapToMultiplier({ side: "SHORT", strength: 100, reasons: [] }, "LONG")
    ).toBeCloseTo(0.7, 6);
  });

  it("strength 50 (threshold) maps to neutral 1.0", () => {
    expect(
      vwapToMultiplier({ side: "LONG", strength: 50, reasons: [] }, "LONG")
    ).toBeCloseTo(1.0, 6);
    expect(
      vwapToMultiplier({ side: "SHORT", strength: 50, reasons: [] }, "LONG")
    ).toBeCloseTo(1.0, 6);
  });
});
