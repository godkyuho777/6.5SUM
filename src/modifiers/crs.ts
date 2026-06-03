/**
 * CRS — Capitulation Reversal Score (청산 반전 점수) — docs/2026-06-03-CRS/00-DESIGN.md.
 *
 * 청산 cascade(롱 강제 청산 플러시)가 BB 하단에 착지한 뒤 falling-knife 가
 * 풀린 첫 반등 캔들에서 = 고확률 mean-reversion 롱. BBDX 롱 진입 신뢰도를
 * 곱셈 modifier(1.00~1.10)로만 증폭. 단독 시그널 발행 X (헌장 규칙3, modifier-only).
 *
 * 차원 6 (macro / derivatives positioning).
 *
 * ── P1 = CRS-lite (현재 구현 범위) ──────────────────────────────────────
 * spot 캔들만으로 산출 가능한 3 신호로 한정 → lookahead-free 백테스트 즉시 가능:
 *   ② price velocity (ATR 정규화 하락 속도)
 *   ③ lower wick ratio (저점 흡수)
 *   ⑤ BB 하단 게이트 (BBDX 도메인 결속)
 * ① ΔOI / ④ funding gate 는 OI 시계열 미확보로 P2 보류 (파일 하단 TODO).
 *
 * 헌장 준수:
 *   - 게이트 미통과 / 데이터 부족 / 예외 → neutralModifier (multiplier 1.0, throw X).
 *   - active 시에만 강도 산출, 상한 1.10 (funding-extreme ×1.20 과 곱셈 시
 *     clampMultiplier 상한 1.40 여유 확보).
 */

import type { Candle } from "@shared/types";
import type { ModifierResult } from "./types";
import { neutralModifier } from "./types";
import { calculateATR, calculateBollingerBands } from "../indicators";
import { SIGNAL_THRESHOLDS } from "../config/signal-thresholds";

// CRS-lite (P1) — vel + wick + BB게이트 (spot 캔들로 즉시 백테스트 가능)
const CRS_VEL_LOOKBACK = 3;
const CRS_VEL_THRESHOLD_4H = -1.5; // bbdx stop(1.5×ATR) 대칭
const CRS_VEL_THRESHOLD_1H = -2.0; // 1h ATR 작음 → 강화
const CRS_WICK_THRESHOLD = 0.5; // 분모=range. pinBar(0.6)·양봉(0.4) 중간
const CRS_BB_TOLERANCE = SIGNAL_THRESHOLDS.long.num.bbTolerance; // =0.02, 신규상수 만들지 말 것
const CRS_W_VEL = 0.6;
const CRS_W_WICK = 0.4;
const CRS_LITE_MAX_BOOST = 0.10; // 상한 1.10 (funding-extreme×1.20와 곱셈 시 clamp 1.40 여유). 1.15로 올리지 말 것

const CRS_NAME = "Capitulation Reversal";
const CRS_DIMENSION = 6 as const;
/** ATR(14) + BB(20) + vel lookback. 최소 캔들 수. */
const CRS_MIN_CANDLES = 20 + CRS_VEL_LOOKBACK;

/** [0,1] clamp 헬퍼 (로컬). */
function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/**
 * CRS-lite multiplier 산출.
 *
 * @param candles 시간순 정렬 spot 캔들. 마지막 캔들 = 평가 대상(= falling-knife 풀린 반등 캔들).
 * @param timeframe "1h" 면 vel 임계값 강화, 그 외(4h 포함)는 4h 값 fallback.
 *
 * 게이트(BB 하단 + 급락 vel + 긴 아래꼬리) 미통과 시 multiplier 1.0 → 기존 동작 불변.
 */
export function computeCRS(candles: Candle[], timeframe: string): ModifierResult {
  try {
    if (!candles || candles.length < CRS_MIN_CANDLES) {
      return neutralModifier(
        CRS_DIMENSION,
        `${CRS_NAME} — 데이터 부족 (${candles?.length ?? 0} < ${CRS_MIN_CANDLES})`,
        "stub",
      );
    }

    const closes = candles.map((c) => c.close);
    const atr = calculateATR(candles, 14); // 마지막값
    const bbLower = calculateBollingerBands(closes, 20, 2).lower; // 마지막 lower

    const at = candles.length - 1;
    const last = candles[at];
    const prev = candles[at - CRS_VEL_LOOKBACK];

    // ATR 0(데이터 이상) 이면 vel 계산 불가 → 중립.
    if (!(atr > 0) || !last || !prev) {
      return neutralModifier(CRS_DIMENSION, `${CRS_NAME} — ATR/캔들 무효 (중립)`, "stub");
    }

    // ② price velocity — ATR 정규화 하락 속도 (음수 = 하락).
    const vel = (last.close - prev.close) / atr;
    const velThreshold =
      timeframe === "1h" ? CRS_VEL_THRESHOLD_1H : CRS_VEL_THRESHOLD_4H;

    // ③ lower wick ratio — (min(open,close) - low) / range. 저점 흡수.
    const range = last.high - last.low;
    const wick = range > 0 ? (Math.min(last.open, last.close) - last.low) / range : 0;

    // ⑤ BB 하단 게이트 — BBDX 가 진입하는 위치와 결속.
    const bbGate = last.close <= bbLower * (1 + CRS_BB_TOLERANCE);

    const active = bbGate && vel <= velThreshold && wick >= CRS_WICK_THRESHOLD;

    if (!active) {
      return neutralModifier(CRS_DIMENSION, `${CRS_NAME} — 청산 반전 셋업 아님`, "real");
    }

    // ── 게이트 통과 → 강도 산출 [0,1] ──────────────────────────────────
    // normVel: 0@threshold, 1@2×threshold (예: 4h −1.5 → 0, −3.0 → 1).
    const normVel = clamp01(
      (Math.abs(vel) - Math.abs(velThreshold)) / Math.abs(velThreshold),
    );
    // normWick: 0@threshold, 1@1.0 (꼬리가 range 전체면 1).
    const normWick = clamp01((wick - CRS_WICK_THRESHOLD) / (1 - CRS_WICK_THRESHOLD));

    const strength = CRS_W_VEL * normVel + CRS_W_WICK * normWick; // [0,1]
    const mult = 1.0 + strength * CRS_LITE_MAX_BOOST; // [1.0, 1.10]

    return {
      multiplier: mult,
      rawScore: Math.round(strength * 100),
      reason: `청산 플러시(vel ${vel.toFixed(2)}ATR) + 저점흡수(wick ${(wick * 100).toFixed(0)}%) @ BB하단 → mean-reversion 롱 ×${mult.toFixed(3)}`,
      dimension: CRS_DIMENSION,
      status: "real",
    };
  } catch (err: any) {
    // 헌장: modifier 실패가 호출 체인을 깨선 안 됨 → graceful neutral.
    const detail = String(err?.message ?? err);
    console.warn(`[Modifier:crs] compute failed: ${detail}`);
    return neutralModifier(
      CRS_DIMENSION,
      `${CRS_NAME} — 계산 실패 (graceful neutral)`,
      "error",
      detail,
    );
  }
}

// TODO P2: ΔOI + funding gate (OI forward-collect 후)
