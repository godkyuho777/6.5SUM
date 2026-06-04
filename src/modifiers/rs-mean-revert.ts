/**
 * RS-MeanRevert — BTC 대비 상대 평균회귀 modifier — docs/2026-06-04-RS-MEANREVERT/00-DESIGN.md.
 *
 * BBDX 가 알트에 롱 진입할 때, 그 알트가 BTC 벤치마크 대비 *과도하게 뒤처졌으면*
 * (weak_laggard: rs30<−5% AND rs7<0) BB 하단에서의 mean-reversion 탄성이 강하다는
 * 백테스트 발견에 따라 신뢰도를 ×1.12 증폭. 그 외 모든 국면은 1.00 (영향 없음).
 *
 * RS-Rotation("리더를 사라" momentum)의 부호 반전형 — RS-Rotation 백테스트가
 * FAIL(leader 33.3% < laggard 36.5%)한 뒤, weak_laggard 40.1%(Wilson [37.5,42.8] >
 * baseline 34.8%, CI 비중첩)에서 유의 알파가 발견되어 이 modifier 로 승계되었다.
 * BBDX 는 구조적으로 mean-reversion(BB 하단 바운스)이라 momentum RS 와 충돌하고,
 * "BTC 에 가장 뒤진 알트"가 BB 하단에서 가장 강하게 반등하는 방향이 BBDX 와 맞는다.
 *
 * 차원 1 (Momentum 슬롯 유지, 라벨 "relative mean-reversion"). MACD div(같은 차원1,
 * 절대 다이버전스)와 측정 각도 직교 — 가격 자기평균 이탈 vs BTC 대비 상대 이탈.
 *
 * ── P1 = spot-only ①RS레벨(30d) + ②RS추세(7d) ─────────────────────────────
 * 두 지표 모두 spot 캔들(coin + BTC 벤치)만으로 산출 → lookahead-free 백테스트
 * 즉시 가능. (③도미넌스/BTC.D regime 게이트는 BTC.D 시계열 필요 → P2 보류.)
 *
 * 헌장 준수:
 *   - 벤치마크 자기자신(BTCUSDT) → multiplier 1.0 (RS=0 정의상 중립).
 *   - 데이터 부족 / NaN / 조인 실패 / 예외 → neutralModifier (multiplier 1.0, throw X).
 *   - 비대칭 설계 — 증폭(1.12)만, 억제(<1.0) 전면 금지. leader/strong_leader 는
 *     baseline 과 Wilson CI 중첩(유의하게 나쁘지 않음)이라 억제 시 역최적화
 *     (RS-Rotation 이 실패한 바로 그 함정)이 되므로 전부 1.0 으로 둔다.
 *   - 1.12 단독은 clampMultiplier 상한 1.40 안쪽 — combine 결과를 clamp 로 감싸 회귀 가드.
 *
 * Lookahead-free: i 시점 RS 는 coin.close[i−w..i] + btc.close[i−w..i] 만 참조.
 * coin↔BTC 캔들은 인덱스가 아닌 openTime 타임스탬프로 조인(코인별 상장일 차이로
 * 인덱스 어긋남 방지). 평가 시점 t 이전 데이터만 사용.
 */

import type { Candle } from "@shared/types";
import type { ModifierResult } from "./types";
import { neutralModifier } from "./types";

export type RsMeanRevertRegime =
  | "strong_leader"
  | "leader"
  | "neutral"
  | "laggard"
  | "weak_laggard"
  | "benchmark";

export interface RsMeanRevertResult extends ModifierResult {
  /** RS 레벨 (30d) — log(coin/btc)[t] − log(coin/btc)[t−30d]. <0 = BTC 언더퍼폼. */
  rs30: number;
  /** RS 추세 (7d) — RS 의 단기 기울기. <0 = 여전히 뒤지는 중. */
  rs7: number;
  regime: RsMeanRevertRegime;
}

const RS_NAME = "RS-MeanRevert";
const RS_DIMENSION = 1 as const;

/** 벤치마크 심볼 — 자기 자신은 RS=0 정의상 중립. */
const BENCHMARK_SYMBOL = "BTCUSDT";

/**
 * 4h 기준 lookback (캔들 수).
 *   30일 = 30 × 24 / 4 = 180 캔들
 *    7일 =  7 × 24 / 4 =  42 캔들
 *
 * NOTE — 설계서 P1 은 4h 전용. 다른 TF 로 호출돼도 동일 캔들 수를 쓰면 기간이
 * 달라지지만, 백테스트/스캐너 모두 4h 로 RS 를 평가하므로 캔들 수 고정이 단순·안전.
 */
