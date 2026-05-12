/**
 * BBDX v6.6 — 5 카테고리 점수 추출.
 *
 * v6.5 시그널의 indicators + path 정보로부터 (momentum, position, trend, volume,
 * action) 5축 점수를 0~1 정규화. calibrated weights 와 곱해 base_strength 산출.
 *
 *   momentum: RSI 의 진입영역 깊이 (LONG: 35→25 가까울수록 ↑, SHORT: 65→75)
 *   position: BB 위치 (LONG: 하단, SHORT: 상단)
 *   trend:    ADX 약세 (낮을수록 평균회귀 환경 ↑) — 'trend_weakness' 로 해석
 *   volume:   volRatio 이상치
 *   action:   detect된 패턴 confluence
 *
 * 헌장 규칙 1 (차원 중복 X): v6.5 와 같은 indicators 를 다른 각도로 측정.
 */
import type { TechnicalIndicators } from "../../shared/types";
import type { WeightSide } from "../weight-calibration";
export interface ScoreComponents {
    momentum: number;
    position: number;
    trend: number;
    volume: number;
    action: number;
}
export interface ScoreExtractInput {
    price: number;
    indicators: TechnicalIndicators;
    volRatio: number;
    patternConfluence: number;
    side: WeightSide;
}
export declare function extractScoreComponents(input: ScoreExtractInput): ScoreComponents;
