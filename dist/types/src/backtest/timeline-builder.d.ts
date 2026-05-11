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
import { type Timeline } from "./timeline-types";
import { type CompositeSignals, type RawMacroData } from "../macro/composite-signals";
import { computeMacroScoreV2 } from "../macro/liquidity";
import { type FredMode } from "../macro/sources/fred";
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
/**
 * 영업일 단위 macro snapshot 시퀀스를 빌드.
 *
 * `FRED_API_KEY` 미설정 또는 mode 호환되지 않으면 빈 배열 반환 — 호출자
 * (buildTimeline) 는 macro=null 로 진행 (graceful).
 *
 * 본 함수는 의도적으로 "각 영업일에 한 점" 추출 — Phase 3 fully wired
 * 시점에 ALFRED 별도 호출로 vintage 완전 정합 보장.
 */
export declare function buildMacroLayer(startMs: number, endMs: number, mode: FredMode): Promise<MacroDataPoint[]>;
/**
 * 3-layer timeline 빌드.
 *
 * @throws ALFRED 모드에서 realtimeStart 누락 시 (`fetchFred` 가 강제).
 *         look-ahead bias 가 감지되면 (`assertNoLookahead`).
 */
export declare function buildTimeline(opts: BuildTimelineOpts): Promise<Timeline>;
/**
 * 테스트에서 mock macro 데이터 생성용. raw + history 로 composite 계산.
 */
export declare function createMacroDataPoint(opts: {
    snapshot_ts: number;
    release_ts: number;
    raw: RawMacroData;
    history?: RawMacroData[];
}): MacroDataPoint;
