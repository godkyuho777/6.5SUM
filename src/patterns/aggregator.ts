/**
 * Pattern Aggregator — PATTERN_SYSTEM_AUDIT.md 권고 사항 구현.
 *
 * Audit 의 critical 결함 4개 중 #2 #3 #4 + major #6 #7 #8 동시 해결:
 *  - #4: 다중 패턴 합산 (max + bonus, 정보 손실 X)
 *  - #6: 거래량 컨텍스트 multiplier
 *  - #7: 선행 추세 컨텍스트 multiplier (양봉/음봉 추세)
 *  - #8: TF 별 patternBase 차등
 *  - #3: look-ahead 안전성 — 모든 함수가 candles[idx>currentIdx] 접근 X
 *
 * 한계:
 *  - #1 의 자연어 정의는 indicators.ts 의 detect*At 가 이미 수식으로 옮긴 상태
 *  - #2 의 calibration 은 Phase D (백테스트 엔진 결과 후) 영역
 *  - #5 의 약세 패턴 추가 (Dark Cloud, Shooting Star, Hanging Man) 는 후속
 *
 * STRATEGY_CHARTER 검증:
 *  - 규칙 1 (차원 중복 X): 패턴=시장구조(5번), 거래량=거래량(4번), 추세=추세(3번)
 *    → 서로 다른 차원 결합 ✓
 *  - 규칙 2 (백테스트 알파 검증): patternBase / TF 임계는 임시값,
 *    calibration TODO 표기 + 매주 갱신 cron 으로 보완
 *  - 규칙 3 (단독 시그널 X): aggregator 출력은 BBDX 시그널 강도 multiplier 로만
 *    사용. 단독 진입 발행 X ✓
 */

import type {
  Candle,
  CandlePatternMatch,
  CandlePatternName,
  TimeframeValue,
} from "@shared/types";

// ─── TF 별 patternBase (audit §1.8 권고) ─────────────────────────────────
// Andrew Lo et al. (2000): 단기 (4H 이하) 캔들 패턴은 신뢰도 50% 부근 (random).
// 일봉 (1D) 약 52~58%, 주봉 (1W) 60~70%. 임계는 모두 임시 — calibration TODO.

const PATTERN_BASE_BY_TF: Record<TimeframeValue, Record<CandlePatternName, number>> = {
  // 1H — 가장 noisy (학술적으로 random에 가까움). audit §1.8 의 4H 권고치보다 더 보수.
  "1h": {
    engulfing: 0.55,
    morningStar: 0.60,
    threeWhiteSoldiers: 0.55,
    hammer: 0.45,
    invertedHammer: 0.45,
    pinBar: 0.45,
    doji: 0.20,
    bearishEngulfing: 0.55,
    eveningStar: 0.60,
    threeBlackCrows: 0.55,
  },
  // 4H — Tradelab 주력 TF. audit §1.8 의 임시값 그대로.
  "4h": {
    engulfing: 0.65,
    morningStar: 0.70,
    threeWhiteSoldiers: 0.65,
    hammer: 0.55,
    invertedHammer: 0.55,
    pinBar: 0.55,
    doji: 0.30,
    bearishEngulfing: 0.65,
    eveningStar: 0.70,
    threeBlackCrows: 0.65,
  },
  // 6H — 4H 와 1D 중간.
  "6h": {
    engulfing: 0.75,
    morningStar: 0.80,
    threeWhiteSoldiers: 0.75,
    hammer: 0.65,
    invertedHammer: 0.65,
    pinBar: 0.65,
    doji: 0.40,
    bearishEngulfing: 0.75,
    eveningStar: 0.80,
    threeBlackCrows: 0.75,
  },
  // 1D — Bulkowski 의 학술 통계가 가장 안정.
  "1d": {
    engulfing: 0.85,
    morningStar: 0.90,
    threeWhiteSoldiers: 0.85,
    hammer: 0.75,
    invertedHammer: 0.75,
    pinBar: 0.75,
    doji: 0.50,
    bearishEngulfing: 0.85,
    eveningStar: 0.90,
    threeBlackCrows: 0.85,
  },
  // 1W — 가장 신뢰. 큰 시간 단위라 random walk 영향 미미.
  "1w": {
    engulfing: 0.95,
    morningStar: 0.95,
    threeWhiteSoldiers: 0.90,
    hammer: 0.85,
    invertedHammer: 0.85,
    pinBar: 0.85,
    doji: 0.70,
    bearishEngulfing: 0.95,
    eveningStar: 0.95,
    threeBlackCrows: 0.90,
  },
  // 1M — 1W 와 동일 (데이터 부족 회피).
  "1M": {
    engulfing: 0.95,
    morningStar: 0.95,
    threeWhiteSoldiers: 0.90,
    hammer: 0.85,
    invertedHammer: 0.85,
    pinBar: 0.85,
    doji: 0.70,
    bearishEngulfing: 0.95,
    eveningStar: 0.95,
    threeBlackCrows: 0.90,
  },
};

