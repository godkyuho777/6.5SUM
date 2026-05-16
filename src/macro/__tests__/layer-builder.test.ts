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
  buildMacroRawHistory,
  latestValid,
  valueDaysAgo,
  FRED_SERIES_FOR_LAYER,
} from "../layer-builder";
import type { MacroLayer } from "../layer-types";
import type { FredFetchResult, FredObservation } from "../sources/fred";
import {
  c3_netLiquidity,
  c4_cyclePhase,
} from "../composite-signals";

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

  test("history populates C3/C4 from 90+ day series (end-to-end)", async () => {
    // SOFR/IORB/FEDFUNDS/CPI 단일 점 + WALCL/RRP/TGA 30d 변화 + DGS10/DGS2
    // 90d 변화 → C3 ≠ 0, C4 ≠ "neutral" 까지 도달하는지 확인.
    //
    // 시나리오:
    //   - 90d 전 yield curve 양수 (DGS10=4.5, DGS2=4.0), 현재 음수 (4.2 vs 4.6)
    //     → "pre_recession" 조건 (양수에서 좁혀짐 0.5%+) 또는 inversion 별개.
    //     실제: 양수 0.5 → 음수 -0.4 → "pre_recession" 조건 미충족 (현재 음수)
    //     → realRate > 1.5 면 "recession_imminent". fed_funds 5.25 - cpi 3 = 2.25 ✓
    //   - WALCL 30d 증가, RRP/TGA 감소 → net liquidity 양수
    const dateFromOffset = (daysAgo: number) =>
      new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);

    mockFredResponses({
      SOFR: [{ date: dateFromOffset(0), value: "3.5" }],
      IORB: [{ date: dateFromOffset(0), value: "3.6" }],
      DGS10: [
        { date: dateFromOffset(95), value: "4.5" }, // 90d ago
        { date: dateFromOffset(0), value: "4.2" }, // now
      ],
      DGS2: [
        { date: dateFromOffset(95), value: "4.0" }, // 90d ago → yc=0.5
        { date: dateFromOffset(0), value: "4.6" }, // now → yc=-0.4 (inverted)
      ],
      WALCL: [
        { date: dateFromOffset(35), value: "7000000" },
        { date: dateFromOffset(0), value: "7700000" }, // +10%
      ],
      RRPONTSYD: [
        { date: dateFromOffset(35), value: "500" },
        { date: dateFromOffset(0), value: "400" },
      ],
      WTREGEN: [
        { date: dateFromOffset(35), value: "700" },
        { date: dateFromOffset(0), value: "600" },
      ],
      FEDFUNDS: [{ date: dateFromOffset(0), value: "5.25" }],
      CPIAUCSL: [
        { date: dateFromOffset(370), value: "295" },
        { date: dateFromOffset(0), value: "305" },
      ],
      VIXCLS: [{ date: dateFromOffset(0), value: "18" }],
      DTWEXBGS: [{ date: dateFromOffset(0), value: "100" }],
    });

    const r = await buildMacroLayerRange({
      startMs: Date.now() - 130 * 86_400_000,
      endMs: Date.now(),
      mode: "realtime",
      disableCache: true,
    });
    expect(r.length).toBe(1);
    const layer = r[0];

    // C3: history 가 채워졌으므로 0 이 아닌 실제 값.
    // (정확한 값은 forward-fill 의 30d 시점에서의 net 변화. 부호 + 정도만 검증)
    expect(layer.c3_net_liquidity_30d_pct).not.toBe(0);
    expect(Number.isFinite(layer.c3_net_liquidity_30d_pct)).toBe(true);

    // C4: yc 가 inversion + realRate(=5.25-cpi_yoy) > 1.5 → recession_imminent
    // (cpi_yoy = (305-295)/295*100 ≈ 3.39, realRate ≈ 1.86 → > 1.5 ✓)
    // yc_now = 4.2 - 4.6 = -0.4 (< 0) ✓
    expect(layer.c4_cycle_phase).toBe("recession_imminent");
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

// ──────────────────────────────────────────────────────────
// buildMacroRawHistory — daily-grid forward-fill sequence
// ──────────────────────────────────────────────────────────

/**
 * `Map<string, FredFetchResult>` 헬퍼 — observations 만 채우는 mock.
 */
function mkFredMap(
  bySeries: Record<string, Array<{ date: string; value: number }>>,
): Map<string, FredFetchResult> {
  const map = new Map<string, FredFetchResult>();
  for (const id of FRED_SERIES_FOR_LAYER) {
    const arr = bySeries[id] ?? [];
    const observations: FredObservation[] = arr.map((o) => ({
      date: o.date,
      value: o.value,
    }));
    map.set(id, {
      status: arr.length > 0 ? "ok" : "stub",
      observations,
    });
  }
  return map;
}

/** ISO date `daysAgo` 일 전 기준 endMs 로 환산. */
function isoFromEnd(endMs: number, daysAgo: number): string {
  return new Date(endMs - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

describe("buildMacroRawHistory", () => {
  test("12개 시리즈 daily observations → 121일 RawMacroData[] 배열 (length = daysCount + 1)", () => {
    const endMs = new Date("2026-05-14T00:00:00Z").getTime();

    // 각 시리즈를 0~130d 매일 채움 (CPI YoY 가능하도록 일부는 더 길게)
    const dailyFor = (start: number, end: number, val: (i: number) => number) => {
      const out: Array<{ date: string; value: number }> = [];
      for (let i = end; i >= start; i--) {
        out.push({ date: isoFromEnd(endMs, i), value: val(i) });
      }
      return out;
    };

    const map = mkFredMap({
      SOFR: dailyFor(0, 130, (i) => 3.5 + i * 0.001),
      IORB: dailyFor(0, 130, (_i) => 3.6),
      DGS10: dailyFor(0, 130, (_i) => 4.2),
      DGS2: dailyFor(0, 130, (_i) => 4.6),
      WALCL: dailyFor(0, 130, (_i) => 7_000_000),
      RRPONTSYD: dailyFor(0, 130, (_i) => 500),
      WTREGEN: dailyFor(0, 130, (_i) => 700),
      DTWEXBGS: dailyFor(0, 130, (_i) => 100),
      VIXCLS: dailyFor(0, 130, (_i) => 18),
      FEDFUNDS: dailyFor(0, 130, (_i) => 5.25),
      CPIAUCSL: dailyFor(0, 400, (_i) => 305),
    });

    const history = buildMacroRawHistory(map, endMs, 120);

    expect(history.length).toBe(121); // daysCount + 1
    // 가장 최신 점이 endMs 시점값
    const latest = history[history.length - 1];
    expect(latest.sofr).toBeCloseTo(3.5, 4);
    expect(latest.dgs10).toBe(4.2);
    expect(latest.walcl).toBe(7_000_000);
  });

  test("step function (weekly 시리즈) 은 forward-fill (직전 발표 값 유지)", () => {
    const endMs = new Date("2026-05-14T00:00:00Z").getTime();

    // WALCL 은 weekly — endMs 기준 7/14/21일 전에만 데이터 (목요일 가정)
    const map = mkFredMap({
      SOFR: [{ date: isoFromEnd(endMs, 0), value: 3.5 }],
      WALCL: [
        { date: isoFromEnd(endMs, 21), value: 7_000_000 },
        { date: isoFromEnd(endMs, 14), value: 7_100_000 },
        { date: isoFromEnd(endMs, 7), value: 7_200_000 },
        // endMs 시점은 데이터 없음 → 7일 전 값이 forward-fill 됨
      ],
    });

    const history = buildMacroRawHistory(map, endMs, 30);

    // history[history.length - 1] = endMs → walcl = 7,200,000 (7d ago value forward-filled)
    const latest = history[history.length - 1];
    expect(latest.walcl).toBe(7_200_000);

    // history index ~ daysCount - 14 = 16 (14일 전) → 14d announcement value
    const fourteenAgo = history[history.length - 1 - 14];
    expect(fourteenAgo.walcl).toBe(7_100_000);

    // history index ~ daysCount - 21 = 9 (21일 전) → 21d announcement value
    const twentyOneAgo = history[history.length - 1 - 21];
    expect(twentyOneAgo.walcl).toBe(7_000_000);
  });

  test("CPI YoY 매일 계산 (d 와 d - 365일)", () => {
    const endMs = new Date("2026-05-14T00:00:00Z").getTime();

    // CPI: 1년 전 290, 현재 305 → 각 grid 일자마다 YoY ≈ +5.17%
    const cpiSeries: Array<{ date: string; value: number }> = [];
    // 1년 전 ~ 현재까지 매일 295 (선형 보간 단순화 — 의도된 forward-fill)
    for (let d = 400; d >= 0; d--) {
      const v = d >= 365 ? 290 : 305; // step (1년 전 발표 → 305)
      cpiSeries.push({ date: isoFromEnd(endMs, d), value: v });
    }

    const map = mkFredMap({
      SOFR: [{ date: isoFromEnd(endMs, 0), value: 3.5 }],
      CPIAUCSL: cpiSeries,
    });

    const history = buildMacroRawHistory(map, endMs, 120);
    const latest = history[history.length - 1];

    // YoY = (305 - 290) / 290 * 100 ≈ 5.1724
    expect(latest.cpi_yoy).toBeDefined();
    expect(latest.cpi_yoy!).toBeCloseTo(5.1724, 2);
  });

  test("c3_netLiquidity 가 history 받으면 30d 변화율 정확히 계산", () => {
    const endMs = new Date("2026-05-14T00:00:00Z").getTime();

    // c3 는 history[length-1] (now) vs history[length-30] (29 index 차) 사용.
    // history 가 daysCount=120 이면 length=121, past index = 91 ≈ endMs-29d.
    // 따라서 d >= 29 일 때 "과거" 값, d < 29 일 때 "현재" 값으로 split 한다.
    //   "오래된" 기간 (d >= 29): WALCL 7,000,000 / RRP 500 / TGA 700 → net = 6,998,800
    //   "최근"   기간 (d <  29): WALCL 7,700,000 / RRP 400 / TGA 600 → net = 7,699,000
    // 변화율 ≈ +0.1001 (+10%)
    const walclSeries: Array<{ date: string; value: number }> = [];
    const rrpSeries: Array<{ date: string; value: number }> = [];
    const tgaSeries: Array<{ date: string; value: number }> = [];
    for (let d = 130; d >= 0; d--) {
      if (d >= 29) {
        walclSeries.push({ date: isoFromEnd(endMs, d), value: 7_000_000 });
        rrpSeries.push({ date: isoFromEnd(endMs, d), value: 500 });
        tgaSeries.push({ date: isoFromEnd(endMs, d), value: 700 });
      } else {
        walclSeries.push({ date: isoFromEnd(endMs, d), value: 7_700_000 });
        rrpSeries.push({ date: isoFromEnd(endMs, d), value: 400 });
        tgaSeries.push({ date: isoFromEnd(endMs, d), value: 600 });
      }
    }

    const map = mkFredMap({
      SOFR: [{ date: isoFromEnd(endMs, 0), value: 3.5 }],
      WALCL: walclSeries,
      RRPONTSYD: rrpSeries,
      WTREGEN: tgaSeries,
    });

    const history = buildMacroRawHistory(map, endMs, 120);
    const c3 = c3_netLiquidity(history);

    // c3 = (now_net - past_net) / |past_net|
    const nowNet = 7_700_000 - 400 - 600;
    const pastNet = 7_000_000 - 500 - 700;
    const expected = (nowNet - pastNet) / Math.abs(pastNet);
    expect(c3).toBeCloseTo(expected, 5);
    expect(c3).toBeGreaterThan(0); // 양수 (net liquidity 증가)
  });

  test("c4_cyclePhase 가 history 받으면 5단계 분류 (inversion + realRate>1.5 → recession_imminent)", () => {
    const endMs = new Date("2026-05-14T00:00:00Z").getTime();

    // 90일 전: DGS10=4.5, DGS2=4.0 → yc=0.5 (양수)
    // 현재   : DGS10=4.2, DGS2=4.6 → yc=-0.4 (inverted)
    // realRate = fed_funds 5.25 - cpi_yoy 3.39 ≈ 1.86 > 1.5 ✓
    // → "recession_imminent"
    const dgs10Series: Array<{ date: string; value: number }> = [];
    const dgs2Series: Array<{ date: string; value: number }> = [];
    for (let d = 100; d >= 0; d--) {
      if (d >= 90) {
        dgs10Series.push({ date: isoFromEnd(endMs, d), value: 4.5 });
        dgs2Series.push({ date: isoFromEnd(endMs, d), value: 4.0 });
      } else {
        dgs10Series.push({ date: isoFromEnd(endMs, d), value: 4.2 });
        dgs2Series.push({ date: isoFromEnd(endMs, d), value: 4.6 });
      }
    }

    const map = mkFredMap({
      SOFR: [{ date: isoFromEnd(endMs, 0), value: 3.5 }],
      DGS10: dgs10Series,
      DGS2: dgs2Series,
      FEDFUNDS: [{ date: isoFromEnd(endMs, 0), value: 5.25 }],
      CPIAUCSL: [
        { date: isoFromEnd(endMs, 370), value: 295 },
        { date: isoFromEnd(endMs, 0), value: 305 },
      ],
    });

    const history = buildMacroRawHistory(map, endMs, 120);
    const phase = c4_cyclePhase(history);
    expect(phase).toBe("recession_imminent");
  });

  test("빈 fred map → length 121 RawMacroData[] 이지만 모두 undefined", () => {
    const endMs = new Date("2026-05-14T00:00:00Z").getTime();
    const map = mkFredMap({});
    const history = buildMacroRawHistory(map, endMs, 120);
    expect(history.length).toBe(121);
    const latest = history[history.length - 1];
    expect(latest.sofr).toBeUndefined();
    expect(latest.walcl).toBeUndefined();
    expect(latest.cpi_yoy).toBeUndefined();
    expect(latest.walcl_change_30d_pct).toBeUndefined();
    // c3 / c4 → 0 / "neutral" (graceful)
    expect(c3_netLiquidity(history)).toBe(0);
    expect(c4_cyclePhase(history)).toBe("neutral");
  });
});
