/**
 * Tests for timeline-builder (3-layer LayeredSnapshot).
 * DUAL_BACKTEST_ENGINE_PLAN §1.2 + §1.3.
 */

import { describe, expect, test } from "vitest";
import type { Candle } from "@shared/types";
import {
  assertNoLookahead,
  type Timeline,
  EMPTY_WAVE_LAYER,
  mapToDimensions,
} from "../timeline-types";
import {
  buildTimeline,
  createMacroDataPoint,
  type MacroDataPoint,
} from "../timeline-builder";

// ─── Helpers ────────────────────────────────────────────────────────────

const INTERVAL_4H_MS = 4 * 60 * 60 * 1000;

function makeCandle(ts: number, base: number, vol = 1000): Candle {
  return {
    openTime: ts,
    open: base,
    high: base * 1.01,
    low: base * 0.99,
    close: base * 1.005,
    volume: vol,
    closeTime: ts + INTERVAL_4H_MS,
  };
}

function makeCandles(startMs: number, n: number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    out.push(makeCandle(startMs + i * INTERVAL_4H_MS, 100 + i * 0.5));
  }
  return out;
}

// ─── Layer 1 only build ─────────────────────────────────────────────────

describe("buildTimeline — Layer 1 only", () => {
  test("returns one snapshot per candle, signal layer populated", async () => {
    const candles = makeCandles(1_700_000_000_000, 30);
    const tl = await buildTimeline({
      symbol: "BTCUSDT",
      tf: "4h",
      startMs: candles[0].openTime,
      endMs: candles[candles.length - 1].openTime,
      mode: "realtime",
      candlesOverride: candles,
      macroOverride: null,
    });
    expect(tl.length).toBe(candles.length);
    expect(tl[0].symbol).toBe("BTCUSDT");
    expect(tl[0].signal).toBeDefined();
    expect(typeof tl[0].signal.rsi).toBe("number");
    expect(tl[0].macro).toBeNull();
    expect(tl[0].wave).toEqual(EMPTY_WAVE_LAYER);
  });

  test("empty candles → empty timeline", async () => {
    const tl = await buildTimeline({
      symbol: "BTCUSDT",
      tf: "4h",
      startMs: 0,
      endMs: 0,
      mode: "realtime",
      candlesOverride: [],
      macroOverride: null,
    });
    expect(tl).toEqual([]);
  });
});

// ─── 3-layer build with mock macro ─────────────────────────────────────

