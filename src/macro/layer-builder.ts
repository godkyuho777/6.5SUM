/**
 * MacroLayer 빌더 — 한 시점의 통합 macro layer 객체를 만들거나, 시간 범위에
 * 대해 일별 layer 시퀀스를 빌드한다.
 *
 * MACRO_LIQUIDITY_TRACKER_v2 §1.2 + §4.2.
 *
 * 본 모듈은 백테스트 timeline 빌더 (`src/backtest/timeline-builder.ts`) 와는
 * 별도로, "현재 시점 macro snapshot" / "macro 차원의 독립 분석" 같은
 * 비-백테스트 사용처를 위해 제공된다.
 *
 * 헌장 보장:
 *   - mode="backtest" 시 FRED 호출은 ALFRED 강제 (look-ahead 차단).
 *   - API key 없으면 stub 반환, 절대 throw X.
 */

import {
  computeCompositeSignals,
  macroFreshnessMult,
  effectiveMacroMultiplier as effectiveMultiplierFromBase,
  type RawMacroData,
  type CompositeSignals,
} from "./composite-signals";
import { computeMacroScoreV2, type MacroLiquidityV2Result } from "./liquidity";
import {
  fetchFred,
  type FredFetchResult,
  type FredMode,
  type FredObservation,
} from "./sources/fred";
import { fetchBOK } from "./sources/bok";
import type { MacroLayer } from "./layer-types";

// ─────────────────────────────────────────────────────────
// Build options
// ─────────────────────────────────────────────────────────

export interface BuildMacroLayerOpts {
  /** 측정/적용 시점 (epoch ms). */
  snapshot_ts: number;
  /** 발표 시점 (epoch ms) — 백테스트 시 candle.ts 와 비교. */
  release_ts: number;
  raw: RawMacroData;
  /** 90+ days history (C3/C4 필요). 없으면 0/"neutral". */
  history?: RawMacroData[];
  /** snapshot 의 "현재 시점" — age_hours 계산용. default = snapshot_ts. */
  as_of_ts?: number;
}

// ─────────────────────────────────────────────────────────
// Builder — single snapshot
// ─────────────────────────────────────────────────────────

/**
 * 한 시점의 raw macro 데이터로부터 통합 MacroLayer 객체 생성.
 *
 * Pure 함수. composite 계산 → v2 score → freshness 곱셈 → breakdown.
 */
export function buildMacroLayerSnapshot(
  opts: BuildMacroLayerOpts,
): MacroLayer {
  const composite: CompositeSignals = computeCompositeSignals(
    opts.raw,
    opts.history ?? [],
  );
  const v2: MacroLiquidityV2Result = computeMacroScoreV2(
    {
      sofr: opts.raw.sofr,
      iorb: opts.raw.iorb,
      rrpChange30d: opts.raw.rrp_tga_change_30d_pct,
      tgaChange30d: opts.raw.rrp_tga_change_30d_pct,
      fedBalanceChange30d: opts.raw.walcl_change_30d_pct,
      realFedFundsRate:
        opts.raw.fed_funds != null && opts.raw.cpi_yoy != null
          ? opts.raw.fed_funds - opts.raw.cpi_yoy
          : undefined,
    },
    composite,
  );

  const asOf = opts.as_of_ts ?? opts.snapshot_ts;
  const age_hours = Math.max(0, (asOf - opts.release_ts) / (1000 * 60 * 60));
  const freshness = macroFreshnessMult(age_hours);

  return {
    snapshot_ts: opts.snapshot_ts,
    release_ts: opts.release_ts,
    age_hours,

    sofr_iorb_spread_bp:
      opts.raw.sofr != null && opts.raw.iorb != null
        ? (opts.raw.sofr - opts.raw.iorb) * 100
        : 0,
    yield_curve_10_2:
      opts.raw.dgs10 != null && opts.raw.dgs2 != null
        ? opts.raw.dgs10 - opts.raw.dgs2
        : 0,
    walcl_change_30d_pct: opts.raw.walcl_change_30d_pct ?? 0,
    rrp_tga_change_30d_pct: opts.raw.rrp_tga_change_30d_pct ?? 0,
    real_rate:
      opts.raw.fed_funds != null && opts.raw.cpi_yoy != null
        ? opts.raw.fed_funds - opts.raw.cpi_yoy
        : 0,
    dxy_change_30d_pct: opts.raw.dxy_change_30d_pct ?? 0,
    vix: opts.raw.vix ?? 0,

    c1_crisis: composite.c1_crisis,
    c2_riskOn: composite.c2_riskOn,
    c3_net_liquidity_30d_pct: composite.c3_net_liquidity_30d_pct,
    c4_cycle_phase: composite.c4_cycle_phase,

    bok_rate: opts.raw.bok_rate ?? null,
    bok_rate_change_90d: opts.raw.bok_rate_change_90d ?? null,
    krw_usd: opts.raw.krw_usd ?? null,
    krw_change_30d_pct: opts.raw.krw_change_30d_pct ?? null,

    score: v2.score,
    regime: v2.regime,
    multiplier: v2.mult,
    freshness_mult: freshness,

    breakdown: {
      spread_score: v2.breakdown.spread,
      yield_curve_score: 0,
      walcl_score: v2.breakdown.fedBalance,
      rrp_tga_score: v2.breakdown.rrp + v2.breakdown.tga,
      real_rate_score: v2.breakdown.realRate,
      dxy_score: 0,
      vix_score: 0,
      korea_score: 0,
      c1_contribution: composite.c1_crisis,
      c2_contribution: composite.c2_riskOn,
      c3_contribution: composite.c3_net_liquidity_30d_pct,
      c4_contribution: 0,
    },
  };
}

