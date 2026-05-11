/**
 * Timeline builder — 3-layer 통합 데이터 구조 빌드.
 *
 * DUAL_BACKTEST_ENGINE_PLAN §1.2 + MACRO_LIQUIDITY_TRACKER_v2 §4.2.
 *
 * 알고리즘:
 *   1. Layer 1 (Signal) — candles + per-bar 지표 사전 계산 (lookahead-free).
 *   2. Layer 2 (Wave)   — wave 컨텍스트 (현재 stub — Phase 3 통합 예정).
 *   3. Layer 3 (Macro)  — FRED/ALFRED forward-fill, release_ts ≤ candle.ts 강제.
 *   4. 결합 + 7차원 매핑 + assertNoLookahead.
 */

import type { Candle, TimeframeValue } from "@shared/types";
import { fetchHistoricalKlines } from "./data-loader";
import { calculateAllIndicators } from "../indicators";
import {
  type LayeredSnapshot,
  type MacroLayer,
  type SignalLayer,
  type Timeline,
  EMPTY_WAVE_LAYER,
  assertNoLookahead,
  mapToDimensions,
} from "./timeline-types";
import {
  computeCompositeSignals,
  macroFreshnessMult,
  type CompositeSignals,
  type RawMacroData,
} from "../macro/composite-signals";
import { computeMacroScoreV2 } from "../macro/liquidity";
import { fetchFred, type FredMode } from "../macro/sources/fred";

// ─────────────────────────────────────────────────────────
// Options
// ─────────────────────────────────────────────────────────

export interface BuildTimelineOpts {
  symbol: string;
  tf: TimeframeValue;
  startMs: number;
  endMs: number;
  includeWave?: boolean;
  includeMacro?: boolean;
  /** backtest → ALFRED 강제. realtime → 일반 FRED. */
  mode: FredMode;
  /** 사전 fetch 된 candles (테스트에서 mock 주입용). */
  candlesOverride?: Candle[];
  /** 사전 빌드된 macro datapoints (테스트에서 mock 주입용). */
  macroOverride?: MacroDataPoint[] | null;
}

// ─────────────────────────────────────────────────────────
// Macro datapoint (release-stamped)
// ─────────────────────────────────────────────────────────

export interface MacroDataPoint {
  /** 측정/관측 ts (FRED observation date → ms). */
  snapshot_ts: number;
  /** 발표 ts (백테스트 시 candle.ts 와 비교). */
  release_ts: number;
  raw: RawMacroData;
  composite: CompositeSignals;
  /** macroLiquidityScore v2 결과 (score/regime/multiplier/breakdown). */
  v2: ReturnType<typeof computeMacroScoreV2>;
}

// ─────────────────────────────────────────────────────────
// Signal layer extraction (per-bar)
// ─────────────────────────────────────────────────────────

/**
 * 캔들 i 시점의 SignalLayer 산출. **Lookahead-free** — candles[0..i] 만 사용.
 *
 * 지표가 워밍업 미충족이거나 NaN 일 경우 0 으로 fill (graceful).
 */
