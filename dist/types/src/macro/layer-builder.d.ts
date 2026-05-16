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
import { type FredFetchResult, type FredMode, type FredObservation } from "./sources/fred";
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
 * 12개 FRED 시리즈 observations 를 일별 RawMacroData 시퀀스로 변환.
 *
 * 각 일자 마다:
 *   - 그 날 가장 최근 valid observation 값 사용 (FRED 는 weekly/monthly
 *     시리즈도 있음 → step function 으로 forward-fill).
 *   - 누락이 forward-fill 가능 범위 밖이면 undefined.
 *
 * 사용 시리즈: SOFR / IORB / DGS10 / DGS2 / WALCL / RRP / TGA / DXY /
 *              VIX / FEDFUNDS / CPI (DFII10 는 본 단계 무관 — 옵션).
 *
 * CPI YoY 는 각 grid 일자 d 에 대해 d 와 d - 365일 의 CPI 차분으로 계산.
 * WALCL/DXY 30d 변화율은 d 와 d - 30일 의 변화율로 계산.
 * RRP+TGA 30d 변화율도 동일 — 둘 다 있어야만 계산.
 *
 * @param fredResults `Map<seriesId, FredFetchResult>` 또는 동일 모양의 Record.
 *                    Map 인 경우만 직접 받아도 무방.
 * @param endMs       시퀀스 종료 시점 (epoch ms).
 * @param daysCount   90+ days. default 120 (C4 90d + 여유 30d).
 * @returns RawMacroData[] — 오래된 → 최신 순.
 *          `history[history.length - 1]` 가 endMs 시점 (가장 최신).
 */
export declare function buildMacroRawHistory(fredResults: Map<string, FredFetchResult>, endMs: number, daysCount?: number): RawMacroData[];
/**
 * Time-range MacroLayer 빌더 — endMs 시점의 단일 layer 반환.
 *
 * 동작:
 *   1. FRED_API_KEY 없으면 [] 반환 (stub-first).
 *   2. 12개 FRED 시리즈를 병렬 호출 (mode=backtest 시 ALFRED 강제).
 *   3. 한국 BOK 환율 (731Y004) 호출 (key 없으면 Yahoo fallback).
 *   4. 각 시리즈에서 latest + 30d-ago / 365d-ago 추출 → RawMacroData 채움.
 *   5. release_ts = 가장 늦은 시리즈의 latest obs 시점.
 *   6. buildMacroRawHistory 로 120일 일별 grid + forward-fill 시퀀스 빌드.
 *   7. buildMacroLayerSnapshot(history) → C3/C4 자동 계산.
 *
 * 본 구현은 단일-point timeline 반환. 일별 stride 시퀀스는 Phase 3.5 에서.
 *
 * C3 (30d net-liquidity) / C4 (90d cycle phase) 는 history 길이만 충분하면
 * 자동 계산. 데이터 부족 시 0 / "neutral" 로 graceful fallback.
 */
export declare function buildMacroLayerRange(opts: BuildMacroRangeOpts): Promise<MacroLayer[]>;
/**
 * Convenience wrapper — 기존 호출자 (routers.ts macroV2.snapshot) 호환.
 */
export declare function buildMacroLayer(startMs: number, endMs: number, mode: FredMode): Promise<MacroLayer[]>;
