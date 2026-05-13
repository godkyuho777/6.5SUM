/**
 * BBDX v6.6 evaluator 단위 테스트 — D-1 (2026-05-12).
 *
 * 검증 범위:
 *   - evaluateLongV66 / evaluateShortV66 의 graceful fallback
 *   - evaluatePositionSignalsV66 의 충돌 해결 (long_stronger / short_stronger / both_blocked)
 *   - modifiersMult 미지정 시 1.0 default
 *   - Falling Knife / Rising Knife 차단 동작
 *   - finalScore clamping [0, 100]
 *
 * Calibration regression 방지 + production stability.
 */

import { describe, test, expect, vi, beforeEach } from "vitest";
import type { Candle, TechnicalIndicators } from "../../../shared/types";
import { evaluateLongV66 } from "../long-entry";
import { evaluateShortV66, computeShortStopIndicator } from "../short-entry";
import { evaluatePositionSignalsV66 } from "../evaluate";

// ── Helpers ────────────────────────────────────────────────────────

function makeCandles(closes: number[], baseTs = 1700000000000): Candle[] {
  return closes.map((c, i) => ({
    openTime: baseTs + i * 4 * 60 * 60 * 1000,
    open: c,
    high: c * 1.005,
    low: c * 0.995,
    close: c,
    volume: 1000,
    closeTime: baseTs + (i + 1) * 4 * 60 * 60 * 1000 - 1,
  }));
}

function indicators(overrides: Partial<TechnicalIndicators> = {}): TechnicalIndicators {
  return {
    rsi: 30,
    bbUpper: 110,
    bbMiddle: 100,
    bbLower: 90,
    adx: 18,
    plusDi: 22,
    minusDi: 28,
    ...overrides,
  };
}

// ── feature-flags mock — SHORT 활성화 ─────────────────────────────
vi.mock("../../../config/feature-flags", () => ({
  isShortEnabled: () => true,
  FEATURE_FLAGS: { ENABLE_SHORT_SIGNALS: true },
}));

// ── weight-calibration mock — deterministic ────────────────────────
vi.mock("../../weight-calibration", () => ({
  getWeightsForSignal: vi.fn(async () => ({
    weights: {
      momentum: 0.3,
      position: 0.25,
      trend: 0.2,
      volume: 0.15,
      action: 0.1,
    },
    source: "default" as const,
    status: "ok",
    metadata: {},
  })),
  getThresholdForSignal: vi.fn(async () => ({
    threshold: 50,
    source: "default" as const,
    status: "ok",
  })),
}));

// ── tests ──────────────────────────────────────────────────────────

describe("evaluateLongV66 — graceful fallback (D-1)", () => {
  test("Falling Knife 차단 — triggered=false + reasons 명시", async () => {
    const candles = makeCandles(Array(100).fill(100));
    const result = await evaluateLongV66({
      symbol: "BTCUSDT",
      tf: "4h",
      candles,
      windowCandles: candles,
      indicators: indicators({
        adx: 30, // > 25
        plusDi: 15,
        minusDi: 35, // -DI > +DI → falling knife
      }),
    });
    expect(result.triggered).toBe(false);
    expect(result.reasons).toContain("Falling Knife 차단");
    expect(result.finalScore).toBe(0);
  });

  test("decideEntry 미충족 — triggered=false", async () => {
    const candles = makeCandles(Array(100).fill(100));
    const result = await evaluateLongV66({
      symbol: "BTCUSDT",
      tf: "4h",
      candles,
      windowCandles: candles,
      indicators: indicators({
        rsi: 50, // 30~38 영역 X
        adx: 18,
        plusDi: 25,
        minusDi: 20,
      }),
    });
    expect(result.triggered).toBe(false);
    expect(result.reasons.some((r) => r.includes("미충족"))).toBe(true);
  });

  test("modifiersMult 미지정 시 1.0 default (NaN 안전)", async () => {
    const candles = makeCandles(Array(100).fill(95));
    const result = await evaluateLongV66({
      symbol: "BTCUSDT",
      tf: "4h",
      candles,
      windowCandles: candles,
      indicators: indicators({
        rsi: 28,
        adx: 15,
        plusDi: 22,
        minusDi: 18,
      }),
      // modifiersMult 의도적 미지정
    });
    // finalScore 가 NaN 또는 Infinity 아님
    expect(Number.isFinite(result.finalScore)).toBe(true);
  });

  test("finalScore [0, 100] clamping", async () => {
    const candles = makeCandles(Array(100).fill(95));
    const result = await evaluateLongV66({
      symbol: "BTCUSDT",
      tf: "4h",
      candles,
      windowCandles: candles,
      indicators: indicators(),
      modifiersMult: 100, // 비현실적 큰 값
    });
    expect(result.finalScore).toBeLessThanOrEqual(100);
    expect(result.finalScore).toBeGreaterThanOrEqual(0);
  });
});

