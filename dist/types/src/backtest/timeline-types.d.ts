/**
 * LayeredSnapshot — 3-layer timeline data structure for the dual backtest
 * engine (DUAL_BACKTEST_ENGINE_PLAN §1.1 + MACRO_LIQUIDITY_TRACKER_v2 §1.2).
 *
 * Layer 1 (Signal): 캔들 + 사전 계산된 지표.
 * Layer 2 (Wave):   파동 식별 컨텍스트 (Phase 3 통합 — 현재 stub OK).
 * Layer 3 (Macro):  FRED/ALFRED 거시 데이터 + composite signals.
 *
 * Look-ahead 차단:
 *   - macro.release_ts ≤ candle.ts 강제 (`assertNoLookahead`).
 *   - wave 는 결정 시점까지의 캔들로만 산출 (구현 책임 = wave-engine).
 */
import type { CompositeSignals, CyclePhase } from "../macro/composite-signals";
import type { MacroRegime } from "../macro/liquidity";
export interface SignalLayer {
    /** RSI(14). */
    rsi: number;
    /** Bollinger upper band. */
    bb_upper: number;
    /** Bollinger middle band (SMA20). */
    bb_middle: number;
    /** Bollinger lower band. */
    bb_lower: number;
    /** BB position (0~1+) — (close - lower) / (upper - lower). */
    bb_position_pct: number;
    /** ADX. */
    adx: number;
    /** DI+. */
    diPlus: number;
    /** DI-. */
    diMinus: number;
    /** ATR(14). */
    atr: number;
    /** MACD histogram. */
    macd_histogram: number;
    /** Volume ratio vs EMA50. */
    volume_ratio: number;
}
export type WaveAlignment = "up" | "down" | "flat";
export type UptrendState = "intact" | "suspect" | "confirmed" | "broken";
export interface WaveLayer {
    current_wave_id: string | null;
    wave_start_ts: number | null;
    wave_progress_pct: number;
    swing_high: number | null;
    swing_low: number | null;
    alignment_4h: WaveAlignment;
    alignment_1d: WaveAlignment;
    alignment_1w: WaveAlignment;
    /** -1 ~ +1, 0 = mixed. */
    alignment_score: number;
    fib_anchor_low: number | null;
    fib_anchor_high: number | null;
    fib_levels: {
        level_236: number;
        level_382: number;
        level_500: number;
        level_618: number;
        level_786: number;
        level_1000: number;
        level_1272: number;
        level_1618: number;
    } | null;
    /** Current price 가 어느 fib 레벨 (0~1.618+) 에 있는가. */
    current_fib_position: number | null;
    uptrend_line_value: number | null;
    uptrend_strength: number;
    uptrend_state: UptrendState;
}
/** Phase 3 wave 통합 전까지의 default placeholder. */
export declare const EMPTY_WAVE_LAYER: WaveLayer;
export interface MacroLayer {
    /** 측정/적용 시점 (FRED observation date). */
    snapshot_ts: number;
    /** 발표 시점 — 백테스트 시 release_ts ≤ candle.ts 강제. */
    release_ts: number;
    /** Candle 시점 대비 거시 데이터 나이. */
    age_hours: number;
    sofr_iorb_spread_bp: number;
    yield_curve_10_2: number;
    walcl_change_30d_pct: number;
    rrp_tga_change_30d_pct: number;
    real_rate: number;
    dxy_change_30d_pct: number;
    vix: number;
    c1_crisis: number;
    c2_riskOn: number;
    c3_net_liquidity_30d_pct: number;
    c4_cycle_phase: CyclePhase;
    bok_rate: number | null;
    bok_rate_change_90d: number | null;
    krw_usd: number | null;
    krw_change_30d_pct: number | null;
    score: number;
    regime: MacroRegime;
    multiplier: number;
    freshness_mult: number;
    breakdown: {
        spread_score: number;
        yield_curve_score: number;
        walcl_score: number;
        rrp_tga_score: number;
        real_rate_score: number;
        dxy_score: number;
        vix_score: number;
        korea_score: number;
        c1_contribution: number;
        c2_contribution: number;
        c3_contribution: number;
        c4_contribution: number;
    };
}
export interface LayeredSnapshot {
    ts: number;
    symbol: string;
    tf: "4h" | "1d" | "1w";
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    signal: SignalLayer;
    wave: WaveLayer;
    /** null = macro 데이터 미포함 또는 미해당 시점. */
    macro: MacroLayer | null;
    dimensions: {
        momentum: number | null;
        volatility: number | null;
        trend: number | null;
        volume: number | null;
        structure: number | null;
        macro: number | null;
        onchain: number | null;
    };
}
export type Timeline = LayeredSnapshot[];
/**
 * `macro.release_ts > candle.ts` 인 snapshot 발견 시 throw.
 *
 * 백테스트 시작 전 / Timeline 빌드 직후 호출. 이 검증을 우회하면 결과
 * 메트릭이 무의미해지므로 절대 비활성화 금지 (헌장 backtest 원칙).
 */
export declare function assertNoLookahead(timeline: Timeline): void;
/**
 * 각 차원에 대표 지표 값을 1개 매핑. 차원이 측정되었으면 number,
 * 측정 미수행이면 null. cross-layer 통계의 입력.
 */
export declare function mapToDimensions(signal: SignalLayer, wave: WaveLayer, macro: MacroLayer | null): LayeredSnapshot["dimensions"];
export type { CompositeSignals, CyclePhase, MacroRegime };
