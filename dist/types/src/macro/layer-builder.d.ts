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
import { type FredMode } from "./sources/fred";
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
export declare function buildMacroLayer(startMs: number, endMs: number, mode: FredMode): Promise<MacroLayer[]>;
export declare function buildMacroLayerRange(opts: BuildMacroRangeOpts): Promise<MacroLayer[]>;