/** TF + 패턴 이름 → 0~1 범위의 base 신뢰도. calibration 후 갱신 예정. */
export function getTfPatternBase(
  name: CandlePatternName,
  tf: TimeframeValue,
): number {
  const tfMap = PATTERN_BASE_BY_TF[tf] ?? PATTERN_BASE_BY_TF["4h"];
  return tfMap[name] ?? 0.5;
}

// ─── 거래량 컨텍스트 (audit #6) ──────────────────────────────────────────

export interface VolumeContext {
  /** 패턴 캔들 거래량 / EMA50 baseline 거래량 비율 */
  ratio: number;
  /** 거래량 multiplier (0.80 ~ 1.40) */
  multiplier: number;
  /** 사람-친화 라벨 */
  label: "very_high" | "high" | "elevated" | "normal" | "low";
}

/**
 * 패턴 캔들의 거래량 컨텍스트 계산.
 *
 * Bulkowski 통계:
 *   - 거래량 평균 × 1.5 동반 해머 → 78% 승률 (vs 거래량 무관 60%)
 *   - 거래량 평균 × 2.0 동반 → 84% 승률
 *
 * @param candleVolume 패턴 캔들의 volume
 * @param baselineVolume EMA50 등으로 산출한 baseline. 0 이면 ratio=1 처리.
 */
export function computeVolumeContext(
  candleVolume: number,
  baselineVolume: number,
): VolumeContext {
  if (!Number.isFinite(baselineVolume) || baselineVolume <= 0) {
    return { ratio: 1, multiplier: 1, label: "normal" };
  }
  const ratio = candleVolume / baselineVolume;
  let multiplier = 1.0;
  let label: VolumeContext["label"] = "normal";
  if (ratio >= 2.0) {
    multiplier = 1.40;
    label = "very_high";
  } else if (ratio >= 1.5) {
    multiplier = 1.25;
    label = "high";
  } else if (ratio >= 1.2) {
    multiplier = 1.10;
    label = "elevated";
  } else if (ratio < 0.8) {
    multiplier = 0.80;
    label = "low";
  }
  return { ratio, multiplier, label };
}

// ─── 선행 추세 컨텍스트 (audit #7) ───────────────────────────────────────

export interface TrendContext {
  /** 직전 N 캔들의 누적 수익률 (-1 ~ +1) */
  cumulativeReturn: number;
  /** 추세 multiplier (0.60 ~ 1.30) */
  multiplier: number;
  /** 사람-친화 라벨 */
  label: "strong_down" | "mild_down" | "sideways" | "mild_up" | "strong_up";
}

/**
 * 패턴 캔들 직전 N 캔들의 추세 컨텍스트.
 *
 * 학술 결과:
 *   - 강한 하락 5캔들 후 해머 → 70% 승률 (반전 신뢰 ↑)
 *   - 횡보 후 해머 → 50% 승률 (랜덤)
 *   - 상승 추세 중 해머 → 40% 승률 (오히려 약세)
 *
 * 강세 패턴 (bullish=true) 은 하락 후일 때 multiplier ↑.
 * 약세 패턴 (bullish=false) 은 상승 후일 때 multiplier ↑.
 *
 * Look-ahead 안전: candles[patternIdx-lookback ... patternIdx-1] 만 슬라이스.
 *
 * @param candles 전체 캔들 배열
 * @param patternIdx 패턴이 형성된 캔들의 인덱스
 * @param bullish 패턴이 강세 시그널인지 여부 (도지는 null → multiplier 1)
 * @param lookback 직전 몇 개 캔들을 평가할지 (기본 5)
 */
export function computeTrendContext(
  candles: Candle[],
  patternIdx: number,
  bullish: boolean | null,
  lookback = 5,
): TrendContext {
  if (patternIdx < lookback) {
    return { cumulativeReturn: 0, multiplier: 1, label: "sideways" };
  }
  const prior = candles.slice(patternIdx - lookback, patternIdx);
  let cumReturn = 0;
  for (const c of prior) {
    if (c.open > 0) cumReturn += (c.close - c.open) / c.open;
  }

  let label: TrendContext["label"] = "sideways";
  if (cumReturn < -0.05) label = "strong_down";
  else if (cumReturn < -0.02) label = "mild_down";
  else if (cumReturn > 0.05) label = "strong_up";
  else if (cumReturn > 0.02) label = "mild_up";

  let multiplier = 1.0;
  if (bullish === true) {
    if (label === "strong_down") multiplier = 1.30;
    else if (label === "mild_down") multiplier = 1.15;
    else if (label === "strong_up") multiplier = 0.60;
  } else if (bullish === false) {
    if (label === "strong_up") multiplier = 1.30;
    else if (label === "mild_up") multiplier = 1.15;
    else if (label === "strong_down") multiplier = 0.60;
  }
  // bullish === null (도지 등 중립) → multiplier 1
  return { cumulativeReturn: cumReturn, multiplier, label };
}

// ─── 단일 패턴 컨텍스트 강도 (audit §5.2 patternStrengthWithContext) ──────