// ─────────────────────────────────────────────────────────
// Re-exports — freshness helpers
// ─────────────────────────────────────────────────────────

export { macroFreshnessMult };

/**
 * MacroLayer 의 base multiplier 를 freshness 로 약화.
 *   effective = 1 + (multiplier - 1) * freshness_mult
 *
 * (CLAUDE 명세서 §3.4 / prompt 요구사항.)
 */
export function effectiveMacroMultiplier(layer: MacroLayer): number {
  return effectiveMultiplierFromBase(layer.multiplier, layer.age_hours);
}

// ─────────────────────────────────────────────────────────
// Time-range builder (multi-series fetch)
// ─────────────────────────────────────────────────────────

export interface BuildMacroRangeOpts {
  startMs: number;
  endMs: number;
  mode: FredMode;
  /** 일별 stride. default 1d. */
  strideMs?: number;
  /** 테스트용 — 디스크 캐시 우회. default false. */
  disableCache?: boolean;
}

/**
 * Layer 빌드에 필요한 FRED 시리즈 목록 — MACRO_LIQUIDITY_TRACKER_v2 §1.2.
 *
 * 각 시리즈는 fetchFred 로 병렬 호출되며, 일부가 stub/error 여도 나머지는
 * graceful 하게 layer 에 반영된다 (해당 필드만 undefined).
 */
export const FRED_SERIES_FOR_LAYER = [
  "SOFR",       // overnight financing rate
  "IORB",       // interest on reserve balances
  "DGS10",      // 10Y treasury yield
  "DGS2",       // 2Y treasury yield
  "WALCL",      // Fed balance sheet
  "RRPONTSYD",  // overnight reverse repo
  "WTREGEN",    // Treasury General Account
  "DTWEXBGS",   // trade-weighted USD index (DXY proxy)
  "VIXCLS",     // CBOE VIX
  "FEDFUNDS",   // federal funds rate
  "CPIAUCSL",   // CPI (for YoY → real rate)
  "DFII10",     // 10Y TIPS (real rate v2, optional)
] as const;

type FredSeriesId = (typeof FRED_SERIES_FOR_LAYER)[number];

// ─────────────────────────────────────────────────────────
// Helpers — latest + days-ago lookups over FRED observations
// ─────────────────────────────────────────────────────────

/**
 * 가장 최근의 numeric (NaN 제외) observation 값. 없으면 undefined.
 */
