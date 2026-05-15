/**
 * bbdx-combined strategy unit tests (2026-05-15).
 *
 * 검증 범위:
 *   1. Strategy registration (registry lookup, side="both", listStrategies)
 *   2. Sentinel behavior — shouldEnter 항상 false, getEntryParams no-op
 *   3. extractAllSignals(strategy="bbdx-combined") 가 trade 0 반환 (방어)
 *   4. computeMetricsBySide 와 computeMetrics 정합성 — LONG/SHORT/combined
 *   5. winRate 정확성 — 사용자 명세 예제 (long 60% + short 40% → combined 53.3%)
 *   6. signal-extractor 가 bbdx / bbdx-short 양쪽 호출 가능 (각 side 별 trade 생성 가능성)
 */

import { describe, test, expect } from "vitest";
import "../strategies"; // side-effect: registry 등록
import { getStrategy, STRATEGY_REGISTRY } from "../strategies/types";
import { bbdxCombinedStrategy } from "../strategies/bbdx-combined";
import { listStrategies } from "../strategies";
import { extractAllSignals, extractSignalsFromCandles } from "../signal-extractor";
import {
  computeMetrics,
  computeMetricsBySide,
} from "../metrics";
import type { BacktestTrade, BacktestConfig } from "../types";
import type { Candle, TechnicalIndicators } from "@shared/types";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeTrade(opts: Partial<BacktestTrade> & { returnPct: number; win: boolean }): BacktestTrade {
  return {
    signalTs: 1700000000000,
    symbol: "BTCUSDT",
    tf: "4h",
    entryPrice: 100,
    target: 105,
    target2: 110,
    stopLoss: 95,
    signalStrength: 60,
    rsi: 30,
    bbLower: 90,
    bbMiddle: 100,
    bbUpper: 110,
    adx: 18,
    plusDi: 25,
    minusDi: 20,
    exitPrice: 105,
    exitTs: 1700100000000,
    exitReason: "target_hit",
    maxFavorable: 5,
    maxAdverse: 1,
    holdingCandles: 10,
    side: "long",
    ...opts,
  };
}

function makeCandles(n: number): Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    openTime: i * 1000,
    open: 100,
    high: 105,
    low: 95,
    close: 100,
    volume: 1000,
    closeTime: i * 1000 + 999,
  }));
}

const baseConfig: BacktestConfig = {
  symbols: ["BTCUSDT"],
  tf: "4h",
  startDate: new Date("2024-01-01"),
  endDate: new Date("2024-06-01"),
  minWarmupCandles: 60,
  outcomeWindowCandles: 42,
  cooldownCandles: 5,
  saveToDb: false,
};

// ── Strategy registration ─────────────────────────────────────────────────

describe("bbdx-combined: registry registration", () => {
  test("STRATEGY_REGISTRY 에 bbdx-combined 등록", () => {
    const s = getStrategy("bbdx-combined");
    expect(s.name).toBe("bbdx-combined");
    expect(s.label).toBe("BBDX v6.6 (LONG+SHORT)");
  });

  test("side === 'both'", () => {
    const s = getStrategy("bbdx-combined");
    expect(s.side).toBe("both");
  });

  test("dimensionsCovered 는 sub-strategy 의 union", () => {
    const s = getStrategy("bbdx-combined");
    // bbdx + bbdx-short 둘 다 [1,2,3,5]
    expect(s.dimensionsCovered).toEqual([1, 2, 3, 5]);
  });

  test("listStrategies 에 bbdx-combined 포함", () => {
    const all = listStrategies();
    const names = all.map((s) => s.name);
    expect(names).toContain("bbdx-combined");
    const combined = all.find((s) => s.name === "bbdx-combined");
    expect(combined?.label).toBe("BBDX v6.6 (LONG+SHORT)");
    expect(combined?.description).toContain("LONG + SHORT");
  });

  test("bbdx, bbdx-short, bbdx-combined 모두 등록됨", () => {
    expect(STRATEGY_REGISTRY.has("bbdx")).toBe(true);
    expect(STRATEGY_REGISTRY.has("bbdx-short")).toBe(true);
    expect(STRATEGY_REGISTRY.has("bbdx-combined")).toBe(true);
  });
});

// ── Sentinel behavior (방어용 stub) ───────────────────────────────────────

