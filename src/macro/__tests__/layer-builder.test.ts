/**
 * MacroLayer builder tests — buildMacroLayerSnapshot + freshness multiplier.
 *
 * MACRO_LIQUIDITY_TRACKER_v2 §1.2 / §3.4.
 */

import { describe, expect, test } from "vitest";
import {
  buildMacroLayerSnapshot,
  effectiveMacroMultiplier,
  macroFreshnessMult,
  buildMacroLayer,
} from "../layer-builder";
import type { MacroLayer } from "../layer-types";

describe("buildMacroLayerSnapshot — pure", () => {
  test("empty raw → score 0, neutral regime, multiplier 1", () => {
    const ts = 1_700_000_000_000;
    const layer = buildMacroLayerSnapshot({
      snapshot_ts: ts,
      release_ts: ts,
      raw: {},
    });
    expect(layer.score).toBe(0);
    expect(layer.regime).toBe("neutral");
    expect(layer.multiplier).toBe(1);
    expect(layer.c1_crisis).toBe(0);
    expect(layer.c2_riskOn).toBe(0);
    expect(layer.c4_cycle_phase).toBe("neutral");
  });

  test("crisis composite (c1=0.7) shifts regime down 20", () => {
    const ts = 1_700_000_000_000;
    const layer = buildMacroLayerSnapshot({
      snapshot_ts: ts,
      release_ts: ts,
      raw: { sofr: 4.45, iorb: 4.3, vix: 50 }, // big spread + high vix
    });
    expect(layer.c1_crisis).toBeGreaterThan(0.6);
    // c1>0.6 triggers -20 delta on top of base spread score
    expect(layer.score).toBeLessThan(0);
  });

  test("freshness reflects age_hours", () => {
    const release = 1_700_000_000_000;
    const layer = buildMacroLayerSnapshot({
      snapshot_ts: release,
      release_ts: release,
      raw: { sofr: 4.3, iorb: 4.3 },
      as_of_ts: release + 200 * 60 * 60 * 1000, // 200h old → 0.5
    });
    expect(layer.age_hours).toBeCloseTo(200, 0);
    expect(layer.freshness_mult).toBe(0.5);
  });

  test("Korea fields propagate (null when missing)", () => {
    const ts = 1_700_000_000_000;
    const layer = buildMacroLayerSnapshot({
      snapshot_ts: ts,
      release_ts: ts,
      raw: {
        bok_rate: 3.5,
        bok_rate_change_90d: 0.005,
        krw_usd: 1350,
        krw_change_30d_pct: 0.02,
      },
    });
    expect(layer.bok_rate).toBe(3.5);
    expect(layer.krw_usd).toBe(1350);
    expect(layer.krw_change_30d_pct).toBe(0.02);

    const empty = buildMacroLayerSnapshot({
      snapshot_ts: ts,
      release_ts: ts,
      raw: {},
    });
    expect(empty.bok_rate).toBeNull();
    expect(empty.krw_usd).toBeNull();
  });

  test("breakdown.c1_contribution mirrors composite", () => {
    const ts = 1_700_000_000_000;
    const layer = buildMacroLayerSnapshot({
      snapshot_ts: ts,
      release_ts: ts,
      raw: { sofr: 4.4, iorb: 4.3, vix: 40 },
    });
    expect(layer.breakdown.c1_contribution).toBe(layer.c1_crisis);
  });
});

describe("effectiveMacroMultiplier — freshness-weighted", () => {
  function mkLayer(multiplier: number, age_hours: number): MacroLayer {
    return {
      snapshot_ts: 0,
      release_ts: 0,
      age_hours,
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
      bok_rate: null,
      bok_rate_change_90d: null,
      krw_usd: null,
      krw_change_30d_pct: null,
      score: 0,
      regime: "neutral",
      multiplier,
      freshness_mult: macroFreshnessMult(age_hours),
      breakdown: {
        spread_score: 0,
        yield_curve_score: 0,
        walcl_score: 0,
        rrp_tga_score: 0,
        real_rate_score: 0,
        dxy_score: 0,
        vix_score: 0,
        korea_score: 0,
        c1_contribution: 0,
        c2_contribution: 0,
        c3_contribution: 0,
        c4_contribution: 0,
      },
    };
  }

  test("flooded fresh stays 1.4", () => {
    expect(effectiveMacroMultiplier(mkLayer(1.4, 1))).toBeCloseTo(1.4, 4);
  });

  test("flooded stale (200h) drops to 1.2", () => {
    expect(effectiveMacroMultiplier(mkLayer(1.4, 200))).toBeCloseTo(1.2, 4);
  });

  test("crisis multiplier (0.3) weakens toward 1 when stale", () => {
    // 0.3 stale 200h → 1 + (0.3-1)*0.5 = 0.65
    expect(effectiveMacroMultiplier(mkLayer(0.3, 200))).toBeCloseTo(0.65, 4);
  });
});

describe("buildMacroLayer — stub-first (no FRED key)", () => {
  test("no FRED_API_KEY → empty array, no throw", async () => {
    const old = process.env.FRED_API_KEY;
    delete process.env.FRED_API_KEY;
    try {
      const r = await buildMacroLayer(0, Date.now(), "realtime");
      expect(Array.isArray(r)).toBe(true);
      expect(r.length).toBe(0);
    } finally {
      if (old !== undefined) process.env.FRED_API_KEY = old;
    }
  });

  test("backtest mode without key → still graceful", async () => {
    const old = process.env.FRED_API_KEY;
    delete process.env.FRED_API_KEY;
    try {
      const r = await buildMacroLayer(0, Date.now(), "backtest");
      expect(r).toEqual([]);
    } finally {
      if (old !== undefined) process.env.FRED_API_KEY = old;
    }
  });
});