describe("buildTimeline — 3-layer integration with mock macro", () => {
  test("macro forward-fills onto candles after release_ts", async () => {
    const start = 1_700_000_000_000;
    const candles = makeCandles(start, 10);
    // release at candle index 3
    const releaseTs = candles[3].openTime;
    const macroPoint: MacroDataPoint = createMacroDataPoint({
      snapshot_ts: releaseTs,
      release_ts: releaseTs,
      raw: {
        sofr: 4.35,
        iorb: 4.3,
        vix: 22,
        dxy_change_30d_pct: -0.01,
        fed_funds: 5,
        cpi_yoy: 3,
        dgs10: 4.5,
        dgs2: 4.2,
      },
      history: [],
    });
    const tl = await buildTimeline({
      symbol: "BTCUSDT",
      tf: "4h",
      startMs: start,
      endMs: candles[candles.length - 1].openTime,
      mode: "realtime",
      candlesOverride: candles,
      macroOverride: [macroPoint],
    });
    expect(tl[0].macro).toBeNull();
    expect(tl[2].macro).toBeNull();
    // Boundary: release_ts == candle.ts → 적용 됨
    expect(tl[3].macro).not.toBeNull();
    expect(tl[3].macro?.release_ts).toBe(releaseTs);
    // age_hours == 0 at release boundary
    expect(tl[3].macro?.age_hours).toBe(0);
    // Later candles inherit
    expect(tl[5].macro).not.toBeNull();
    expect(tl[5].macro?.age_hours).toBeGreaterThan(0);
  });

  test("look-ahead boundary: release_ts > candle.ts → not applied (no throw)", async () => {
    const start = 1_700_000_000_000;
    const candles = makeCandles(start, 5);
    // release 1ms after candle[3] opens — not applied to candle[3]
    const releaseTs = candles[3].openTime + 1;
    const macroPoint = createMacroDataPoint({
      snapshot_ts: releaseTs,
      release_ts: releaseTs,
      raw: { sofr: 4.5, iorb: 4.3, vix: 25 },
    });
    const tl = await buildTimeline({
      symbol: "BTCUSDT",
      tf: "4h",
      startMs: start,
      endMs: candles[candles.length - 1].openTime,
      mode: "realtime",
      candlesOverride: candles,
      macroOverride: [macroPoint],
    });
    // candle[3] released after candle.ts → macro stays null
    expect(tl[3].macro).toBeNull();
    // candle[4] (next bar) sees it
    expect(tl[4].macro).not.toBeNull();
  });

  test("dimensions auto-populated from layers", async () => {
    const candles = makeCandles(1_700_000_000_000, 5);
    const macroPoint = createMacroDataPoint({
      snapshot_ts: candles[0].openTime,
      release_ts: candles[0].openTime,
      raw: { sofr: 4.3, iorb: 4.3, vix: 18 },
    });
    const tl = await buildTimeline({
      symbol: "ETHUSDT",
      tf: "4h",
      startMs: candles[0].openTime,
      endMs: candles[candles.length - 1].openTime,
      mode: "realtime",
      candlesOverride: candles,
      macroOverride: [macroPoint],
    });
    expect(tl[2].dimensions.momentum).toBe(tl[2].signal.rsi);
    expect(tl[2].dimensions.volatility).toBe(tl[2].signal.bb_position_pct);
    expect(tl[2].dimensions.trend).toBe(tl[2].signal.adx);
    expect(tl[2].dimensions.macro).toBe(tl[2].macro?.score ?? null);
    expect(tl[2].dimensions.onchain).toBeNull();
  });
});

// ─── assertNoLookahead direct tests ────────────────────────────────────