export function latestValid(obs: FredObservation[]): number | undefined {
  if (!Array.isArray(obs)) return undefined;
  for (let i = obs.length - 1; i >= 0; i--) {
    const v = obs[i].value;
    if (!Number.isNaN(v) && Number.isFinite(v)) return v;
  }
  return undefined;
}

/**
 * 가장 최근 obs date 에서 `days` 일 전 시점에 가장 가까운 valid observation
 * 의 값. 데이터 부족/없음 → undefined.
 */
export function valueDaysAgo(
  obs: FredObservation[],
  days: number,
): number | undefined {
  if (!Array.isArray(obs) || obs.length === 0) return undefined;
  const valid = obs.filter(
    (o) => !Number.isNaN(o.value) && Number.isFinite(o.value),
  );
  if (valid.length === 0) return undefined;
  const latestDate = new Date(valid[valid.length - 1].date).getTime();
  if (!Number.isFinite(latestDate)) return undefined;
  const targetMs = latestDate - days * 86_400_000;
  let closest = valid[0];
  let minDiff = Math.abs(new Date(closest.date).getTime() - targetMs);
  for (const o of valid) {
    const t = new Date(o.date).getTime();
    if (!Number.isFinite(t)) continue;
    const d = Math.abs(t - targetMs);
    if (d < minDiff) {
      closest = o;
      minDiff = d;
    }
  }
  return closest.value;
}

/**
 * 변화율 계산 — (now - past) / |past|. past 0/누락이면 undefined.
 * 부호 보존을 위해 분모는 Math.abs(past) 사용.
 */
function pctChange(
  now: number | undefined,
  past: number | undefined,
): number | undefined {
  if (now == null || past == null) return undefined;
  if (past === 0) return undefined;
  return (now - past) / Math.abs(past);
}

/**
 * 시리즈의 latest observation date (ISO YYYY-MM-DD) → epoch ms.
 * 없으면 undefined.
 */
