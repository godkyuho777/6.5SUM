/**
 * MacroLayer builder tests — buildMacroLayerSnapshot + freshness multiplier.
 *
 * MACRO_LIQUIDITY_TRACKER_v2 §1.2 / §3.4.
 */

import {
  describe,
  expect,
  test,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import axios from "axios";
import {
  buildMacroLayerSnapshot,
  effectiveMacroMultiplier,
  macroFreshnessMult,
  buildMacroLayer,
  buildMacroLayerRange,
  latestValid,
  valueDaysAgo,
  FRED_SERIES_FOR_LAYER,
} from "../layer-builder";
import type { MacroLayer } from "../layer-types";
import type { FredObservation } from "../sources/fred";

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

// ──────────────────────────────────────────────────────────
// helpers — latestValid / valueDaysAgo
// ──────────────────────────────────────────────────────────

describe("latestValid", () => {
  test("returns last numeric value (NaN ignored)", () => {
    const obs: FredObservation[] = [
      { date: "2024-01-01", value: 1 },
      { date: "2024-01-02", value: Number.NaN },
      { date: "2024-01-03", value: 3.5 },
      { date: "2024-01-04", value: Number.NaN },
    ];
    // 3.5 is the last finite — NaN trailing should be skipped
    expect(latestValid(obs)).toBe(3.5);
  });

  test("empty → undefined", () => {
    expect(latestValid([])).toBeUndefined();
  });

  test("all NaN → undefined", () => {
    const obs: FredObservation[] = [
      { date: "2024-01-01", value: Number.NaN },
      { date: "2024-01-02", value: Number.NaN },
    ];
    expect(latestValid(obs)).toBeUndefined();
  });
});

describe("valueDaysAgo", () => {
  test("finds closest observation to N days ago", () => {
    // latest = 2024-12-31, 30d ago target = 2024-12-01
    const obs: FredObservation[] = [
      { date: "2024-11-28", value: 100 }, // 33d ago
      { date: "2024-12-02", value: 105 }, // 29d ago — closest
      { date: "2024-12-15", value: 110 },
      { date: "2024-12-31", value: 120 }, // latest
    ];
    expect(valueDaysAgo(obs, 30)).toBe(105);
  });

  test("0 days ago → latest", () => {
    const obs: FredObservation[] = [
      { date: "2024-01-01", value: 1 },
      { date: "2024-12-31", value: 99 },
    ];
    expect(valueDaysAgo(obs, 0)).toBe(99);
  });

  test("empty → undefined", () => {
    expect(valueDaysAgo([], 30)).toBeUndefined();
  });

  test("365 days ago for YoY calc", () => {
    const obs: FredObservation[] = [
      { date: "2023-01-01", value: 290 }, // ~365d ago
      { date: "2023-06-01", value: 295 },
      { date: "2024-01-01", value: 305 }, // latest
    ];
    expect(valueDaysAgo(obs, 365)).toBe(290);
  });
});

// ──────────────────────────────────────────────────────────
// buildMacroLayerRange — multi-series fetch (mocked axios)
// ──────────────────────────────────────────────────────────

/**
 * FRED observations endpoint mocking helper. We intercept axios.get and
 * route by `series_id` query param to canned responses.
 */
function mockFredResponses(
  bySeries: Record<string, Array<{ date: string; value: string }>>,
) {
  vi.spyOn(axios, "get").mockImplementation(
    async (url: string, config?: any) => {
      // FRED observations endpoint
      if (
        typeof url === "string" &&
        url.includes("api.stlouisfed.org/fred/series/observations")
      ) {
        const seriesId = config?.params?.series_id;
        const observations = bySeries[seriesId] ?? [];
        return {
          data: { observations },
        };
      }
      // BOK Yahoo fallback (KRW=X) — return empty so no value pollutes
      if (
        typeof url === "string" &&
        url.includes("query1.finance.yahoo.com")
      ) {
        return {
          data: {
            chart: {
              result: [{ timestamp: [], indicators: { quote: [{ close: [] }] } }],
            },
          },
        };
      }
      // BOK ECOS — not used (no key) when BOK_API_KEY missing
      return { data: {} };
    },
  );
}

describe("buildMacroLayerRange — multi-series fetch", () => {
  const oldFred = process.env.FRED_API_KEY;
  const oldBok = process.env.BOK_API_KEY;

  beforeEach(() => {
    process.env.FRED_API_KEY = "test-key";
    delete process.env.BOK_API_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (oldFred !== undefined) process.env.FRED_API_KEY = oldFred;
    else delete process.env.FRED_API_KEY;
    if (oldBok !== undefined) process.env.BOK_API_KEY = oldBok;
  });

  test("populates all 12 raw fields when every series returns data", async () => {
    // Construct synthetic observations for every required series.
    // For 30d-change series we provide a 60d+ window so days-ago math works.
    mockFredResponses({
      SOFR: [
        { date: "2026-05-14", value: "3.59" },
      ],
      IORB: [
        { date: "2026-05-14", value: "3.65" },
      ],
      DGS10: [
        { date: "2026-05-14", value: "4.20" },
      ],
      DGS2: [
        { date: "2026-05-14", value: "4.50" },
      ],
      WALCL: [
        { date: "2026-04-14", value: "7700000" }, // 30d ago
        { date: "2026-05-14", value: "7000000" }, // now → -9.09% change
      ],
      RRPONTSYD: [
        { date: "2026-04-14", value: "500" },
        { date: "2026-05-14", value: "400" },
      ],
      WTREGEN: [
        { date: "2026-04-14", value: "700" },
        { date: "2026-05-14", value: "600" },
      ],
      DTWEXBGS: [
        { date: "2026-04-14", value: "120" }, // 30d ago
        { date: "2026-05-14", value: "100" }, // now → -16.67%
      ],
      VIXCLS: [
        { date: "2026-05-14", value: "18" },
      ],
      FEDFUNDS: [
        { date: "2026-05-14", value: "5.25" },
      ],
      CPIAUCSL: [
        { date: "2025-05-14", value: "290" }, // 365d ago
        { date: "2026-05-14", value: "305" }, // now → YoY ≈ 5.17%
      ],
      DFII10: [
        { date: "2026-05-14", value: "2.0" },
      ],
    });

    const start = new Date("2026-02-01").getTime();
    const end = new Date("2026-05-14").getTime();
    const r = await buildMacroLayerRange({
      startMs: start,
      endMs: end,
      mode: "realtime",
      disableCache: true,
    });
    expect(r.length).toBe(1);
    const layer = r[0];

    // Single-indicator fields
    // spread = (3.59 - 3.65) * 100 = -6 bp
    expect(layer.sofr_iorb_spread_bp).toBeCloseTo(-6, 4);
    // yield curve = 4.20 - 4.50 = -0.30 (inverted)
    expect(layer.yield_curve_10_2).toBeCloseTo(-0.3, 4);
    // WALCL change 30d: (7,000,000 - 7,700,000) / 7,700,000 ≈ -0.0909
    expect(layer.walcl_change_30d_pct).toBeCloseTo(-0.0909, 3);
    // RRP+TGA: now=(400+600)=1000, past=(500+700)=1200 → (1000-1200)/1200 ≈ -0.1667
    expect(layer.rrp_tga_change_30d_pct).toBeCloseTo(-0.1667, 3);
    // real_rate = fed_funds(5.25) - cpi_yoy((305-290)/290*100 ≈ 5.172)
    expect(layer.real_rate).toBeCloseTo(5.25 - ((305 - 290) / 290) * 100, 3);
    // DXY change 30d: (100-120)/120 ≈ -0.1667
    expect(layer.dxy_change_30d_pct).toBeCloseTo(-0.1667, 3);
    expect(layer.vix).toBe(18);
  });

  test("partial-missing series → only those fields fall back to 0/null", async () => {
    // Provide SOFR + IORB only; rest stub (empty observations).
    mockFredResponses({
      SOFR: [{ date: "2026-05-14", value: "3.59" }],
      IORB: [{ date: "2026-05-14", value: "3.65" }],
      // others omitted → []
    });

    const r = await buildMacroLayerRange({
      startMs: new Date("2026-02-01").getTime(),
      endMs: new Date("2026-05-14").getTime(),
      mode: "realtime",
      disableCache: true,
    });
    expect(r.length).toBe(1);
    const layer = r[0];

    // spread populated
    expect(layer.sofr_iorb_spread_bp).toBeCloseTo(-6, 4);
    // missing series fall back
    expect(layer.yield_curve_10_2).toBe(0);
    expect(layer.walcl_change_30d_pct).toBe(0);
    expect(layer.rrp_tga_change_30d_pct).toBe(0);
    expect(layer.real_rate).toBe(0);
    expect(layer.dxy_change_30d_pct).toBe(0);
    expect(layer.vix).toBe(0);
  });

  test("WALCL 30d change: 110 (past) → 100 (now) yields ≈ -9.09%", async () => {
    mockFredResponses({
      SOFR: [{ date: "2026-05-14", value: "3.5" }],
      WALCL: [
        { date: "2026-04-14", value: "110" },
        { date: "2026-05-14", value: "100" },
      ],
    });
    const r = await buildMacroLayerRange({
      startMs: new Date("2026-02-01").getTime(),
      endMs: new Date("2026-05-14").getTime(),
      mode: "realtime",
      disableCache: true,
    });
    expect(r.length).toBe(1);
    // (100 - 110) / 110 = -0.0909...
    expect(r[0].walcl_change_30d_pct).toBeCloseTo(-10 / 110, 5);
  });

  test("CPI YoY: 290 (12mo ago) → 305 (now) ≈ +5.17%", async () => {
    mockFredResponses({
      SOFR: [{ date: "2026-05-14", value: "3.5" }],
      FEDFUNDS: [{ date: "2026-05-14", value: "5.25" }],
      CPIAUCSL: [
        { date: "2025-05-14", value: "290" },
        { date: "2026-05-14", value: "305" },
      ],
    });
    const r = await buildMacroLayerRange({
      startMs: new Date("2024-05-14").getTime(),
      endMs: new Date("2026-05-14").getTime(),
      mode: "realtime",
      disableCache: true,
    });
    expect(r.length).toBe(1);
    // real_rate = 5.25 - ((305-290)/290 * 100) ≈ 5.25 - 5.1724 ≈ 0.0776
    const expectedYoY = ((305 - 290) / 290) * 100;
    expect(r[0].real_rate).toBeCloseTo(5.25 - expectedYoY, 3);
    expect(expectedYoY).toBeCloseTo(5.1724, 3);
  });

  test("release_ts matches latest observation across populated series", async () => {
    mockFredResponses({
      SOFR: [{ date: "2026-05-10", value: "3.5" }],
      IORB: [{ date: "2026-05-12", value: "3.6" }],
      DGS10: [{ date: "2026-05-14", value: "4.2" }], // latest
    });
    const r = await buildMacroLayerRange({
      startMs: new Date("2026-02-01").getTime(),
      endMs: new Date("2026-05-15").getTime(),
      mode: "realtime",
      disableCache: true,
    });
    expect(r.length).toBe(1);
    const expectedReleaseMs = new Date("2026-05-14").getTime();
    expect(r[0].release_ts).toBe(expectedReleaseMs);
  });

  test("SOFR empty → empty array (no key-but-data guard)", async () => {
    // FRED_API_KEY present, but SOFR returns []
    mockFredResponses({
      SOFR: [],
      IORB: [{ date: "2026-05-14", value: "3.6" }],
    });
    const r = await buildMacroLayerRange({
      startMs: new Date("2026-02-01").getTime(),
      endMs: new Date("2026-05-14").getTime(),
      mode: "realtime",
      disableCache: true,
    });
    expect(r).toEqual([]);
  });

  test("backtest mode passes realtime_start/end to FRED (ALFRED)", async () => {
    const captured: Array<{ seriesId: string; params: any }> = [];
    vi.spyOn(axios, "get").mockImplementation(
      async (url: string, config?: any) => {
        if (
          typeof url === "string" &&
          url.includes("api.stlouisfed.org/fred/series/observations")
        ) {
          captured.push({
            seriesId: config?.params?.series_id,
            params: config?.params,
          });
          // give SOFR something so the function proceeds past the guard
          if (config?.params?.series_id === "SOFR") {
            return {
              data: {
                observations: [{ date: "2024-06-30", value: "5.30" }],
              },
            };
          }
          return { data: { observations: [] } };
        }
        if (
          typeof url === "string" &&
          url.includes("query1.finance.yahoo.com")
        ) {
          return {
            data: {
              chart: {
                result: [
                  { timestamp: [], indicators: { quote: [{ close: [] }] } },
                ],
              },
            },
          };
        }
        return { data: {} };
      },
    );

    const start = new Date("2024-01-01").getTime();
    const end = new Date("2024-06-30").getTime();
    await buildMacroLayerRange({
      startMs: start,
      endMs: end,
      mode: "backtest",
      disableCache: true,
    });

    expect(captured.length).toBe(FRED_SERIES_FOR_LAYER.length);
    for (const c of captured) {
      expect(c.params.realtime_start).toBe("2024-01-01");
      expect(c.params.realtime_end).toBe("2024-06-30");
    }
  });
});