describe("assertNoLookahead", () => {
  test("empty timeline passes", () => {
    expect(() => assertNoLookahead([])).not.toThrow();
  });

  test("clean timeline passes", () => {
    const ts = 1_700_000_000_000;
    const macroPoint = createMacroDataPoint({
      snapshot_ts: ts,
      release_ts: ts,
      raw: {},
    });
    const tl: Timeline = [
      {
        ts: ts + 1000,
        symbol: "BTC",
        tf: "4h",
        open: 100, high: 101, low: 99, close: 100, volume: 1,
        signal: {
          rsi: 50, bb_upper: 0, bb_middle: 0, bb_lower: 0, bb_position_pct: 0.5,
          adx: 0, diPlus: 0, diMinus: 0, atr: 0, macd_histogram: 0, volume_ratio: 1,
        },
        wave: EMPTY_WAVE_LAYER,
        macro: {
          snapshot_ts: ts,
          release_ts: ts,
          age_hours: 0,
          sofr_iorb_spread_bp: 0,
          yield_curve_10_2: 0,
          walcl_change_30d_pct: 0,
          rrp_tga_change_30d_pct: 0,
          real_rate: 0,
          dxy_change_30d_pct: 0,
          vix: 0,
          c1_crisis: 0,
          c2_riskOn: 0,
          c3_net_liquidity_30d_pct: 0,
          c4_cycle_phase: "neutral",
          bok_rate: null, bok_rate_change_90d: null, krw_usd: null, krw_change_30d_pct: null,
          score: 0,
          regime: "neutral",
          multiplier: 1,
          freshness_mult: 1,
          breakdown: {
            spread_score: 0, yield_curve_score: 0, walcl_score: 0, rrp_tga_score: 0,
            real_rate_score: 0, dxy_score: 0, vix_score: 0, korea_score: 0,
            c1_contribution: 0, c2_contribution: 0, c3_contribution: 0, c4_contribution: 0,
          },
        },
        dimensions: mapToDimensions(
          {
            rsi: 50, bb_upper: 0, bb_middle: 0, bb_lower: 0, bb_position_pct: 0.5,
            adx: 0, diPlus: 0, diMinus: 0, atr: 0, macd_histogram: 0, volume_ratio: 1,
          },
          EMPTY_WAVE_LAYER,
          null,
        ),
      },
    ];
    expect(() => assertNoLookahead(tl)).not.toThrow();
  });

  test("look-ahead detected → throws", () => {
    const candleTs = 1_700_000_000_000;
    const tl: Timeline = [
      {
        ts: candleTs,
        symbol: "BTC",
        tf: "4h",
        open: 100, high: 101, low: 99, close: 100, volume: 1,
        signal: {
          rsi: 50, bb_upper: 0, bb_middle: 0, bb_lower: 0, bb_position_pct: 0.5,
          adx: 0, diPlus: 0, diMinus: 0, atr: 0, macd_histogram: 0, volume_ratio: 1,
        },
        wave: EMPTY_WAVE_LAYER,
        macro: {
          snapshot_ts: candleTs + 10_000,
          release_ts: candleTs + 10_000, // FUTURE
          age_hours: 0,
          sofr_iorb_spread_bp: 0, yield_curve_10_2: 0, walcl_change_30d_pct: 0,
          rrp_tga_change_30d_pct: 0, real_rate: 0, dxy_change_30d_pct: 0, vix: 0,
          c1_crisis: 0, c2_riskOn: 0, c3_net_liquidity_30d_pct: 0,
          c4_cycle_phase: "neutral",
          bok_rate: null, bok_rate_change_90d: null, krw_usd: null, krw_change_30d_pct: null,
          score: 0, regime: "neutral", multiplier: 1, freshness_mult: 1,
          breakdown: {
            spread_score: 0, yield_curve_score: 0, walcl_score: 0, rrp_tga_score: 0,
            real_rate_score: 0, dxy_score: 0, vix_score: 0, korea_score: 0,
            c1_contribution: 0, c2_contribution: 0, c3_contribution: 0, c4_contribution: 0,
          },
        },
        dimensions: { momentum: 50, volatility: 0.5, trend: 0, volume: 1, structure: 0, macro: 0, onchain: null },
      },
    ];
    expect(() => assertNoLookahead(tl)).toThrow(/Look-ahead/);
  });
});

// ─── ALFRED mode strictness via fetchFred ──────────────────────────────

describe("fetchFred ALFRED mode strict", () => {
  test("backtest mode without realtimeStart → throws", async () => {
    const { fetchFred } = await import("../../macro/sources/fred");
    await expect(
      fetchFred({ seriesId: "SOFR", mode: "backtest" }),
    ).rejects.toThrow(/ALFRED mode requires realtimeStart/);
  });

  test("backtest mode with realtimeStart but no API key → stub (no throw)", async () => {
    const old = process.env.FRED_API_KEY;
    delete process.env.FRED_API_KEY;
    try {
      const { fetchFred } = await import("../../macro/sources/fred");
      const r = await fetchFred({
        seriesId: "SOFR",
        mode: "backtest",
        realtimeStart: "2024-01-01",
        realtimeEnd: "2024-01-01",
      });
      expect(r.status).toBe("stub");
      expect(r.observations).toEqual([]);
    } finally {
      if (old !== undefined) process.env.FRED_API_KEY = old;
    }
  });

  test("realtime mode without API key → stub (no throw)", async () => {
    const old = process.env.FRED_API_KEY;
    delete process.env.FRED_API_KEY;
    try {
      const { fetchFred } = await import("../../macro/sources/fred");
      const r = await fetchFred({ seriesId: "SOFR", mode: "realtime" });
      expect(r.status).toBe("stub");
    } finally {
      if (old !== undefined) process.env.FRED_API_KEY = old;
    }
  });
});
