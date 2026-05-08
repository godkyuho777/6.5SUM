/**
 * Lite Translator — raw 지표 → 일반인 친화 라벨
 *
 * 헌장 규칙 3 준수: 모든 함수는 *입력을 라벨로 변환*만 한다. 새 시그널 산출 X.
 * deriveRecommendation 은 반드시 OnchainAdjustedEntry (BBDX path × 온체인 multiplier
 * 결과) 를 입력으로 받는다 — 단독 산식 금지.
 */

import type { OnchainAdjustedEntry, OnchainRegime, OnchainScore } from "../onchain/types";
import type { ExitDecision, EntryDecision } from "../shared/types";
import {
  RECOMMENDATION_LABEL,
  REGIME_LABEL,
  RISK_LABEL,
  MOOD_LABEL,
  type Recommendation,
  type RiskLevel,
  type MoodLabel,
  type Tone,
  type TranslatedLabel,
} from "./types";

// ─── Helpers ───────────────────────────────────────────────────────

function label(label: string, color: string, tone: Tone, oneLiner: string): TranslatedLabel {
  return { label, color, tone, oneLiner };
}

// ─── 1. Strength (0~100) ────────────────────────────────────────────

/**
 * BBDX 시그널 강도 → 5단계 자연어.
 *   ≥80 매우 강함 / ≥60 강함 / ≥40 보통 / ≥20 약함 / 그 외 매우 약함
 */
export function translateStrength(strength: number): TranslatedLabel {
  if (strength >= 80) return label("매우 강함", "neon-green", "good", "여러 조건이 동시에 맞아떨어졌어요.");
  if (strength >= 60) return label("강함", "neon-cyan", "good", "신뢰할 만한 신호예요.");
  if (strength >= 40) return label("보통", "neon-yellow", "caution", "참고만, 단독으로 진입 결정하지 마세요.");
  if (strength >= 20) return label("약함", "muted", "muted", "아직은 신호가 뚜렷하지 않아요.");
  return label("매우 약함", "muted", "muted", "지금은 진입 신호로 보기 어려워요.");
}

// ─── 2. Path (BB / PTN / NUM) ───────────────────────────────────────

/** BBDX 진입 path → "어디서 신호가 왔는지" 한 줄. */
export function translatePath(path: string | null | undefined): TranslatedLabel {
  if (path === "BB") return label("가격 신호", "neon-green", "good", "가격이 평소 흐름의 중요한 자리에 도달했어요.");
  if (path === "PTN") return label("패턴 신호", "neon-cyan", "good", "캔들 모양에서 반전 패턴이 보였어요.");
  if (path === "NUM") return label("지표 신호", "neon-yellow", "caution", "RSI 등 지표가 매수 영역에 들어왔어요.");
  return label("신호 없음", "muted", "muted", "지금은 진입 조건이 충족되지 않았어요.");
}

// ─── 3. Onchain regime ─────────────────────────────────────────────

export function translateRegime(regime: OnchainRegime): TranslatedLabel {
  const meta = REGIME_LABEL[regime];
  const color =
    meta.tone === "good"
      ? "neon-green"
      : meta.tone === "caution"
        ? "neon-yellow"
        : meta.tone === "bad"
          ? "neon-red"
          : "muted";
  return label(meta.label, color, meta.tone, meta.oneLiner);
}

// ─── 4. ADX (수치 숨기고 "추세 강함/보통/약함") ────────────────────

export function translateAdx(adx: number): TranslatedLabel {
  if (adx >= 30) return label("추세 강함", "neon-green", "good", "한 방향으로 강하게 움직이는 중이에요.");
  if (adx >= 20) return label("추세 보통", "neon-cyan", "neutral", "방향성이 조금씩 잡히는 중이에요.");
  return label("추세 약함", "muted", "muted", "갈팡질팡, 횡보일 가능성이 높아요.");
}

// ─── 5. RSI ────────────────────────────────────────────────────────