function extractSignalLayer(candlesUpToI: Candle[]): SignalLayer {
  if (candlesUpToI.length < 2) {
    return {
      rsi: 50,
      bb_upper: 0,
      bb_middle: 0,
      bb_lower: 0,
      bb_position_pct: 0.5,
      adx: 0,
      diPlus: 0,
      diMinus: 0,
      atr: 0,
      macd_histogram: 0,
      volume_ratio: 1,
    };
  }

  const ind = calculateAllIndicators(candlesUpToI);
  const last = candlesUpToI[candlesUpToI.length - 1];
  const bbRange = ind.bbUpper - ind.bbLower;
  const bbPos = bbRange > 0 ? (last.close - ind.bbLower) / bbRange : 0.5;

  // volume_ratio vs simple 50-EMA approximation (SMA50 fallback)
  const lookback = Math.min(50, candlesUpToI.length);
  const volSlice = candlesUpToI.slice(-lookback);
  const avgVol =
    volSlice.reduce((s, c) => s + c.volume, 0) / Math.max(1, volSlice.length);
  const volRatio = avgVol > 0 ? last.volume / avgVol : 1;

  // ATR via TR(14) approx
  let atr = 0;
  const atrLen = Math.min(14, candlesUpToI.length - 1);
  if (atrLen > 0) {
    let sum = 0;
    for (let i = candlesUpToI.length - atrLen; i < candlesUpToI.length; i++) {
      const c = candlesUpToI[i];
      const prev = candlesUpToI[i - 1];
      const tr = Math.max(
        c.high - c.low,
        Math.abs(c.high - prev.close),
        Math.abs(c.low - prev.close),
      );
      sum += tr;
    }
    atr = sum / atrLen;
  }

  return {
    rsi: Number.isFinite(ind.rsi) ? ind.rsi : 50,
    bb_upper: ind.bbUpper,
    bb_middle: ind.bbMiddle,
    bb_lower: ind.bbLower,
    bb_position_pct: bbPos,
    adx: Number.isFinite(ind.adx) ? ind.adx : 0,
    diPlus: ind.plusDi,
    diMinus: ind.minusDi,
    atr,
    macd_histogram: 0, // TODO: wire 후 노출 — 현재 indicators 가 직접 노출 X
    volume_ratio: volRatio,
  };
}

// ─────────────────────────────────────────────────────────
// Macro layer fetcher (stub-first)
// ─────────────────────────────────────────────────────────

/**
 * 영업일 단위 macro snapshot 시퀀스를 빌드.
 *
 * `FRED_API_KEY` 미설정 또는 mode 호환되지 않으면 빈 배열 반환 — 호출자
 * (buildTimeline) 는 macro=null 로 진행 (graceful).
 *
 * 본 함수는 의도적으로 "각 영업일에 한 점" 추출 — Phase 3 fully wired
 * 시점에 ALFRED 별도 호출로 vintage 완전 정합 보장.
 */
export async function buildMacroLayer(
  startMs: number,
  endMs: number,
  mode: FredMode,
): Promise<MacroDataPoint[]> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    // graceful stub — 호출자가 null 처리
    return [];
  }

  // TODO Phase 3.5: 영업일 페이지네이션 호출로 raw 시리즈 벡터 빌드.
  // 현재 stub: 모든 시리즈를 한 번씩 fetch 해 최신 값만 추출하는 1-point timeline.
  // 본 함수가 stub 인 동안에도 fetchFred 의 ALFRED 강제 로직은 그대로 작동.
  try {
    const seriesIds = [
      "SOFR", "IORB", "DGS10", "DGS2", "FEDFUNDS",
      "WALCL", "RRPONTSYD", "WTREGEN", "CPIAUCSL", "DTWEXBGS", "VIXCLS",
    ];
    const startISO = new Date(startMs).toISOString().slice(0, 10);
    const endISO = new Date(endMs).toISOString().slice(0, 10);

    const fetchOne = async (sid: string) => {
      const opts =
        mode === "backtest"
          ? {
              seriesId: sid,
              mode: "backtest" as const,
              realtimeStart: startISO,
              realtimeEnd: endISO,
            }
          : { seriesId: sid, mode: "realtime" as const };
      const r = await fetchFred(opts);
      return { sid, r };
    };
    await Promise.all(seriesIds.map((s) => fetchOne(s).catch(() => null)));
    // 본 stub 은 빈 timeline 반환 — Phase 3.5 완전 통합 시 raw 변환 로직 추가.
    return [];
  } catch (err) {
    console.warn(
      `[timeline] macro fetch failed: ${(err as Error).message ?? "unknown"}`,
    );
    return [];
  }
}

// ─────────────────────────────────────────────────────────
// Main: buildTimeline
// ─────────────────────────────────────────────────────────

/**
 * 3-layer timeline 빌드.
 *
 * @throws ALFRED 모드에서 realtimeStart 누락 시 (`fetchFred` 가 강제).
 *         look-ahead bias 가 감지되면 (`assertNoLookahead`).
 */
