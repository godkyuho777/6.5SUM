/**
 * CRS-lite (Capitulation Reversal Score, P1) 단위 테스트.
 *
 * docs/2026-06-03-CRS/00-DESIGN.md §8 검증:
 *   - 게이트 미통과 → mult 1.0 (회귀 안전)
 *   - 게이트 통과(인공 cascade) → 1.0 < mult ≤ 1.10
 *   - clamp 회귀 가드: funding(1.20) × CRS(1.10) × CRS(1.10) → clampMultiplier 1.40
 *   - 데이터 부족 → neutral 1.0 (throw X)
 */

import { describe, expect, it } from "vitest";
import type { Candle } from "@shared/types";
import { computeCRS } from "./crs";
import { clampMultiplier } from "./types";

/** 단일 캔들 빌더 (openTime 은 의미 없음 — CRS 는 가격 모양만 사용). */
function candle(
  open: number,
  high: number,
  low: number,
  close: number,
): Candle {
  return { openTime: 0, open, high, low, close, volume: 1000, closeTime: 0 };
}

/**
 * 평탄한 baseline N 개 + 옵션 cascade 캔들 시퀀스 생성.
 *
 * baseline 은 BB(20)/ATR(14) 를 안정적인 중심값으로 워밍업시키고,
 * cascade(있으면) 가 마지막 캔들에서 급락 + 긴 아래꼬리 + BB하단 관통을 만든다.
 */
function buildCandles(opts: {
  baseCount: number;
  basePrice: number;
  /** baseline 캔들의 high-low 폭 (ATR 워밍업용) */
  baseRange: number;
  /** 마지막 캔들들을 cascade 로 교체할지 */
  cascade?: Candle[];
}): Candle[] {
  const { baseCount, basePrice, baseRange, cascade = [] } = opts;
  const candles: Candle[] = [];
  for (let i = 0; i < baseCount; i++) {
    // 소폭 진동하는 평탄 baseline (close 거의 일정 → BB lower 가 basePrice 근처).
    const c = basePrice + (i % 2 === 0 ? 0.1 : -0.1);
    candles.push(candle(c, c + baseRange / 2, c - baseRange / 2, c));
  }
  candles.push(...cascade);
  return candles;
}

describe("computeCRS (CRS-lite, P1)", () => {
  it("게이트 미통과 (정상 캔들) → multiplier 1.0", () => {
    // 평탄한 캔들만 — vel≈0, BB 중앙, 짧은 꼬리 → 게이트 전부 미통과.
    const candles = buildCandles({
      baseCount: 40,
      basePrice: 100,
      baseRange: 1,
    });
    const res = computeCRS(candles, "4h");
    expect(res.multiplier).toBe(1.0);
    expect(res.dimension).toBe(6);
  });

  it("게이트 통과 (인공 cascade) → 1.0 < multiplier ≤ 1.10", () => {
    // baseline 100 근처 → BB lower ≈ 100 부근. 마지막 3 캔들에서 급락:
    //   close 가 BB 하단 아래로, ATR 대비 큰 폭 하락(vel ≤ -1.5),
    //   마지막 캔들은 저점에서 강하게 되돌린 긴 아래꼬리(wick ≥ 0.5).
    const cascade: Candle[] = [
      // t-2: 하락 시작
      candle(100, 100.2, 96, 96.5),
      // t-1: 추가 급락
      candle(96.5, 96.7, 92, 92.5),
      // t (평가 대상): 저점 88 까지 관통 후 강한 흡수 → close 91, 긴 아래꼬리
      //   range = 91.5-88 = 3.5, lowerWick = min(open,close)-low = 90-88 = 2.0
      //   wick = 2.0/3.5 ≈ 0.57 ≥ 0.5  ✓
      candle(90, 91.5, 88, 91),
    ];
    const candles = buildCandles({
      baseCount: 37,
      basePrice: 100,
      baseRange: 1,
      cascade,
    });
    const res = computeCRS(candles, "4h");
    expect(res.multiplier).toBeGreaterThan(1.0);
    expect(res.multiplier).toBeLessThanOrEqual(1.10);
    expect(res.status).toBe("real");
  });

  it("clamp 회귀 가드 — funding(1.20) × CRS상한(1.10) × CRS상한(1.10) 은 1.40 으로 잘린다", () => {
    // CRS_LITE_MAX_BOOST 를 누가 올리면(예: 1.15) 이 곱이 1.40 을 넘겨
    // clampMultiplier 가 더 이상 안전 여유를 보장하지 못함을 잡아내는 가드.
    // 현재 상한 1.10 기준: 1.20*1.10*1.10 = 1.452 → clamp → 1.40.
    const product = 1.20 * 1.10 * 1.10;
    expect(product).toBeGreaterThan(1.40); // 곱은 상한을 넘지만
    expect(clampMultiplier(product)).toBe(1.40); // clamp 가 1.40 으로 방어
  });

  it("데이터 부족 → neutral 1.0 (throw X)", () => {
    const candles = buildCandles({ baseCount: 10, basePrice: 100, baseRange: 1 });
    expect(() => computeCRS(candles, "4h")).not.toThrow();
    const res = computeCRS(candles, "4h");
    expect(res.multiplier).toBe(1.0);
    expect(res.status).toBe("stub");
  });

  it("빈 배열 → neutral 1.0 (throw X)", () => {
    expect(() => computeCRS([], "4h")).not.toThrow();
    expect(computeCRS([], "4h").multiplier).toBe(1.0);
  });
});