export function translateRsi(rsi: number): TranslatedLabel {
  if (rsi < 30) return label("과매도", "neon-green", "good", "단기적으로 너무 많이 팔렸어요. 반등 가능성.");
  if (rsi <= 40) return label("매수 영역", "neon-cyan", "good", "가격이 평소보다 싸요.");
  if (rsi < 60) return label("중립", "muted", "neutral", "RSI 기준 특별한 편향이 없어요.");
  if (rsi <= 70) return label("매도 영역", "neon-yellow", "caution", "가격이 평소보다 비싸요.");
  return label("과매수", "neon-red", "bad", "단기적으로 너무 많이 샀어요. 조정 가능성.");
}

// ─── 6. BB position (가격이 BB 어디에 있는지) ───────────────────────

export function translateBbPosition(
  price: number,
  lower: number,
  middle: number,
  upper: number
): TranslatedLabel {
  if (price < lower) return label("평소보다 매우 쌈", "neon-green", "good", "최근 흐름의 평균 아래로 내려왔어요.");
  if (price <= lower * 1.02) return label("싼 영역", "neon-cyan", "good", "가격이 하단 근처예요.");
  if (price < middle) return label("중간 아래", "muted", "neutral", "평균 가격 살짝 아래.");
  if (price <= middle * 1.02) return label("중간 근처", "muted", "neutral", "평균 가격 근방.");
  if (price <= upper * 0.98) return label("비싼 영역", "neon-yellow", "caution", "상단에 가까워졌어요.");
  return label("매우 비쌈", "neon-red", "bad", "최근 흐름의 평균 위로 올라갔어요. 조심.");
}

// ─── 7. Trend phase (4-TF 추세 엔진 v2.0 출력) ─────────────────────

export function translatePhase(phase: string): TranslatedLabel {
  switch (phase) {
    case "STRONG_BULLISH":
      return label("강한 상승", "neon-green", "good", "추세가 뚜렷하고 강해요.");
    case "BULLISH":
      return label("상승", "neon-cyan", "good", "위로 가는 흐름.");
    case "BULLISH_WEAKENING":
      return label("상승 약화", "neon-yellow", "caution", "오르긴 하지만 힘이 빠지는 중.");
    case "SIDEWAYS":
      return label("횡보", "muted", "neutral", "방향이 정해지지 않았어요.");
    case "BEARISH_WEAKENING":
      return label("하락 약화", "neon-yellow", "caution", "내려가지만 힘이 빠지는 중.");
    case "BEARISH":
      return label("하락", "neon-red", "caution", "아래로 가는 흐름.");
    case "STRONG_BEARISH":
      return label("강한 하락", "neon-red", "bad", "강한 매도세.");
    default:
      return label("알 수 없음", "muted", "muted", "추세 데이터 없음.");
  }
}

// ─── 8. deriveRecommendation — 핵심 함수 ──────────────────────────

/**
 * BBDX path 결과 + 온체인 multiplier 적용 결과 → Lite Recommendation.
 *
 * **헌장 규칙 3 준수의 핵심**: 입력으로 OnchainAdjustedEntry 를 받음 (즉 BBDX path
 * 가 시그널을 만든 *후* 의 결과). 이 함수가 새 시그널을 만들지 않는다.
 *
 * 우선순위 (위에서 아래):
 *   1. blocked === true                    → BLOCKED (자본 보호)
 *   2. exit conditionsMet >= 4              → STRONG_SELL
 *   3. exit conditionsMet >= 3              → SELL
 *   4. finalStrength >= 80 + path != null   → STRONG_BUY
 *   5. finalStrength >= 60 + path != null   → BUY
 *   6. finalStrength >= 40 + path != null   → WATCH
 *   7. 그 외                                 → HOLD
 */
