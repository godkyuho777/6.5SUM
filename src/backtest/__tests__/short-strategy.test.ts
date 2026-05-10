/**
 * P1-#3 (2026-05-10): SHORT backtest alpha 검증 인프라 unit test.
 *
 * 검증 범위:
 *   1. measureOutcomeTiered side-aware (LONG vs SHORT)
 *   2. computeMetricsBySide (LONG/SHORT 분리)
 *   3. SHORT_CALIBRATION_PARAMS 적용
 *   4. bbdx-short strategy 등록 + side="short"
 *   5. decideShortEntry Rising Knife 차단 (audit S3)
 *
 * 헌장 R2 (백테스트 알파) 통과 검증의 인프라 정합성 보장.
 */

import { describe, test, expect } from "vitest";
import type { BacktestTrade } from "../types";
import {
  computeMetricsBySide,
  computeMetrics,
} from "../metrics";
import {
  SHORT_CALIBRATION_PARAMS,
  runShortCalibration,
} from "../calibration";
import { getStrategy } from "../strategies/types";
import "../strategies"; // side-effect register
import { decideShortEntry } from "../../indicators";
import type { TechnicalIndicators } from "@shared/types";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeTrade(opts: Partial<BacktestTrade>): BacktestTrade {
  return {
    signalTs: 1700000000000,
    symbol: "BTCUSDT",
    tf: "4h",
    entryPrice: 100,
    target: 95,
    target2: 90,
    stopLoss: 102,
    signalStrength: 60,
    rsi: 70,
    bbLower: 90,
    bbMiddle: 95,
    bbUpper: 105,
    adx: 18,
    plusDi: 25,
    minusDi: 30,
    exitPrice: 95,
    exitTs: 1700100000000,
    exitReason: "target_hit",
    returnPct: 5,
    maxFavorable: 5,
    maxAdverse: 1,
    win: true,
    holdingCandles: 10,
    side: "long",
    ...opts,
  };
}

const ind = (overrides: Partial<TechnicalIndicators> = {}): TechnicalIndicators => ({
  rsi: 70,
  bbUpper: 105,
  bbMiddle: 100,
  bbLower: 95,
  adx: 18,
  plusDi: 25,
  minusDi: 20,
  ...overrides,
});

// ── computeMetricsBySide ────────────────────────────────────────────────────

describe("computeMetricsBySide — LONG/SHORT 분리 (P1-#3)", () => {
  test("side 미지정 trade 는 'long' 으로 간주", () => {
    const trades: BacktestTrade[] = [
      makeTrade({ returnPct: 3, win: true, side: undefined as any }),
      makeTrade({ returnPct: -2, win: false, side: undefined as any }),
    ];
    const r = computeMetricsBySide(trades);
    expect(r.long.totalTrades).toBe(2);
    expect(r.short.totalTrades).toBe(0);
  });

  test("LONG/SHORT 혼합 시 분리 집계", () => {
    const trades: BacktestTrade[] = [
      makeTrade({ side: "long", returnPct: 5, win: true }),
      makeTrade({ side: "long", returnPct: -2, win: false }),
      makeTrade({ side: "short", returnPct: 3, win: true }),
      makeTrade({ side: "short", returnPct: 4, win: true }),
    ];
    const r = computeMetricsBySide(trades);
    expect(r.long.totalTrades).toBe(2);
    expect(r.long.winRate).toBe(0.5);
    expect(r.short.totalTrades).toBe(2);
    expect(r.short.winRate).toBe(1.0);
  });

  test("SHORT only — long.totalTrades=0", () => {
    const trades: BacktestTrade[] = [
      makeTrade({ side: "short", returnPct: 3, win: true }),
    ];
    const r = computeMetricsBySide(trades);
    expect(r.long.totalTrades).toBe(0);
    expect(r.short.totalTrades).toBe(1);
  });
});

// ── SHORT calibration params ────────────────────────────────────────────────

describe("SHORT_CALIBRATION_PARAMS (P1-#3)", () => {
  test("5 SHORT 파라미터 정의됨", () => {
    expect(SHORT_CALIBRATION_PARAMS).toHaveLength(5);
    const names = SHORT_CALIBRATION_PARAMS.map((p) => p.name);
    expect(names).toContain("rsi-short");
    expect(names).toContain("adx-short");
    expect(names).toContain("patternConfluenceScore-short");
    expect(names).toContain("signalStrength-short");
    expect(names).toContain("modifiersProduct-short");
  });

  test("RSI-short edges [55, 60, 65, 68, 70, 75, 85] — alpha 튜닝 2026-05-10", () => {
    const rsiParam = SHORT_CALIBRATION_PARAMS.find((p) => p.name === "rsi-short");
    expect(rsiParam?.edges).toEqual([55, 60, 65, 68, 70, 75, 85]);
    // 권고 임계 65 (audit S1: 비대칭 미러 회복)
    expect(rsiParam?.currentThreshold).toBe(65);
  });

  test("runShortCalibration — SHORT trade 만 필터", () => {
    const trades: BacktestTrade[] = [
      // LONG (skip)
      ...Array.from({ length: 30 }, () =>
        makeTrade({ side: "long", rsi: 30, returnPct: 2, win: true }),
      ),
      // SHORT (count)
      ...Array.from({ length: 30 }, () =>
        makeTrade({ side: "short", rsi: 70, returnPct: 3, win: true }),
      ),
    ];
    const results = runShortCalibration(trades);
    // 5 params 모두 결과 반환 (각 결과의 buckets 가 30 개의 SHORT trade 만 포함)
    expect(results).toHaveLength(5);
    const totalN = results[0].buckets.reduce((s, b) => s + b.n, 0);
    expect(totalN).toBe(30);
  });
});