const RS_LOOKBACK_30D = 180;
const RS_LOOKBACK_7D = 42;

/** rs30/rs7 둘 다 계산하려면 최소 (180 + 1) 캔들 필요. */
const RS_MIN_CANDLES = RS_LOOKBACK_30D + 1;

// ── regime bin 임계값 (설계서 §3) ──────────────────────────────────────────
const RS30_STRONG_LEADER = 0.05; // BTC 를 5%+ 아웃퍼폼
const RS30_LEADER = 0.02;
const RS30_LAGGARD = -0.02;
const RS30_WEAK_LAGGARD = -0.05; // BTC 에 5%+ 언더퍼폼

// ── multiplier (설계서 §3 — 비대칭: weak_laggard 만 증폭, 그 외 전부 1.0) ────
const MULT_WEAK_LAGGARD = 1.12;
const MULT_NEUTRAL = 1.0;

/**
 * openTime → close 맵 빌드. 타임스탬프 조인용(인덱스 조인 X).
 * 같은 openTime 중복 시 마지막 값으로 덮어쓰기(정상 데이터에선 발생 안 함).
 */
function buildCloseByOpenTime(candles: Candle[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const c of candles) {
    if (c && Number.isFinite(c.openTime) && Number.isFinite(c.close)) {
      map.set(c.openTime, c.close);
    }
  }
  return map;
}

/**
 * 평가 시점(coin 의 마지막 캔들) openTime 기준으로 rs30/rs7 산출.
 *
 * @param coinCandles  대상 코인의 시간순 정렬 spot 캔들. 마지막 캔들 = 평가 시점 t.
 * @param btcCandles   BTC 벤치마크의 시간순 정렬 spot 캔들.
 *
 * lookahead-free: t / t−42 / t−180 의 *coin openTime* 에 해당하는 BTC close 를
 * openTime 으로 조인. 미래 캔들 참조 없음. 조인 실패(BTC 결측) 시 null 반환.
 */
function computeRs(
  coinCandles: Candle[],
  btcCandles: Candle[],
): { rs30: number; rs7: number } | null {
  if (coinCandles.length < RS_MIN_CANDLES) return null;

  const t = coinCandles.length - 1;
  const coinNow = coinCandles[t];
  const coin30 = coinCandles[t - RS_LOOKBACK_30D];
  const coin7 = coinCandles[t - RS_LOOKBACK_7D];
  if (!coinNow || !coin30 || !coin7) return null;

  // BTC close 를 coin 의 openTime 으로 조인 — 인덱스 어긋남(상장일 차이) 방지.
  const btcByTime = buildCloseByOpenTime(btcCandles);
  const btcNow = btcByTime.get(coinNow.openTime);
  const btc30 = btcByTime.get(coin30.openTime);
  const btc7 = btcByTime.get(coin7.openTime);
  if (btcNow == null || btc30 == null || btc7 == null) return null;

  // 모든 close 양수여야 log 정의됨.
  if (
    !(coinNow.close > 0) ||
    !(coin30.close > 0) ||
    !(coin7.close > 0) ||
    !(btcNow > 0) ||
    !(btc30 > 0) ||
    !(btc7 > 0)
  ) {
    return null;
  }

  // rs30 = log(coin[t]/coin[t−180]) − log(btc[t]/btc[t−180])
  const rs30 =
    Math.log(coinNow.close / coin30.close) - Math.log(btcNow / btc30);
  // rs7 = log(coin/btc)[t] − log(coin/btc)[t−42]
  //     = [log(coin[t]) − log(btc[t])] − [log(coin[t−42]) − log(btc[t−42])]
  const rsNow = Math.log(coinNow.close) - Math.log(btcNow);
  const rs7Past = Math.log(coin7.close) - Math.log(btc7);
  const rs7 = rsNow - rs7Past;

  if (!Number.isFinite(rs30) || !Number.isFinite(rs7)) return null;
  return { rs30, rs7 };
}

/** rs30/rs7 → regime 분류 (설계서 §3 bin — rs-rotation 과 동일 bin 정의). */
function classifyRegime(rs30: number, rs7: number): RsMeanRevertRegime {
  if (rs30 > RS30_STRONG_LEADER && rs7 > 0) return "strong_leader";
  if (rs30 > RS30_LEADER) return "leader";
  if (rs30 < RS30_WEAK_LAGGARD && rs7 < 0) return "weak_laggard";
  if (rs30 < RS30_LAGGARD) return "laggard";
  return "neutral";
}