export function deriveRecommendation(
  adjusted: OnchainAdjustedEntry | null,
  entry: EntryDecision | null,
  exit: ExitDecision | null
): Recommendation {
  // 1. 자본 보호
  if (adjusted?.blocked) return "BLOCKED";

  // 2~3. EXIT 우선
  if (exit) {
    if (exit.conditionsMet >= 4) return "STRONG_SELL";
    if (exit.conditionsMet >= 3) return "SELL";
  }

  // 4~6. ENTRY (path 가 있어야 함)
  if (adjusted && entry) {
    const s = adjusted.finalStrength;
    if (s >= 80) return "STRONG_BUY";
    if (s >= 60) return "BUY";
    if (s >= 40) return "WATCH";
  }

  return "HOLD";
}

/** Recommendation → 한국어 라벨 + 색조. */
export function recommendationLabel(r: Recommendation): TranslatedLabel {
  const meta = RECOMMENDATION_LABEL[r];
  const color =
    r === "STRONG_BUY"
      ? "neon-green"
      : r === "BUY"
        ? "neon-green"
        : r === "WATCH"
          ? "neon-yellow"
          : r === "SELL"
            ? "neon-yellow"
            : r === "STRONG_SELL"
              ? "neon-red"
              : "muted";
  const oneLiner =
    r === "BLOCKED"
      ? "지금 시장 환경이 위험해서 진입을 보류하는 게 좋아요."
      : r === "HOLD"
        ? "특별히 추천할 신호가 없어요."
        : meta.label;
  return label(meta.label, color, meta.tone, oneLiner);
}

// ─── 9. deriveRiskLevel ────────────────────────────────────────────

/**
 * 위험도 산출 — 시장 환경 + 시그널 강도 + falling knife 종합.
 *
 *   strong_distribution OR fallingKnife    → very_high
 *   distribution                            → high
 *   neutral + strength<40                   → high
 *   neutral + strength<60                   → medium
 *   neutral + strength>=60                  → low
 *   accumulation                            → low
 *   strong_accumulation                     → very_low
 */
export function deriveRiskLevel(
  strength: number,
  regime: OnchainRegime,
  fallingKnife: boolean
): RiskLevel {
  if (regime === "strong_distribution" || fallingKnife) return "very_high";
  if (regime === "distribution") return "high";
  if (regime === "strong_accumulation") return "very_low";
  if (regime === "accumulation") return "low";
  // neutral
  if (strength < 40) return "high";
  if (strength < 60) return "medium";
  return "low";
}

export function riskLabel(level: RiskLevel): TranslatedLabel {
  const text = RISK_LABEL[level];
  const map: Record<RiskLevel, { color: string; tone: Tone; oneLiner: string }> = {
    very_low: { color: "neon-green", tone: "good", oneLiner: "현재 시장 환경이 매우 우호적이에요." },
    low: { color: "neon-cyan", tone: "good", oneLiner: "환경이 양호해요." },
    medium: { color: "neon-yellow", tone: "caution", oneLiner: "보통 수준의 위험. 분할 진입 권장." },
    high: { color: "neon-orange", tone: "caution", oneLiner: "환경이 불리해요. 신중하게." },
    very_high: { color: "neon-red", tone: "bad", oneLiner: "지금은 보호 우선. 새 진입은 자제하세요." },
  };
  const m = map[level];
  return label(text, m.color, m.tone, m.oneLiner);
}

// ─── 10. deriveMarketMood ───────────────────────────────────────────

/**
 * 시장 전체 분위기 — 종합 점수 (top picks 의 평균 strength + onchain regime
 * 가중) 를 5단계로 변환.
 *
 *   averageStrength: top buy 후보들의 평균 finalStrength (없으면 0)
 *   regime:          BTC onchain regime (시장 대표)
 *
 *   strong_distribution        → bearish_strong
 *   distribution + avg<40      → bearish_strong
 *   distribution               → bearish
 *   neutral + avg<30           → neutral
 *   neutral + avg>=60          → bullish
 *   accumulation               → bullish
 *   strong_accumulation        → bullish_strong
 */