export async function buildTimeline(
  opts: BuildTimelineOpts,
): Promise<Timeline> {
  // ── Layer 1: candles ──────────────────────────────────
  const candles: Candle[] =
    opts.candlesOverride ??
    (await fetchHistoricalKlines({
      symbol: opts.symbol,
      tf: opts.tf,
      startMs: opts.startMs,
      endMs: opts.endMs,
    }));

  if (candles.length === 0) {
    return [];
  }

  // ── Layer 3: macro ────────────────────────────────────
  const macroPoints =
    opts.macroOverride !== undefined
      ? opts.macroOverride ?? []
      : opts.includeMacro
        ? await buildMacroLayer(opts.startMs, opts.endMs, opts.mode)
        : [];

  // sort by release_ts (ascending) — required for forward-fill
  macroPoints.sort((a, b) => a.release_ts - b.release_ts);

  // ── Combine: forward-fill, look-ahead 차단 ────────────
  const timeline: Timeline = [];
  let macroIdx = 0;
  let lastMacro: MacroDataPoint | null = null;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const upTo = candles.slice(0, i + 1);
    const signal = extractSignalLayer(upTo);

    // forward-fill macro — release_ts ≤ candle.ts 만 허용
    while (
      macroIdx < macroPoints.length &&
      macroPoints[macroIdx].release_ts <= c.openTime
    ) {
      lastMacro = macroPoints[macroIdx];
      macroIdx++;
    }

    let macro: MacroLayer | null = null;
    if (lastMacro) {
      const ageHours = (c.openTime - lastMacro.release_ts) / (1000 * 60 * 60);
      const freshness = macroFreshnessMult(ageHours);
      const v2 = lastMacro.v2;
      const raw = lastMacro.raw;
      const composite = lastMacro.composite;
      macro = {
        snapshot_ts: lastMacro.snapshot_ts,
        release_ts: lastMacro.release_ts,
        age_hours: ageHours,
        sofr_iorb_spread_bp:
          raw.sofr != null && raw.iorb != null
            ? (raw.sofr - raw.iorb) * 100
            : 0,
        yield_curve_10_2:
          raw.dgs10 != null && raw.dgs2 != null ? raw.dgs10 - raw.dgs2 : 0,
        walcl_change_30d_pct: raw.walcl_change_30d_pct ?? 0,
        rrp_tga_change_30d_pct: raw.rrp_tga_change_30d_pct ?? 0,
        real_rate:
          raw.fed_funds != null && raw.cpi_yoy != null
            ? raw.fed_funds - raw.cpi_yoy
            : 0,
        dxy_change_30d_pct: raw.dxy_change_30d_pct ?? 0,
        vix: raw.vix ?? 0,
        c1_crisis: composite.c1_crisis,
        c2_riskOn: composite.c2_riskOn,
        c3_net_liquidity_30d_pct: composite.c3_net_liquidity_30d_pct,
        c4_cycle_phase: composite.c4_cycle_phase,
        bok_rate: raw.bok_rate ?? null,
        bok_rate_change_90d: raw.bok_rate_change_90d ?? null,
        krw_usd: raw.krw_usd ?? null,
        krw_change_30d_pct: raw.krw_change_30d_pct ?? null,
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

    const wave = EMPTY_WAVE_LAYER;
    timeline.push({
      ts: c.openTime,
      symbol: opts.symbol,
      tf: opts.tf as "4h" | "1d" | "1w",
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      signal,
      wave,
      macro,
      dimensions: mapToDimensions(signal, wave, macro),
    });
  }

  // ── Look-ahead 강제 검증 ──────────────────────────────
  assertNoLookahead(timeline);

  return timeline;
}

// ─────────────────────────────────────────────────────────
// Test helper — build a single MacroDataPoint
// ─────────────────────────────────────────────────────────

/**
 * 테스트에서 mock macro 데이터 생성용. raw + history 로 composite 계산.
 */
export function createMacroDataPoint(opts: {
  snapshot_ts: number;
  release_ts: number;
  raw: RawMacroData;
  history?: RawMacroData[];
}): MacroDataPoint {
  const composite = computeCompositeSignals(opts.raw, opts.history ?? []);
  const v2 = computeMacroScoreV2(
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
  return {
    snapshot_ts: opts.snapshot_ts,
    release_ts: opts.release_ts,
    raw: opts.raw,
    composite,
    v2,
  };
}