export interface ContextualPatternStrength {
  /** 0~1 범위의 컨텍스트 보정 후 강도 */
  strength: number;
  /** TF base (0~1) */
  base: number;
  /** 거래량 컨텍스트 */
  volume: VolumeContext;
  /** 추세 컨텍스트 */
  trend: TrendContext;
  /** candlesAgo 지수 감쇠 (e^{-candlesAgo/3}) */
  ageDiscount: number;
}

/**
 * 단일 패턴 매치 + 컨텍스트로 0~1 범위 신뢰도 계산.
 *
 * 공식 (audit §5.2):
 *   strength = clamp(base × volume.mult × trend.mult × ageDiscount, 0, 1)
 *
 * @param pattern indicators.ts 의 detectAtIndex 가 반환한 매치
 * @param candles 전체 캔들 배열
 * @param baselineVolume EMA50 등 거래량 baseline
 * @param tf 타임프레임 (TF 별 base 차등용)
 */
export function computeContextualStrength(
  pattern: CandlePatternMatch,
  candles: Candle[],
  baselineVolume: number,
  tf: TimeframeValue,
): ContextualPatternStrength {
  const base = getTfPatternBase(pattern.name, tf);
  // candlesAgo=k 의 패턴 캔들 인덱스 = candles.length - 1 - k
  const patternIdx = candles.length - 1 - pattern.candlesAgo;
  const patternCandle = candles[patternIdx];
  const candleVolume = patternCandle?.volume ?? 0;
  const volume = computeVolumeContext(candleVolume, baselineVolume);

  // 도지(doji) 는 중립 → bullish=null. 그 외에는 bias 가 그대로 강세/약세.
  const bullish: boolean | null =
    pattern.name === "doji" ? null : pattern.bias === "bullish";
  const trend = computeTrendContext(candles, patternIdx, bullish);
  const ageDiscount = Math.exp(-pattern.candlesAgo / 3);

  const raw = base * volume.multiplier * trend.multiplier * ageDiscount;
  const strength = Math.max(0, Math.min(1, raw));

  return { strength, base, volume, trend, ageDiscount };
}

// ─── 다중 패턴 합산 (audit #4) ────────────────────────────────────────────

export interface AggregatedPatternResult {
  /** 0~1 범위 합산 강도 */
  score: number;
  /** 합산에 사용된 매치 개수 (confluence count) */
  count: number;
  /** 각 매치의 컨텍스트 강도 (디버깅/UI용, 강한 순 정렬) */
  contributions: Array<{
    name: CandlePatternName;
    bias: "bullish" | "bearish";
    candlesAgo: number;
    contextual: ContextualPatternStrength;
  }>;
  /** 가장 강한 단일 패턴 (UI 메인 표시용). 매치 없으면 null. */
  primary: AggregatedPatternResult["contributions"][number] | null;
  /** confluence 보너스 점수 (0 ~ 0.20) */
  bonus: number;
  /** TF (헌장 검증용) */
  tf: TimeframeValue;
}

/**
 * 다중 패턴 매치 합산 — audit §5.4 의 max + bonus 모델.
 *
 *   primary = max(contextual.strength)
 *   bonus = min(0.20, (count - 1) × 0.10)
 *   score = clamp(primary + bonus, 0, 1)
 *
 * 효과:
 *   - 단일 패턴: bonus=0, primary 그대로
 *   - 2개 confluence: bonus=0.10, score 일부 가산
 *   - 3+ 개 confluence: bonus=0.20 (cap), 강한 진입 신호
 *
 * 헌장 규칙 3 준수: 이 score 는 BBDX 시그널 강도의 multiplier 로만 사용.
 * 단독 진입 X.
 *
 * @param matches indicators.ts 의 detectAllCandlePatterns 결과
 * @param candles 전체 캔들 배열
 * @param baselineVolume EMA50 등 baseline 거래량
 * @param tf 타임프레임
 * @param biasFilter "bullish" | "bearish" | null (null=양쪽 다)
 */
export function aggregatePatternScore(
  matches: CandlePatternMatch[],
  candles: Candle[],
  baselineVolume: number,
  tf: TimeframeValue,
  biasFilter: "bullish" | "bearish" | null = null,
): AggregatedPatternResult {
  const filtered = biasFilter
    ? matches.filter((m) => m.bias === biasFilter)
    : matches;

  if (filtered.length === 0) {
    return { score: 0, count: 0, contributions: [], primary: null, bonus: 0, tf };
  }

  const contributions = filtered
    .map((m) => ({
      name: m.name,
      bias: m.bias,
      candlesAgo: m.candlesAgo,
      contextual: computeContextualStrength(m, candles, baselineVolume, tf),
    }))
    .sort((a, b) => b.contextual.strength - a.contextual.strength);

  const primary = contributions[0] ?? null;
  const primaryStrength = primary?.contextual.strength ?? 0;
  const bonus = Math.min(0.20, (contributions.length - 1) * 0.10);
  const score = Math.max(0, Math.min(1, primaryStrength + bonus));

  return { score, count: contributions.length, contributions, primary, bonus, tf };
}