function latestObsMs(obs: FredObservation[]): number | undefined {
  if (!Array.isArray(obs) || obs.length === 0) return undefined;
  for (let i = obs.length - 1; i >= 0; i--) {
    const v = obs[i].value;
    if (Number.isNaN(v) || !Number.isFinite(v)) continue;
    const t = new Date(obs[i].date).getTime();
    if (Number.isFinite(t)) return t;
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────
// Multi-series fetch — parallel, graceful per-series
// ─────────────────────────────────────────────────────────

/**
 * `FRED_SERIES_FOR_LAYER` 를 모두 병렬 호출. 각 결과는 status 보존 (ok/stub/error).
 *
 * - realtime 모드: observation_start = startISO (90d 룩백 보장 위해 호출자 책임)
 * - backtest 모드: ALFRED — realtime_start/end = [startISO, endISO]
 *   (look-ahead 차단)
 *
 * 본 함수는 throw 하지 않음. 개별 시리즈 실패는 그 시리즈만 비어 있게 됨.
 */
async function fetchAllFredSeriesForLayer(
  startISO: string,
  endISO: string,
  mode: FredMode,
  disableCache = false,
): Promise<Map<FredSeriesId, FredFetchResult>> {
  const promises = FRED_SERIES_FOR_LAYER.map((seriesId) =>
    fetchFred(
      mode === "backtest"
        ? {
            seriesId,
            mode: "backtest",
            realtimeStart: startISO,
            realtimeEnd: endISO,
            observationStart: startISO,
            observationEnd: endISO,
            disableCache,
          }
        : {
            seriesId,
            mode: "realtime",
            observationStart: startISO,
            observationEnd: endISO,
            disableCache,
          },
    ).catch(
      (err): FredFetchResult => ({
        status: "error",
        observations: [],
        detail: (err as Error).message ?? "unknown",
      }),
    ),
  );
  const results = await Promise.all(promises);
  const map = new Map<FredSeriesId, FredFetchResult>();
  for (let i = 0; i < FRED_SERIES_FOR_LAYER.length; i++) {
    map.set(FRED_SERIES_FOR_LAYER[i], results[i]);
  }
  return map;
}

/**
 * 시리즈 map 에서 단일 시리즈의 observations 추출 (없으면 빈 배열).
 */
function obsOf(
  map: Map<FredSeriesId, FredFetchResult>,
  id: FredSeriesId,
): FredObservation[] {
  return map.get(id)?.observations ?? [];
}

// ─────────────────────────────────────────────────────────
// Public — range builder (single layer at endMs)
// ─────────────────────────────────────────────────────────

/**
 * Time-range MacroLayer 빌더 — endMs 시점의 단일 layer 반환.
 *
 * 동작:
 *   1. FRED_API_KEY 없으면 [] 반환 (stub-first).
 *   2. 12개 FRED 시리즈를 병렬 호출 (mode=backtest 시 ALFRED 강제).
 *   3. 한국 BOK 환율 (731Y004) 호출 (key 없으면 Yahoo fallback).
 *   4. 각 시리즈에서 latest + 30d-ago / 365d-ago 추출 → RawMacroData 채움.
 *   5. release_ts = 가장 늦은 시리즈의 latest obs 시점.
 *   6. buildMacroLayerSnapshot 으로 통합 layer 생성.
 *
 * 본 구현은 단일-point timeline 반환. 일별 stride 시퀀스는 Phase 3.5 에서.
 *
 * C3 (90d net-liquidity) / C4 (cycle phase) 는 history 인자가 필요하나,
 * 본 함수는 단일 snapshot 만 생성 → 0/"neutral" 로 떨어진다. history-aware
 * 빌드는 후속 작업.
 */
export async function buildMacroLayerRange(
  opts: BuildMacroRangeOpts,
): Promise<MacroLayer[]> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    return [];
  }

  try {
    const startISO = new Date(opts.startMs).toISOString().slice(0, 10);
    const endISO = new Date(opts.endMs).toISOString().slice(0, 10);

    // ── 1) FRED 12개 시리즈 병렬 fetch ────────────────────
    const fredMap = await fetchAllFredSeriesForLayer(
      startISO,
      endISO,
      opts.mode,
      opts.disableCache,
    );

    // ── 2) 한국 BOK 환율 (key 없으면 Yahoo fallback) ─────
    let krwSeries: { date: string; value: number }[] = [];
    try {
      const krw = await fetchBOK({
        statCode: "731Y004",
        startDate: startISO,
        endDate: endISO,
        disableCache: opts.disableCache,
      });
      krwSeries = krw.values;
    } catch {
      krwSeries = [];
    }
    const krwLatest =
      krwSeries.length > 0 ? krwSeries[krwSeries.length - 1].value : undefined;

    // BOK 기준금리 — key 있을 때만 (현재 단일 시점은 사용 X, raw 에만 채움)
    let bokRate: number | undefined;
    try {
      const bok = await fetchBOK({
        statCode: "722Y001",
        startDate: startISO,
        endDate: endISO,
        disableCache: opts.disableCache,
      });
      if (bok.values.length > 0) {
        const last = bok.values[bok.values.length - 1];
        if (Number.isFinite(last.value)) bokRate = last.value;
      }
    } catch {
      // graceful
    }

    // ── 3) 각 시리즈에서 latest + days-ago 추출 ───────────
    const sofrObs = obsOf(fredMap, "SOFR");
    const iorbObs = obsOf(fredMap, "IORB");
    const dgs10Obs = obsOf(fredMap, "DGS10");
    const dgs2Obs = obsOf(fredMap, "DGS2");
    const walclObs = obsOf(fredMap, "WALCL");
    const rrpObs = obsOf(fredMap, "RRPONTSYD");
    const tgaObs = obsOf(fredMap, "WTREGEN");
    const dxyObs = obsOf(fredMap, "DTWEXBGS");
    const vixObs = obsOf(fredMap, "VIXCLS");
    const fedFundsObs = obsOf(fredMap, "FEDFUNDS");
    const cpiObs = obsOf(fredMap, "CPIAUCSL");
    // const dfii10Obs = obsOf(fredMap, "DFII10"); // real-rate v2 (reserved)

    // 기본 trial 가드 — SOFR 가 비어 있으면 키는 있지만 데이터 0건 → []
    if (sofrObs.length === 0) {
      return [];
    }

    const sofr = latestValid(sofrObs);
    const iorb = latestValid(iorbObs);
    const dgs10 = latestValid(dgs10Obs);
    const dgs2 = latestValid(dgs2Obs);
    const walclNow = latestValid(walclObs);
    const walcl30dAgo = valueDaysAgo(walclObs, 30);
    const rrpNow = latestValid(rrpObs);
    const rrp30dAgo = valueDaysAgo(rrpObs, 30);
    const tgaNow = latestValid(tgaObs);
    const tga30dAgo = valueDaysAgo(tgaObs, 30);
    const dxyNow = latestValid(dxyObs);
    const dxy30dAgo = valueDaysAgo(dxyObs, 30);
    const vix = latestValid(vixObs);
    const fedFunds = latestValid(fedFundsObs);
    const cpiNow = latestValid(cpiObs);
    const cpi12mAgo = valueDaysAgo(cpiObs, 365);

    // ── 4) 변화율 / YoY 계산 ──────────────────────────────
    const walclChange30d = pctChange(walclNow, walcl30dAgo);
    const dxyChange30d = pctChange(dxyNow, dxy30dAgo);

    // RRP + TGA 합산 변화율 — net liquidity 의 부정적 driver.
    // 양쪽 모두 있어야 의미가 있으므로 부분 누락 시 부분 계산.
    let rrpTgaChange30d: number | undefined;
    if (rrpNow != null && tgaNow != null && rrp30dAgo != null && tga30dAgo != null) {
      const sumNow = rrpNow + tgaNow;
      const sumPast = rrp30dAgo + tga30dAgo;
      rrpTgaChange30d = pctChange(sumNow, sumPast);
    }

    // CPI YoY = (cpiNow - cpi12mAgo) / cpi12mAgo × 100 (%)
    let cpiYoY: number | undefined;
    if (cpiNow != null && cpi12mAgo != null && cpi12mAgo !== 0) {
      cpiYoY = ((cpiNow - cpi12mAgo) / cpi12mAgo) * 100;
    }

    // ── 5) release_ts — 가장 늦은 시리즈의 latest obs 시점 ─
    const candidateMsValues = [
      latestObsMs(sofrObs),
      latestObsMs(iorbObs),
      latestObsMs(dgs10Obs),
      latestObsMs(dgs2Obs),
      latestObsMs(walclObs),
      latestObsMs(rrpObs),
      latestObsMs(tgaObs),
      latestObsMs(dxyObs),
      latestObsMs(vixObs),
      latestObsMs(fedFundsObs),
      latestObsMs(cpiObs),
    ].filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const releaseMs =
      candidateMsValues.length > 0
        ? Math.max(...candidateMsValues)
        : latestObsMs(sofrObs) ?? opts.endMs;

    // ── 6) RawMacroData 통합 → snapshot 빌드 ──────────────
    const raw: RawMacroData = {
      sofr,
      iorb,
      dgs10,
      dgs2,
      walcl: walclNow,
      rrp: rrpNow,
      tga: tgaNow,
      dxy: dxyNow,
      dxy_change_30d_pct: dxyChange30d,
      vix,
      fed_funds: fedFunds,
      cpi_yoy: cpiYoY,
      walcl_change_30d_pct: walclChange30d,
      rrp_tga_change_30d_pct: rrpTgaChange30d,
      bok_rate: bokRate,
      krw_usd: krwLatest,
    };

    const layer = buildMacroLayerSnapshot({
      snapshot_ts: releaseMs,
      release_ts: releaseMs,
      raw,
      as_of_ts: opts.endMs,
    });
    return [layer];
  } catch (err) {
    console.warn(
      `[macro/layer-builder] failed: ${(err as Error).message ?? "unknown"}`,
    );
    return [];
  }
}

/**
 * Convenience wrapper — 기존 호출자 (routers.ts macroV2.snapshot) 호환.
 */
export async function buildMacroLayer(
  startMs: number,
  endMs: number,
  mode: FredMode,
): Promise<MacroLayer[]> {
  const opts: BuildMacroRangeOpts = { startMs, endMs, mode };
  return buildMacroLayerRange(opts);
}
