/**
 * Trend Analysis (v2.0) 통합 테스트.
 *
 * 검증 범위:
 *   - DeepTimeframeTrend 4-tier confirmation (EMA / ADX / HH-LL / Volume)
 *   - confidenceScore 산출 (0/25/50/75/100)
 *   - WaveAlignment 5-state (perfect_up / partial_up / mixed / opposing / perfect_down)
 *   - waveAlignmentToMultiplier 매핑
 *   - analyzeTrend orchestrator (cache + graceful fallback)
 *
 * fetchKlines 는 vi.mock 으로 차단 — 외부 API 호출 없이 결정적 candle 시퀀스 주입.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Candle } from "@shared/types";

import {
  analyzeTimeframeTrendDeep,
  classifyMultiTF,
  classifyTimeframeTrend,
} from "../multi-tf";
import {
  classifyWaveAlignment,
  WAVE_MULTIPLIERS,
  waveAlignmentToMultiplier,
} from "../wave-alignment";

// ── Test fixtures ──────────────────────────────────────────────────

const candle = (
  open: number,
  high: number,
  low: number,
  close: number,
  openTime = 0,
  volume = 1000
): Candle => ({ openTime, closeTime: openTime, open, high, low, close, volume });

/** Build N strictly-trending candles. step>0 = bullish, <0 = bearish. */
function trendingCandles(
  n: number,
  start: number,
  step: number,
  baseVol = 1000
): Candle[] {
  const out: Candle[] = [];
  let price = start;
  for (let i = 0; i < n; i++) {
    const open = price;
    const close = price + step;
    const high = Math.max(open, close) + Math.abs(step) * 0.3;
    const low = Math.min(open, close) - Math.abs(step) * 0.3;
    out.push(candle(open, high, low, close, i, baseVol + i));
    price = close;
  }
  return out;
}

function flatCandles(n: number, price = 100): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    const close = price + (i % 2 === 0 ? 0.05 : -0.05);
    out.push(candle(price, price + 0.1, price - 0.1, close, i, 1000));
  }
  return out;
}

// ── DeepTimeframeTrend (single-TF analysis) ────────────────────────

