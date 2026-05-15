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
import { macroFreshnessMult, type RawMacroData } from "./composite-signals";
import { type FredMode, type FredObservation } from "./sources/fred";
import type { MacroLayer } from "./layer-types";
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
/**
 * 한 시점의 raw macro 데이터로부터 통합 MacroLayer 객체 생성.
 *
 * Pure 함수. composite 계산 → v2 score → freshness 곱셈 → breakdown.
 */
export declare function buildMacroLayerSnapshot(opts: BuildMacroLayerOpts): MacroLayer;
export { macroFreshnessMult };
/**
 * MacroLayer 의 base multiplier 를 freshness 로 약화.
 *   effective = 1 + (multiplier - 1) * freshness_mult
 *
 * (CLAUDE 명세서 §3.4 / prompt 요구사항.)
 */
export declare function effectiveMacroMultiplier(layer: MacroLayer): number;
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
export declare const FRED_SERIES_FOR_LAYER: readonly ["SOFR", "IORB", "DGS10", "DGS2", "WALCL", "RRPONTSYD", "WTREGEN", "DTWEXBGS", "VIXCLS", "FEDFUNDS", "CPIAUCSL", "DFII10"];
/**
 * 가장 최근의 numeric (NaN 제외) observation 값. 없으면 undefined.
 */
export declare function latestValid(obs: FredObservation[]): number | undefined;
/**
 * 가장 최근 obs date 에서 `days` 일 전 시점에 가장 가까운 valid observation
 * 의 값. 데이터 부족/없음 → undefined.
 */
export declare function valueDaysAgo(obs: FredObservation[], days: number): number | undefined;
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
export declare function buildMacroLayerRange(opts: BuildMacroRangeOpts): Promise<MacroLayer[]>;
/**
 * Convenience wrapper — 기존 호출자 (routers.ts macroV2.snapshot) 호환.
 */
export declare function buildMacroLayer(startMs: number, endMs: number, mode: FredMode): Promise<MacroLayer[]>;
