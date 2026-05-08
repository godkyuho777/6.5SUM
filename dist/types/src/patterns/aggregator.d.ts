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
import type { Candle, CandlePatternMatch, CandlePatternName, TimeframeValue } from "@shared/types";
/** TF + 패턴 이름 → 0~1 범위의 base 신뢰도. calibration 후 갱신 예정. */
export declare function getTfPatternBase(name: CandlePatternName, tf: TimeframeValue): number;
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
export declare function computeVolumeContext(candleVolume: number, baselineVolume: number): VolumeContext;
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
export declare function computeTrendContext(candles: Candle[], patternIdx: number, bullish: boolean | null, lookback?: number): TrendContext;
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
export declare function computeContextualStrength(pattern: CandlePatternMatch, candles: Candle[], baselineVolume: number, tf: TimeframeValue): ContextualPatternStrength;
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
export declare function aggregatePatternScore(matches: CandlePatternMatch[], candles: Candle[], baselineVolume: number, tf: TimeframeValue, biasFilter?: "bullish" | "bearish" | null): AggregatedPatternResult;