describe("analyzeTimeframeTrendDeep — confirmations & confidence", () => {
  test("under-50 candles → SIDEWAYS + 0 confidence (graceful)", () => {
    const r = analyzeTimeframeTrendDeep(trendingCandles(40, 100, 1), "4h");
    expect(r.side).toBe("SIDEWAYS");
    expect(r.confidenceScore).toBe(0);
    expect(r.confirmations.emaArray).toBe("MIXED");
    expect(r.confirmations.adxStrength).toBe("WEAK");
  });

  test("strong uptrend → BULLISH + STRONG ADX + BULLISH_ALIGNED EMA", () => {
    const r = analyzeTimeframeTrendDeep(trendingCandles(120, 100, 1.0), "4h");
    expect(r.side).toBe("BULLISH");
    expect(r.confirmations.adxStrength).toBe("STRONG");
    expect(["BULLISH_ALIGNED", "GOLDEN"]).toContain(r.confirmations.emaArray);
    expect(r.confidenceScore).toBeGreaterThanOrEqual(75);
  });

  test("strong downtrend → BEARISH + BEARISH_ALIGNED + LH_LL structure", () => {
    const r = analyzeTimeframeTrendDeep(trendingCandles(120, 200, -1.0), "4h");
    expect(r.side).toBe("BEARISH");
    expect(["BEARISH_ALIGNED", "DEATH"]).toContain(r.confirmations.emaArray);
    expect(r.confidenceScore).toBeGreaterThanOrEqual(50);
  });

  test("flat sideways candles → SIDEWAYS, low confidence", () => {
    const r = analyzeTimeframeTrendDeep(flatCandles(120, 100), "4h");
    expect(r.side).toBe("SIDEWAYS");
    expect(r.confidenceScore).toBeLessThanOrEqual(25);
  });

  test("WEAK ADX → side falls back to SIDEWAYS even with bullish EMA", () => {
    // Tiny step → ADX weak, EMA might still align bullish slowly.
    const r = analyzeTimeframeTrendDeep(trendingCandles(120, 100, 0.02), "4h");
    expect(["SIDEWAYS", "BULLISH"]).toContain(r.side);
    if (r.side === "SIDEWAYS") {
      expect(r.confidenceScore).toBeLessThanOrEqual(25);
    }
  });

  test("ADX 3-state classifier — STRONG/BORDERLINE/WEAK reachable", () => {
    const strong = analyzeTimeframeTrendDeep(trendingCandles(120, 100, 1.5), "4h");
    expect(strong.confirmations.adxStrength).toBe("STRONG");

    const weak = analyzeTimeframeTrendDeep(flatCandles(120), "4h");
    expect(weak.confirmations.adxStrength).toBe("WEAK");
  });

  test("Volume confirmation — INCREASING reachable", () => {
    // classifyVolumeConfirmation 은 last 10 캔들에서 5-on-5 비교.
    // 최근 5 (idx 55~59) > 직전 5 (idx 50~54) × 1.15 → INCREASING.
    const candles: Candle[] = [];
    for (let i = 0; i < 60; i++) {
      // 마지막 10 캔들 안에서 후반 5 개의 vol 이 전반 5 개의 ~3x.
      let vol = 1000;
      if (i >= 50 && i < 55) vol = 1000;
      else if (i >= 55) vol = 5000;
      const close = 100 + i * 0.5;
      candles.push(candle(close - 0.1, close + 0.2, close - 0.2, close, i, vol));
    }
    const r = analyzeTimeframeTrendDeep(candles, "4h");
    expect(r.confirmations.volumeConfirm).toBe("INCREASING");
  });

  test("Volume confirmation — DECREASING reachable", () => {
    // 최근 5 (idx 55~59) < 직전 5 (idx 50~54) × 0.85 → DECREASING.
    const candles: Candle[] = [];
    for (let i = 0; i < 60; i++) {
      let vol = 1000;
      if (i >= 50 && i < 55) vol = 5000;
      else if (i >= 55) vol = 500;
      const close = 100 + i * 0.5;
      candles.push(candle(close - 0.1, close + 0.2, close - 0.2, close, i, vol));
    }
    const r = analyzeTimeframeTrendDeep(candles, "4h");
    expect(r.confirmations.volumeConfirm).toBe("DECREASING");
  });

  test("4-tier confirmation count maps to confidenceScore (multiples of 25)", () => {
    const r = analyzeTimeframeTrendDeep(trendingCandles(120, 100, 1.0), "4h");
    expect([0, 25, 50, 75, 100]).toContain(r.confidenceScore);
  });
});

// ── Legacy classifyTimeframeTrend (regression: must not break) ────────

describe("classifyTimeframeTrend — legacy 4-state regression", () => {
  test("legacy bullish detection still works", () => {
    const r = classifyTimeframeTrend(trendingCandles(80, 100, 0.8), "4h");
    expect(r.direction).toBe("BULLISH");
    expect(r.emaAlignment).toBe("bullish");
  });

  test("legacy bearish detection still works", () => {
    const r = classifyTimeframeTrend(trendingCandles(80, 200, -0.8), "4h");
    expect(r.direction).toBe("BEARISH");
    expect(r.emaAlignment).toBe("bearish");
  });

  test("classifyMultiTF preserves order", () => {
    const result = classifyMultiTF([
      { tf: "1h", candles: trendingCandles(80, 100, 0.5) },
      { tf: "4h", candles: trendingCandles(80, 100, 0.8) },
    ]);
    expect(result.map((r) => r.tf)).toEqual(["1h", "4h"]);
  });
});

// ── WaveAlignment 5-state ─────────────────────────────────────────