describe("bbdx-combined: sentinel strategy (runner 가 분기 처리해야 함)", () => {
  test("shouldEnter 는 항상 entry=false 반환", () => {
    const candles = makeCandles(200);
    const indicators: TechnicalIndicators = {
      rsi: 30,
      bbUpper: 110,
      bbMiddle: 100,
      bbLower: 90,
      adx: 18,
      plusDi: 25,
      minusDi: 20,
    };
    const r = bbdxCombinedStrategy.shouldEnter(candles, 150, indicators, candles.slice(-200));
    expect(r.entry).toBe(false);
  });

  test("getEntryParams 는 entry 그대로 + signalStrength=0", () => {
    const candles = makeCandles(200);
    const indicators: TechnicalIndicators = {
      rsi: 30,
      bbUpper: 110,
      bbMiddle: 100,
      bbLower: 90,
      adx: 18,
      plusDi: 25,
      minusDi: 20,
    };
    const params = bbdxCombinedStrategy.getEntryParams(candles, 150, indicators, 100, candles.slice(-200));
    expect(params.target1).toBe(100);
    expect(params.target2).toBe(100);
    expect(params.stopLoss).toBe(100);
    expect(params.signalStrength).toBe(0);
  });

  test("extractSignalsFromCandles(strategy='bbdx-combined') → 0 trade", () => {
    const candles = makeCandles(300);
    const trades = extractSignalsFromCandles("BTCUSDT", candles, {
      ...baseConfig,
      strategy: "bbdx-combined",
    });
    expect(trades).toEqual([]);
  });

  test("extractAllSignals(strategy='bbdx-combined') → 0 trade (signal-extractor 단독 호출 시)", () => {
    const map = new Map<string, Candle[]>();
    map.set("BTCUSDT", makeCandles(300));
    const trades = extractAllSignals(map, {
      ...baseConfig,
      strategy: "bbdx-combined",
    });
    expect(trades).toEqual([]);
  });
});

// ── computeMetricsBySide 정합성 ──────────────────────────────────────────

describe("bbdx-combined: computeMetricsBySide 와 computeMetrics 정합성", () => {
  test("empty trades → 양쪽 side 모두 totalTrades=0", () => {
    const r = computeMetricsBySide([]);
    expect(r.long.totalTrades).toBe(0);
    expect(r.short.totalTrades).toBe(0);
  });

  test("LONG only — long metrics 만 채워짐, short = 0", () => {
    const trades: BacktestTrade[] = [
      makeTrade({ side: "long", returnPct: 3, win: true }),
      makeTrade({ side: "long", returnPct: -2, win: false }),
      makeTrade({ side: "long", returnPct: 5, win: true }),
    ];
    const bySide = computeMetricsBySide(trades);
    expect(bySide.long.totalTrades).toBe(3);
    expect(bySide.long.wins).toBe(2);
    expect(bySide.short.totalTrades).toBe(0);
    const combined = computeMetrics(trades);
    expect(combined.totalTrades).toBe(3);
    expect(combined.wins).toBe(2);
  });

  test("SHORT only — short metrics 만 채워짐, long = 0", () => {
    const trades: BacktestTrade[] = [
      makeTrade({ side: "short", returnPct: 4, win: true }),
      makeTrade({ side: "short", returnPct: -1, win: false }),
    ];
    const bySide = computeMetricsBySide(trades);
    expect(bySide.long.totalTrades).toBe(0);
    expect(bySide.short.totalTrades).toBe(2);
    expect(bySide.short.wins).toBe(1);
    const combined = computeMetrics(trades);
    expect(combined.totalTrades).toBe(2);
    expect(combined.wins).toBe(1);
  });

  test("LONG + SHORT 혼합 — 양쪽 분리 + combined 합산", () => {
    const trades: BacktestTrade[] = [
      makeTrade({ side: "long", returnPct: 5, win: true }),
      makeTrade({ side: "long", returnPct: -3, win: false }),
      makeTrade({ side: "long", returnPct: 4, win: true }),
      makeTrade({ side: "short", returnPct: 2, win: true }),
      makeTrade({ side: "short", returnPct: -1, win: false }),
    ];
    const bySide = computeMetricsBySide(trades);
    expect(bySide.long.totalTrades).toBe(3);
    expect(bySide.long.wins).toBe(2);
    expect(bySide.long.winRate).toBeCloseTo(2 / 3, 4);
    expect(bySide.short.totalTrades).toBe(2);
    expect(bySide.short.wins).toBe(1);
    expect(bySide.short.winRate).toBe(0.5);

    const combined = computeMetrics(trades);
    expect(combined.totalTrades).toBe(5);
    expect(combined.wins).toBe(3); // 2 long + 1 short
    expect(combined.winRate).toBe(0.6); // 3/5
  });

  test("사용자 명세 예제: long 10건 중 6승 (60%) + short 5건 중 2승 (40%) → combined 53.3% (15건 중 8승)", () => {
    const longTrades: BacktestTrade[] = [
      ...Array.from({ length: 6 }, () =>
        makeTrade({ side: "long", returnPct: 3, win: true }),
      ),
      ...Array.from({ length: 4 }, () =>
        makeTrade({ side: "long", returnPct: -2, win: false }),
      ),
    ];
    const shortTrades: BacktestTrade[] = [
      ...Array.from({ length: 2 }, () =>
        makeTrade({ side: "short", returnPct: 4, win: true }),
      ),
      ...Array.from({ length: 3 }, () =>
        makeTrade({ side: "short", returnPct: -1, win: false }),
      ),
    ];
    const all = [...longTrades, ...shortTrades];

    const bySide = computeMetricsBySide(all);
    expect(bySide.long.totalTrades).toBe(10);
    expect(bySide.long.wins).toBe(6);
    expect(bySide.long.winRate).toBe(0.6);
    expect(bySide.short.totalTrades).toBe(5);
    expect(bySide.short.wins).toBe(2);
    expect(bySide.short.winRate).toBe(0.4);

    const combined = computeMetrics(all);
    expect(combined.totalTrades).toBe(15);
    expect(combined.wins).toBe(8);
    expect(combined.winRate).toBeCloseTo(8 / 15, 4); // ≈ 0.5333
  });
});

