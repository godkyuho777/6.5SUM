/**
 * Lite Translator — raw 지표 → 일반인 친화 라벨
 *
 * 헌장 규칙 3 준수: 모든 함수는 *입력을 라벨로 변환*만 한다. 새 시그널 산출 X.
 * deriveRecommendation 은 반드시 OnchainAdjustedEntry (BBDX path × 온체인 multiplier
 * 결과) 를 입력으로 받는다 — 단독 산식 금지.
 */
import type { OnchainAdjustedEntry, OnchainRegime, OnchainScore } from "../onchain/types";
import type { ExitDecision, EntryDecision } from "../shared/types";
import { type Recommendation, type RiskLevel, type MoodLabel, type TranslatedLabel } from "./types";
/**
 * BBDX 시그널 강도 → 5단계 자연어.
 *   ≥80 매우 강함 / ≥60 강함 / ≥40 보통 / ≥20 약함 / 그 외 매우 약함
 */
export declare function translateStrength(strength: number): TranslatedLabel;
/** BBDX 진입 path → "어디서 신호가 왔는지" 한 줄. */
export declare function translatePath(path: string | null | undefined): TranslatedLabel;
export declare function translateRegime(regime: OnchainRegime): TranslatedLabel;
export declare function translateAdx(adx: number): TranslatedLabel;
export declare function translateRsi(rsi: number): TranslatedLabel;
export declare function translateBbPosition(price: number, lower: number, middle: number, upper: number): TranslatedLabel;
export declare function translatePhase(phase: string): TranslatedLabel;
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
/**
 * v6.5 SHORT path 추가: shortAdjusted (SHORT × 온체인 multiplier 적용 결과) +
 * shortEntry (BBDX SHORT 진입 결정) 가 있으면 LONG 시그널 우선순위 *후순위* 로
 * SHORT 추천 산출. SHORT 차단 시 BLOCKED 반환.
 *
 * 우선순위 (높은 → 낮은):
 *   1. LONG 자본 보호 차단 → BLOCKED
 *   2. EXIT 4/4 → STRONG_SELL  (LONG 청산)
 *   3. EXIT 3/4 → SELL          (LONG 청산)
 *   4. LONG ENTRY finalStrength ≥ 80 → STRONG_BUY
 *   5. LONG ENTRY finalStrength ≥ 60 → BUY
 *   6. LONG ENTRY finalStrength ≥ 40 → WATCH
 *   7. SHORT 자본 보호 차단 → BLOCKED
 *   8. SHORT ENTRY finalStrength ≥ 80 → STRONG_SHORT
 *   9. SHORT ENTRY finalStrength ≥ 60 → SHORT
 *   10. 그 외                          → HOLD
 */
export declare function deriveRecommendation(adjusted: OnchainAdjustedEntry | null, entry: EntryDecision | null, exit: ExitDecision | null, shortAdjusted?: OnchainAdjustedEntry | null, shortEntry?: {
    path: string;
} | null): Recommendation;
/** Recommendation → 한국어 라벨 + 색조. */
export declare function recommendationLabel(r: Recommendation): TranslatedLabel;
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
export declare function deriveRiskLevel(strength: number, regime: OnchainRegime, fallingKnife: boolean): RiskLevel;
export declare function riskLabel(level: RiskLevel): TranslatedLabel;
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
export declare function deriveMarketMood(averageStrength: number, regime: OnchainRegime): MoodLabel;
export declare function moodLabel(mood: MoodLabel): TranslatedLabel;
/**
 * 추천 카드의 reasons[2] 를 자연어로 압축. 우선순위:
 *   1. blocked → 보호 사유 1줄
 *   2. STRONG_SELL/SELL → exit triggers 한국어
 *   3. BUY/STRONG_BUY → path 한 줄 + onchain regime 한 줄
 *   4. WATCH → "관찰 권장 + 강도 약함"
 *   5. HOLD → 빈 배열
 */
export declare function buildReasons(recommendation: Recommendation, adjusted: OnchainAdjustedEntry | null, entry: EntryDecision | null, exit: ExitDecision | null, onchain: OnchainScore | null): string[];
import type { TranslateKind } from "./types";
export declare function translateByKind(kind: TranslateKind, value: number | string): TranslatedLabel;