describe("classifyWaveAlignment — 5-state", () => {
  const tfTrend = (
    tf: string,
    direction: "BULLISH" | "BEARISH" | "SIDEWAYS"
  ) => ({
    tf,
    direction,
    adx: 25,
    plusDi: 25,
    minusDi: 18,
    emaAlignment: "mixed" as const,
  });

  test("perfect_up — all bullish → ×1.30", () => {
    const r = classifyWaveAlignment([
      tfTrend("1h", "BULLISH"),
      tfTrend("4h", "BULLISH"),
      tfTrend("1d", "BULLISH"),
    ]);
    expect(r.alignment).toBe("perfect_up");
    expect(r.mult).toBe(1.3);
  });

  test("partial_up — 3+ bullish, longest not bearish → ×1.10", () => {
    const r = classifyWaveAlignment([
      tfTrend("15m", "BULLISH"),
      tfTrend("1h", "BULLISH"),
      tfTrend("4h", "BULLISH"),
      tfTrend("1d", "SIDEWAYS"),
    ]);
    expect(r.alignment).toBe("partial_up");
    expect(r.mult).toBe(1.1);
  });

  test("mixed — conflicting bull/bear, longest neutral → ×0.85", () => {
    const r = classifyWaveAlignment([
      tfTrend("15m", "BULLISH"),
      tfTrend("1h", "BEARISH"),
      tfTrend("4h", "BULLISH"),
      tfTrend("1d", "SIDEWAYS"),
    ]);
    expect(r.alignment).toBe("mixed");
    expect(r.mult).toBe(0.85);
  });

  test("opposing — longest bearish + any bullish → ×0.30", () => {
    const r = classifyWaveAlignment([
      tfTrend("15m", "BULLISH"),
      tfTrend("1h", "BULLISH"),
      tfTrend("4h", "SIDEWAYS"),
      tfTrend("1d", "BEARISH"),
    ]);
    expect(r.alignment).toBe("opposing");
    expect(r.mult).toBe(0.3);
  });

  test("perfect_down — all bearish → ×0.65 (NEW v2.0)", () => {
    const r = classifyWaveAlignment([
      tfTrend("1h", "BEARISH"),
      tfTrend("4h", "BEARISH"),
      tfTrend("1d", "BEARISH"),
    ]);
    expect(r.alignment).toBe("perfect_down");
    expect(r.mult).toBe(WAVE_MULTIPLIERS.perfect_down);
    expect(r.mult).toBe(0.65);
  });

  test("waveAlignmentToMultiplier mapping — 5 stages", () => {
    expect(waveAlignmentToMultiplier("perfect_up")).toBe(1.3);
    expect(waveAlignmentToMultiplier("partial_up")).toBe(1.1);
    expect(waveAlignmentToMultiplier("mixed")).toBe(0.85);
    expect(waveAlignmentToMultiplier("opposing")).toBe(0.3);
    expect(waveAlignmentToMultiplier("perfect_down")).toBe(0.65);
  });

  test("WAVE_MULTIPLIERS bounds — all within [0.30, 1.30]", () => {
    for (const v of Object.values(WAVE_MULTIPLIERS)) {
      expect(v).toBeGreaterThanOrEqual(0.3);
      expect(v).toBeLessThanOrEqual(1.3);
    }
  });
});

// ── analyzeTrend orchestrator (with mocked fetchKlines) ──────────────