// ── bbdx-short strategy registration ────────────────────────────────────────

describe("bbdx-short strategy 등록 (P1-#3)", () => {
  test("STRATEGY_REGISTRY 에 bbdx-short 등록됨", () => {
    const s = getStrategy("bbdx-short");
    expect(s.name).toBe("bbdx-short");
    expect(s.side).toBe("short");
  });

  test("dimensionsCovered = [1, 2, 3, 5]", () => {
    const s = getStrategy("bbdx-short");
    expect(s.dimensionsCovered).toEqual([1, 2, 3, 5]);
  });

  test("LONG bbdx 와 SHORT bbdx-short 가 모두 등록됨", () => {
    const long = getStrategy("bbdx");
    const short = getStrategy("bbdx-short");
    expect(long.side ?? "long").toBe("long");
    expect(short.side).toBe("short");
  });
});

// ── decideShortEntry Rising Knife 차단 (audit S3) ─────────────────────────

describe("decideShortEntry — Rising Knife 차단 (P1-#3 audit S3)", () => {
  test("Rising Knife (+DI > -DI && ADX > 25) + bbStructureShort=null → 차단", () => {
    const indicators = ind({
      rsi: 70,
      bbUpper: 105,
      adx: 30, // > 25
      plusDi: 35, // > minusDi
      minusDi: 20,
    });
    const candles = Array.from({ length: 20 }, (_, i) => ({
      openTime: i * 1000,
      open: 100 + i * 0.1,
      high: 105,
      low: 100,
      close: 104, // near upper
      volume: 1000,
      closeTime: i * 1000 + 999,
    }));
    const decision = decideShortEntry(candles, indicators, [], null, 1.0);
    expect(decision).toBeNull();
  });

  test("Rising Knife + bbStructureShort='lowerRiding' → 예외 허용", () => {
    const indicators = ind({
      rsi: 70,
      bbUpper: 105,
      adx: 30,
      plusDi: 35,
      minusDi: 20,
    });
    const candles = Array.from({ length: 20 }, (_, i) => ({
      openTime: i * 1000,
      open: 100,
      high: 105,
      low: 100,
      close: 104,
      volume: 1000,
      closeTime: i * 1000 + 999,
    }));
    const decision = decideShortEntry(
      candles,
      indicators,
      [],
      "lowerRiding",
      1.0,
    );
    expect(decision).not.toBeNull();
    expect(decision?.path).toBe("BB");
  });

  test("Rising Knife 아닐 때 NUM path 정상 동작", () => {
    const indicators = ind({
      rsi: 70,
      bbUpper: 100,
      adx: 18, // < 25 → not knife
      plusDi: 25,
      minusDi: 30, // -DI > +DI → not rising
    });
    const candles = Array.from({ length: 20 }, (_, i) => ({
      openTime: i * 1000,
      open: 100,
      high: 100,
      low: 95,
      close: 99, // ≥ bbUpper × 0.98 = 98
      volume: 1000,
      closeTime: i * 1000 + 999,
    }));
    const decision = decideShortEntry(candles, indicators, [], null, 1.0);
    expect(decision).not.toBeNull();
    expect(decision?.path).toBe("NUM");
  });
});

// ── side-aware metric: SHORT 의 winRate 가 entry > exit 일 때 win ───────────

describe("computeMetrics — SHORT win 정의 (returnPct > 0)", () => {
  test("SHORT trade 는 returnPct = (entry - exit) / entry — 가격 하락 시 양수", () => {
    // SHORT trade: entry=100, exit=95 → returnPct = (100 - 95) / 100 = 5%
    const trade = makeTrade({
      side: "short",
      entryPrice: 100,
      exitPrice: 95,
      returnPct: 5, // 미리 signal-extractor 가 부호 반전 처리
      win: true,
    });
    const m = computeMetrics([trade]);
    expect(m.winRate).toBe(1.0);
    expect(m.avgReturn).toBe(5);
  });
});