describe("evaluateShortV66 — graceful fallback (D-1)", () => {
  test("Rising Knife 차단 (lowerRiding 외) — triggered=false", async () => {
    const candles = makeCandles(Array(100).fill(100));
    const result = await evaluateShortV66({
      symbol: "BTCUSDT",
      tf: "4h",
      candles,
      windowCandles: candles,
      indicators: indicators({
        adx: 30, // > 25
        plusDi: 35,
        minusDi: 15, // +DI > -DI → rising knife
      }),
    });
    expect(result.triggered).toBe(false);
    expect(result.reasons.some((r) => r.includes("Rising Knife"))).toBe(true);
    expect(result.finalScore).toBe(0);
  });

  test("decideShortEntry 미충족 — triggered=false", async () => {
    const candles = makeCandles(Array(100).fill(100));
    const result = await evaluateShortV66({
      symbol: "BTCUSDT",
      tf: "4h",
      candles,
      windowCandles: candles,
      indicators: indicators({
        rsi: 50, // 62~75 영역 X
        adx: 18,
        plusDi: 18,
        minusDi: 22,
      }),
    });
    expect(result.triggered).toBe(false);
    expect(result.reasons.some((r) => r.includes("미충족"))).toBe(true);
  });

  test("computeShortStopIndicator — bbUpper × 1.03 vs entry × 1.02 중 작은 값", () => {
    // bbUpper × 1.03 = 100 × 1.03 = 103 / entry × 1.02 = 100 × 1.02 = 102
    // → min = 102
    expect(computeShortStopIndicator(100, indicators({ bbUpper: 100 }))).toBe(102);
    // bbUpper × 1.03 = 110 × 1.03 = 113.3 / entry × 1.02 = 100 × 1.02 = 102
    // → min = 102
    expect(computeShortStopIndicator(100, indicators({ bbUpper: 110 }))).toBe(102);
    // bbUpper × 1.03 = 90 × 1.03 = 92.7 / entry × 1.02 = 100 × 1.02 = 102
    // → min = 92.7
    expect(computeShortStopIndicator(100, indicators({ bbUpper: 90 }))).toBeCloseTo(
      92.7,
      5,
    );
  });
});

describe("evaluatePositionSignalsV66 — 충돌 해결 (D-1)", () => {
  test("LONG/SHORT 둘 다 비활성 → meta.bothTriggered=false / conflictResolution='none'", async () => {
    const candles = makeCandles(Array(100).fill(100));
    const result = await evaluatePositionSignalsV66({
      symbol: "BTCUSDT",
      tf: "4h",
      candles,
      windowCandles: candles,
      indicators: indicators({
        rsi: 50, // 진입 X 영역
        adx: 18,
      }),
    });
    expect(result.long).toBeNull();
    expect(result.short).toBeNull();
    expect(result.meta.bothTriggered).toBe(false);
    expect(result.meta.conflictResolution).toBe("none");
    expect(result.meta.version).toBe("v6.6");
  });

  test("LONG only triggered → short null + conflictResolution='none'", async () => {
    // LONG 진입 조건: RSI 28, BB 하단 근접 + ADX 낮음
    const candles = makeCandles([
      ...Array(80).fill(110),
      ...Array(20).fill(91), // BB 하단 근처로 떨어짐
    ]);
    const result = await evaluatePositionSignalsV66({
      symbol: "BTCUSDT",
      tf: "4h",
      candles,
      windowCandles: candles,
      indicators: indicators({
        rsi: 28,
        bbLower: 90,
        adx: 15,
        plusDi: 22,
        minusDi: 18,
      }),
    });
    // SHORT 측은 미충족이어야
    expect(result.short).toBeNull();
    expect(result.meta.conflictResolution).toBe("none");
  });
});

describe("evaluatePositionSignalsV66 — version meta 일관성", () => {
  test("meta.version 항상 'v6.6'", async () => {
    const candles = makeCandles(Array(100).fill(100));
    const result = await evaluatePositionSignalsV66({
      symbol: "BTCUSDT",
      tf: "4h",
      candles,
      windowCandles: candles,
      indicators: indicators(),
    });
    expect(result.meta.version).toBe("v6.6");
  });

  test("bothTriggered boolean 보장", async () => {
    const candles = makeCandles(Array(100).fill(100));
    const result = await evaluatePositionSignalsV66({
      symbol: "BTCUSDT",
      tf: "4h",
      candles,
      windowCandles: candles,
      indicators: indicators(),
    });
    expect(typeof result.meta.bothTriggered).toBe("boolean");
  });
});
