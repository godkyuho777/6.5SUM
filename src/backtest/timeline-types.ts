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

// ─────────────────────────────────────────────────────────
// Layer 1 — Signal indicators
// ─────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────
// Layer 2 — Wave context
// ─────────────────────────────────────────────────────────

export type WaveAlignment = "up" | "down" | "flat";
export type UptrendState = "intact" | "suspect" | "confirmed" | "broken";

export interface WaveLayer {
  current_wave_id: string | null;
  wave_start_ts: number | null;
  wave_progress_pct: number;
  swing_high: number | null;
  swing_low: number | null;

  // multi-TF alignment
  alignment_4h: WaveAlignment;
  alignment_1d: WaveAlignment;
  alignment_1w: WaveAlignment;
  /** -1 ~ +1, 0 = mixed. */
  alignment_score: number;

  // fibonacci
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

  // trendline
  uptrend_line_value: number | null;
  uptrend_strength: number;
  uptrend_state: UptrendState;
}

/** Phase 3 wave 통합 전까지의 default placeholder. */
export const EMPTY_WAVE_LAYER: WaveLayer = {
  current_wave_id: null,
  wave_start_ts: null,
  wave_progress_pct: 0,
  swing_high: null,
  swing_low: null,
  alignment_4h: "flat",
  alignment_1d: "flat",
  alignment_1w: "flat",
  alignment_score: 0,
  fib_anchor_low: null,
  fib_anchor_high: null,
  fib_levels: null,
  current_fib_position: null,
  uptrend_line_value: null,
  uptrend_strength: 0,
  uptrend_state: "intact",
};

// ─────────────────────────────────────────────────────────
// Layer 3 — Macro (MACRO_v2 §1.2)
// ─────────────────────────────────────────────────────────

export interface MacroLayer {
  /** 측정/적용 시점 (FRED observation date). */
  snapshot_ts: number;
  /** 발표 시점 — 백테스트 시 release_ts ≤ candle.ts 강제. */
  release_ts: number;
  /** Candle 시점 대비 거시 데이터 나이. */
  age_hours: number;

  // 7 single indicators
  sofr_iorb_spread_bp: number;
  yield_curve_10_2: number;
  walcl_change_30d_pct: number;
  rrp_tga_change_30d_pct: number;
  real_rate: number;
  dxy_change_30d_pct: number;
  vix: number;

  // 4 composite signals
  c1_crisis: number;
  c2_riskOn: number;
  c3_net_liquidity_30d_pct: number;
  c4_cycle_phase: CyclePhase;

  // Korea
  bok_rate: number | null;
  bok_rate_change_90d: number | null;
  krw_usd: number | null;
  krw_change_30d_pct: number | null;

  // integrated
  score: number;
  regime: MacroRegime;
  multiplier: number;
  freshness_mult: number;

  // breakdown for UI
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

// ─────────────────────────────────────────────────────────
// LayeredSnapshot
// ─────────────────────────────────────────────────────────

export interface LayeredSnapshot {
  ts: number;
  symbol: string;
  tf: "4h" | "1d" | "1w";

  // OHLCV
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;

  signal: SignalLayer;
  wave: WaveLayer;
  /** null = macro 데이터 미포함 또는 미해당 시점. */
  macro: MacroLayer | null;

  // 7 차원 매핑 (자동 채움) — 헌장 검증 + cross-layer 통계용
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

// ─────────────────────────────────────────────────────────
// Look-ahead bias 차단 (DUAL_BACKTEST §1.3)
// ─────────────────────────────────────────────────────────

/**
 * `macro.release_ts > candle.ts` 인 snapshot 발견 시 throw.
 *
 * 백테스트 시작 전 / Timeline 빌드 직후 호출. 이 검증을 우회하면 결과
 * 메트릭이 무의미해지므로 절대 비활성화 금지 (헌장 backtest 원칙).
 */
export function assertNoLookahead(timeline: Timeline): void {
  for (let i = 0; i < timeline.length; i++) {
    const t = timeline[i];
    if (t.macro && t.macro.release_ts > t.ts) {
      throw new Error(
        `[timeline] Look-ahead bias at index ${i} (ts=${t.ts}): ` +
          `macro.release_ts=${t.macro.release_ts} > candle.ts=${t.ts}`,
      );
    }
  }
}

// ─────────────────────────────────────────────────────────
// 7-dimension auto-mapping helper
// ─────────────────────────────────────────────────────────

/**
 * 각 차원에 대표 지표 값을 1개 매핑. 차원이 측정되었으면 number,
 * 측정 미수행이면 null. cross-layer 통계의 입력.
 */
export function mapToDimensions(
  signal: SignalLayer,
  wave: WaveLayer,
  macro: MacroLayer | null,
): LayeredSnapshot["dimensions"] {
  return {
    momentum: signal.rsi,
    volatility: signal.bb_position_pct,
    trend: signal.adx,
    volume: signal.volume_ratio,
    structure: wave.alignment_score,
    macro: macro ? macro.score : null,
    onchain: null, // 본 통합 외 (별도 dispatch)
  };
}

// ─────────────────────────────────────────────────────────
// Composite re-export (편의)
// ─────────────────────────────────────────────────────────

export type { CompositeSignals, CyclePhase, MacroRegime };