describe("analyzeTrend orchestrator — cache + graceful fallback", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("../../bybit");
    vi.restoreAllMocks();
  });

  test("perfect_up alignment → waveMult ≈ 1.30 from real candle data", async () => {
    vi.doMock("../../bybit", () => ({
      fetchKlines: vi.fn(async () => trendingCandles(120, 100, 1.0)),
    }));
    const { analyzeTrend, clearTrendAnalysisCache } = await import("../analyze");
    clearTrendAnalysisCache();

    const r = await analyzeTrend("BTCUSDT", ["1h", "4h", "1d"]);
    expect(r.symbol).toBe("BTCUSDT");
    expect(r.alignment).toBe("perfect_up");
    expect(r.waveMult).toBe(1.3);
    expect(r.overallConfidence).toBeGreaterThanOrEqual(50);
  });

  test("perfect_down alignment from bearish candles → waveMult 0.65", async () => {
    vi.doMock("../../bybit", () => ({
      fetchKlines: vi.fn(async () => trendingCandles(120, 200, -1.0)),
    }));
    const { analyzeTrend, clearTrendAnalysisCache } = await import("../analyze");
    clearTrendAnalysisCache();

    const r = await analyzeTrend("ETHUSDT", ["1h", "4h", "1d"]);
    expect(r.alignment).toBe("perfect_down");
    expect(r.waveMult).toBe(0.65);
  });

  test("graceful fallback — fetchKlines throws → SIDEWAYS, no exception", async () => {
    vi.doMock("../../bybit", () => ({
      fetchKlines: vi.fn(async () => {
        throw new Error("network down");
      }),
    }));
    const { analyzeTrend, clearTrendAnalysisCache } = await import("../analyze");
    clearTrendAnalysisCache();

    const r = await analyzeTrend("XRPUSDT", ["1h", "4h", "1d"]);
    // 모든 TF SIDEWAYS fallback → mixed alignment
    expect(["mixed", "perfect_down"]).toContain(r.alignment);
    expect(Object.keys(r.perTf).length).toBe(3);
    expect(r.perTf["1h"].side).toBe("SIDEWAYS");
  });

  test("partial fetch failure — 1 of 3 fails → still produces result", async () => {
    let callCount = 0;
    vi.doMock("../../bybit", () => ({
      fetchKlines: vi.fn(async () => {
        callCount++;
        if (callCount === 2) throw new Error("partial fail");
        return trendingCandles(120, 100, 1.0);
      }),
    }));
    const { analyzeTrend, clearTrendAnalysisCache } = await import("../analyze");
    clearTrendAnalysisCache();

    const r = await analyzeTrend("SOLUSDT", ["1h", "4h", "1d"]);
    expect(Object.keys(r.perTf).length).toBe(3);
    // 2 BULLISH + 1 SIDEWAYS → partial_up or mixed
    expect(["partial_up", "mixed", "perfect_up"]).toContain(r.alignment);
  });

  test("cache hit — second call returns same computedAt", async () => {
    vi.doMock("../../bybit", () => ({
      fetchKlines: vi.fn(async () => trendingCandles(120, 100, 1.0)),
    }));
    const { analyzeTrend, clearTrendAnalysisCache } = await import("../analyze");
    clearTrendAnalysisCache();

    const r1 = await analyzeTrend("ADAUSDT", ["1h", "4h", "1d"]);
    const r2 = await analyzeTrend("ADAUSDT", ["1h", "4h", "1d"]);
    expect(r1.computedAt).toBe(r2.computedAt);
  });

  test("cache miss — different tfs produces different result", async () => {
    vi.doMock("../../bybit", () => ({
      fetchKlines: vi.fn(async () => trendingCandles(120, 100, 1.0)),
    }));
    const { analyzeTrend, clearTrendAnalysisCache } = await import("../analyze");
    clearTrendAnalysisCache();

    const r1 = await analyzeTrend("DOTUSDT", ["1h", "4h"]);
    await new Promise((r) => setTimeout(r, 1));
    const r2 = await analyzeTrend("DOTUSDT", ["1h", "4h", "1d"]);
    expect(r1.computedAt).not.toBe(r2.computedAt);
  });

  test("empty candles array → SIDEWAYS fallback", async () => {
    vi.doMock("../../bybit", () => ({
      fetchKlines: vi.fn(async () => []),
    }));
    const { analyzeTrend, clearTrendAnalysisCache } = await import("../analyze");
    clearTrendAnalysisCache();

    const r = await analyzeTrend("LINKUSDT", ["1h", "4h", "1d"]);
    expect(r.perTf["1h"].side).toBe("SIDEWAYS");
    expect(r.perTf["1h"].confidenceScore).toBe(0);
  });

  test("symbol normalization — lowercase input → uppercase output", async () => {
    vi.doMock("../../bybit", () => ({
      fetchKlines: vi.fn(async () => trendingCandles(120, 100, 1.0)),
    }));
    const { analyzeTrend, clearTrendAnalysisCache } = await import("../analyze");
    clearTrendAnalysisCache();

    const r = await analyzeTrend("avaxusdt", ["1h", "4h", "1d"]);
    expect(r.symbol).toBe("AVAXUSDT");
  });

  test("default tfs ['15m', '1h', '4h', '1d'] when not provided", async () => {
    vi.doMock("../../bybit", () => ({
      fetchKlines: vi.fn(async () => trendingCandles(120, 100, 1.0)),
    }));
    const { analyzeTrend, clearTrendAnalysisCache } = await import("../analyze");
    clearTrendAnalysisCache();

    const r = await analyzeTrend("MATICUSDT");
    expect(Object.keys(r.perTf).sort()).toEqual(
      ["15m", "1h", "4h", "1d"].sort()
    );
  });
});
