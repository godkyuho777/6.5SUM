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
import { fetchFred, type FredMode } from "./sources/fred";
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
// Time-range builder (lazy, stub-first)
// ─────────────────────────────────────────────────────────

export interface BuildMacroRangeOpts {
  startMs: number;
  endMs: number;
  mode: FredMode;
  /** 일별 stride. default 1d. */
  strideMs?: number;
}

/**
 * 시간 범위에 대한 MacroLayer 시퀀스 생성.
 *
 * 현재 구현은 stub-first:
 *   - FRED_API_KEY 미설정 → 빈 배열 (호출자 graceful 처리).
 *   - FRED key 설정 시: 각 stride 시점마다 fetchFred 호출 시도 후 raw 빌드.
 *     BOK_API_KEY 있으면 환율도 함께 fetch.
 *
 * Phase 3.5 완전 통합 (vintage 정합) 까지는 1-point timeline 만 반환할 수
 * 있다. 본 함수가 stub 상태여도 ALFRED 강제 로직은 그대로 작동.
 */
export async function buildMacroLayer(
  startMs: number,
  endMs: number,
  mode: FredMode,
): Promise<MacroLayer[]> {
  const opts: BuildMacroRangeOpts = { startMs, endMs, mode };
  return buildMacroLayerRange(opts);
}

export async function buildMacroLayerRange(
  opts: BuildMacroRangeOpts,
): Promise<MacroLayer[]> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    return [];
  }

  // 본 구현은 의도적으로 conservative — Phase 3.5 까지 1 point.
  try {
    const startISO = new Date(opts.startMs).toISOString().slice(0, 10);
    const endISO = new Date(opts.endMs).toISOString().slice(0, 10);

    // SOFR/IORB 등 단일 fetch trial (stub 시 빈 결과)
    const trial = await fetchFred(
      opts.mode === "backtest"
        ? {
            seriesId: "SOFR",
            mode: "backtest",
            realtimeStart: startISO,
            realtimeEnd: endISO,
          }
        : { seriesId: "SOFR", mode: "realtime" },
    );
    if (trial.status !== "ok" || trial.observations.length === 0) return [];

    // BOK 환율 시도 (key 없으면 yahoo fallback, 그것마저 실패면 무시)
    let krwSeries: { date: string; value: number }[] = [];
    try {
      const krw = await fetchBOK({
        statCode: "731Y004",
        startDate: startISO,
        endDate: endISO,
      });
      krwSeries = krw.values;
    } catch {
      krwSeries = [];
    }

    // 본 stub: trial 의 가장 최신 점에 대해 한 개의 MacroLayer 만 생성.
    const lastObs = trial.observations[trial.observations.length - 1];
    const lastKrw =
      krwSeries.length > 0 ? krwSeries[krwSeries.length - 1] : null;
    const releaseMs = new Date(lastObs.date).getTime();

    const layer = buildMacroLayerSnapshot({
      snapshot_ts: releaseMs,
      release_ts: releaseMs,
      raw: {
        sofr: Number.isFinite(lastObs.value) ? lastObs.value : undefined,
        krw_usd: lastKrw ? lastKrw.value : undefined,
      },
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