// ── runner 분기 시뮬레이션 (LONG + SHORT trades concat → side 별 metric) ──

describe("bbdx-combined: runner-style concat + metricsBySide 형태", () => {
  test("LONG/SHORT trade 배열 concat 후 sort + metricsBySide 정규화", () => {
    const longTrades: BacktestTrade[] = [
      makeTrade({ side: "long", signalTs: 1000, returnPct: 3, win: true }),
      makeTrade({ side: "long", signalTs: 3000, returnPct: -2, win: false }),
    ];
    const shortTrades: BacktestTrade[] = [
      makeTrade({ side: "short", signalTs: 2000, returnPct: 5, win: true }),
    ];
    const combined = [...longTrades, ...shortTrades].sort(
      (a, b) => a.signalTs - b.signalTs,
    );
    expect(combined.map((t) => t.signalTs)).toEqual([1000, 2000, 3000]);

    const bySide = computeMetricsBySide(combined);
    const longMetrics = bySide.long.totalTrades > 0 ? bySide.long : null;
    const shortMetrics = bySide.short.totalTrades > 0 ? bySide.short : null;
    const overall = computeMetrics(combined);
    const metricsBySide = {
      long: longMetrics,
      short: shortMetrics,
      combined: overall,
    };

    expect(metricsBySide.long).not.toBeNull();
    expect(metricsBySide.long?.totalTrades).toBe(2);
    expect(metricsBySide.short).not.toBeNull();
    expect(metricsBySide.short?.totalTrades).toBe(1);
    expect(metricsBySide.combined.totalTrades).toBe(3);
    expect(metricsBySide.combined.wins).toBe(2);
  });

  test("LONG 0건이면 metricsBySide.long === null 정규화", () => {
    const trades: BacktestTrade[] = [
      makeTrade({ side: "short", returnPct: 4, win: true }),
    ];
    const bySide = computeMetricsBySide(trades);
    const longMetrics = bySide.long.totalTrades > 0 ? bySide.long : null;
    const shortMetrics = bySide.short.totalTrades > 0 ? bySide.short : null;
    expect(longMetrics).toBeNull();
    expect(shortMetrics).not.toBeNull();
  });

  test("SHORT 0건이면 metricsBySide.short === null 정규화", () => {
    const trades: BacktestTrade[] = [
      makeTrade({ side: "long", returnPct: 3, win: true }),
    ];
    const bySide = computeMetricsBySide(trades);
    const longMetrics = bySide.long.totalTrades > 0 ? bySide.long : null;
    const shortMetrics = bySide.short.totalTrades > 0 ? bySide.short : null;
    expect(longMetrics).not.toBeNull();
    expect(shortMetrics).toBeNull();
  });
});

// ── signal-extractor 가 bbdx + bbdx-short 각각 호출 가능 ──────────────────

describe("bbdx-combined: signal-extractor 가 양쪽 sub-strategy 모두 호출 가능", () => {
  test("strategy='bbdx' 로 extractAllSignals 호출 가능 (등록 확인)", () => {
    const map = new Map<string, Candle[]>();
    map.set("BTCUSDT", makeCandles(200));
    // 캔들이 평탄해서 시그널 0 이 정상 — 함수 호출 자체가 throw 하지 않는 것을 확인
    const trades = extractAllSignals(map, { ...baseConfig, strategy: "bbdx" });
    expect(Array.isArray(trades)).toBe(true);
  });

  test("strategy='bbdx-short' 로 extractAllSignals 호출 가능 (등록 확인)", () => {
    const map = new Map<string, Candle[]>();
    map.set("BTCUSDT", makeCandles(200));
    const trades = extractAllSignals(map, {
      ...baseConfig,
      strategy: "bbdx-short",
    });
    expect(Array.isArray(trades)).toBe(true);
  });

  test("LONG + SHORT 호출 후 concat 한 trade 의 side 필드 분포 확인", () => {
    // 실제 데이터로는 시그널이 안 나올 수 있으므로 fake trade 로 concat 형태만 검증
    const longTrades: BacktestTrade[] = [
      makeTrade({ side: "long", returnPct: 2, win: true }),
      makeTrade({ side: "long", returnPct: 3, win: true }),
    ];
    const shortTrades: BacktestTrade[] = [
      makeTrade({ side: "short", returnPct: 1, win: true }),
    ];
    const all = [...longTrades, ...shortTrades];
    const sides = all.map((t) => t.side);
    expect(sides.filter((s) => s === "long")).toHaveLength(2);
    expect(sides.filter((s) => s === "short")).toHaveLength(1);
  });
});