/**
 * regime → multiplier.
 *
 * 비대칭 설계(설계서 §3): weak_laggard 만 ×1.12 증폭, 그 외(strong_leader/leader/
 * neutral/laggard) 전부 1.00. **억제(<1.0) 절대 금지** — leader 계열은 baseline 과
 * Wilson CI 중첩(유의하게 나쁘지 않음)이라 억제 시 역최적화.
 */
function regimeToMultiplier(regime: RsMeanRevertRegime): number {
  switch (regime) {
    case "weak_laggard":
      return MULT_WEAK_LAGGARD;
    case "strong_leader":
    case "leader":
    case "laggard":
    case "neutral":
    case "benchmark":
      return MULT_NEUTRAL;
  }
}

/**
 * RS-MeanRevert multiplier 산출.
 *
 * @param coinCandles 대상 코인의 시간순 정렬 spot 캔들. 마지막 = 평가 시점 t.
 * @param btcCandles  BTC 벤치마크 spot 캔들 (openTime 조인용).
 * @param symbol      대상 코인 심볼. BTCUSDT(벤치) → 1.0 중립.
 *
 * 데이터 부족 / 조인 실패 / NaN / 예외 → multiplier 1.0 (기존 동작 불변, throw X).
 */
export function computeRsMeanRevert(
  coinCandles: Candle[],
  btcCandles: Candle[],
  symbol: string,
): RsMeanRevertResult {
  try {
    const sym = (symbol ?? "").toUpperCase();

    // 벤치마크 자기 자신 → RS=0 정의상 중립.
    if (sym === BENCHMARK_SYMBOL) {
      return {
        ...neutralModifier(RS_DIMENSION, `${RS_NAME} — 벤치마크(${sym}) 자기참조 중립`, "real"),
        rs30: 0,
        rs7: 0,
        regime: "benchmark",
      };
    }

    if (!coinCandles || coinCandles.length < RS_MIN_CANDLES) {
      return {
        ...neutralModifier(
          RS_DIMENSION,
          `${RS_NAME} — coin 캔들 부족 (${coinCandles?.length ?? 0} < ${RS_MIN_CANDLES})`,
          "stub",
        ),
        rs30: 0,
        rs7: 0,
        regime: "neutral",
      };
    }
    if (!btcCandles || btcCandles.length < RS_MIN_CANDLES) {
      return {
        ...neutralModifier(
          RS_DIMENSION,
          `${RS_NAME} — BTC 벤치 캔들 부족 (${btcCandles?.length ?? 0} < ${RS_MIN_CANDLES})`,
          "stub",
        ),
        rs30: 0,
        rs7: 0,
        regime: "neutral",
      };
    }

    const rs = computeRs(coinCandles, btcCandles);
    if (rs == null) {
      // openTime 조인 실패(BTC 결측) 또는 close 비양수 → 중립.
      return {
        ...neutralModifier(
          RS_DIMENSION,
          `${RS_NAME} — RS 산출 불가 (openTime 조인 실패/데이터 무효)`,
          "stub",
        ),
        rs30: 0,
        rs7: 0,
        regime: "neutral",
      };
    }

    const { rs30, rs7 } = rs;
    const regime = classifyRegime(rs30, rs7);
    const multiplier = regimeToMultiplier(regime);

    return {
      multiplier,
      rawScore: Math.round(rs30 * 1000) / 10, // rs30 을 %p 스케일로 (−0.05 → −5.0)
      reason: `relative mean-reversion (BTC 대비 과이탈 반등) ${regime} (rs30=${(rs30 * 100).toFixed(2)}%p, rs7=${(rs7 * 100).toFixed(2)}%p vs ${BENCHMARK_SYMBOL}) → ×${multiplier.toFixed(3)}`,
      dimension: RS_DIMENSION,
      status: "real",
      rs30,
      rs7,
      regime,
    };
  } catch (err: any) {
    // 헌장: modifier 실패가 호출 체인을 깨선 안 됨 → graceful neutral.
    const detail = String(err?.message ?? err);
    console.warn(`[Modifier:rs-mean-revert] compute failed: ${detail}`);
    return {
      ...neutralModifier(
        RS_DIMENSION,
        `${RS_NAME} — 계산 실패 (graceful neutral)`,
        "error",
        detail,
      ),
      rs30: 0,
      rs7: 0,
      regime: "neutral",
    };
  }
}