export function deriveMarketMood(
  averageStrength: number,
  regime: OnchainRegime
): MoodLabel {
  if (regime === "strong_distribution") return "bearish_strong";
  if (regime === "strong_accumulation") return "bullish_strong";
  if (regime === "distribution") return averageStrength < 40 ? "bearish_strong" : "bearish";
  if (regime === "accumulation") return averageStrength >= 60 ? "bullish_strong" : "bullish";
  // neutral
  if (averageStrength >= 60) return "bullish";
  if (averageStrength < 30) return "neutral";
  return "neutral";
}

export function moodLabel(mood: MoodLabel): TranslatedLabel {
  const meta = MOOD_LABEL[mood];
  const color =
    meta.tone === "good"
      ? mood === "bullish_strong"
        ? "neon-green"
        : "neon-cyan"
      : meta.tone === "bad"
        ? "neon-red"
        : meta.tone === "caution"
          ? "neon-yellow"
          : "muted";
  return label(meta.label, color, meta.tone, meta.oneLiner);
}

// ─── 11. buildReasons — 이유 1~2줄 ─────────────────────────────────

/**
 * 추천 카드의 reasons[2] 를 자연어로 압축. 우선순위:
 *   1. blocked → 보호 사유 1줄
 *   2. STRONG_SELL/SELL → exit triggers 한국어
 *   3. BUY/STRONG_BUY → path 한 줄 + onchain regime 한 줄
 *   4. WATCH → "관찰 권장 + 강도 약함"
 *   5. HOLD → 빈 배열
 */
export function buildReasons(
  recommendation: Recommendation,
  adjusted: OnchainAdjustedEntry | null,
  entry: EntryDecision | null,
  exit: ExitDecision | null,
  onchain: OnchainScore | null
): string[] {
  if (recommendation === "BLOCKED") {
    return [
      adjusted?.blockReason ?? "시장 환경이 위험해 자본 보호 중이에요.",
    ];
  }

  if (recommendation === "STRONG_SELL" || recommendation === "SELL") {
    const reasons: string[] = [];
    if (exit) {
      const triggerKo = exit.triggers.map((t) => {
        switch (t) {
          case "bbMiddle":
            return "가격이 평균선에 도달";
          case "rsi65":
            return "RSI 가 매도 영역에";
          case "adx30":
            return "추세가 강해짐";
          case "plusDi25":
            return "매수 압력 약화";
        }
      });
      reasons.push(`${triggerKo.slice(0, 2).join(", ")} — 익절 / 손절 검토.`);
    }
    return reasons.slice(0, 2);
  }

  if (recommendation === "STRONG_BUY" || recommendation === "BUY") {
    const reasons: string[] = [];
    if (entry) {
      const path = translatePath(entry.path);
      reasons.push(`${path.label} — ${path.oneLiner}`);
    }
    if (onchain && onchain.regime !== "neutral") {
      const r = translateRegime(onchain.regime);
      reasons.push(`${r.label} — ${r.oneLiner}`);
    }
    return reasons.slice(0, 2);
  }

  if (recommendation === "WATCH") {
    return ["조건이 살짝 부족해요. 한 캔들 더 지켜보세요."];
  }

  return [];
}

// ─── 12. translateByKind — /lite/translate 단일 진입점 ─────────────

import type { TranslateKind } from "./types";

export function translateByKind(
  kind: TranslateKind,
  value: number | string
): TranslatedLabel {
  switch (kind) {
    case "strength":
      return translateStrength(Number(value));
    case "path":
      return translatePath(String(value));
    case "regime":
      return translateRegime(value as OnchainRegime);
    case "phase":
      return translatePhase(String(value));
    case "adx":
      return translateAdx(Number(value));
    case "rsi":
      return translateRsi(Number(value));
    case "bb_position":
      // value 는 "price,lower,middle,upper" comma-separated
      {
        const parts = String(value).split(",").map(Number);
        if (parts.length !== 4 || parts.some(Number.isNaN)) {
          return label("알 수 없음", "muted", "muted", "BB 위치 데이터가 부족해요.");
        }
        const [p, l, m, u] = parts;
        return translateBbPosition(p, l, m, u);
      }
  }
}
