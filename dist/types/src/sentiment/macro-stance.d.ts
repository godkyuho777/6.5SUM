/**
 * Macro Stance — 거시 스탠스 분류
 *
 * 사용자 요청: "이후의 하락이나 상승 파동을 예측해주고 거시적인 스탠스를
 * 알려주는 지표". WAVE_SENTIMENT_AUDIT.md §4 명세 그대로.
 *
 * 5단계 분류:
 *   RISK_ON       — 위험자산 적극 노출 가능 (composite ≥65 + bull + conf ≥60)
 *   NEUTRAL_BULL  — 약한 상승 편향
 *   NEUTRAL       — 방향성 불명확 (tie 또는 conf < 40)
 *   NEUTRAL_BEAR  — 약한 하락 편향
 *   RISK_OFF      — 위험자산 회피 (composite ≤35 + bear + conf ≥60)
 *   DEFENSIVE     — 패닉 진행 중 (PANIC + composite ≤25 + bear + conf ≥75)
 *
 * 헌장 규칙 3 준수: 본 stance 는 BBDX 시그널의 "거시 컨텍스트" 라벨로만
 * 사용. 단독 매매 시그널 발행 X (modifier-only).
 */
import type { MarketPhase, Signal } from "./types";
export type MacroStance = "RISK_ON" | "NEUTRAL_BULL" | "NEUTRAL" | "NEUTRAL_BEAR" | "RISK_OFF" | "DEFENSIVE";
export interface MacroStanceResult {
    stance: MacroStance;
    label: string;
    description: string;
    recommendedAction: string;
    /** 시각화용 색상 토큰 (Tailwind neon-* 매핑). */
    color: "green" | "cyan" | "yellow" | "orange" | "red";
    /** 신뢰도 백분위 (0~100). 분류 자체의 견고성. */
    stanceConfidence: number;
}
export declare function deriveMacroStance(compositeScore: number, bias: Signal, confidence: number, phase: MarketPhase): MacroStanceResult;
/**
 * 사람이 읽는 stance 요약 한 줄 (헤더 표기 용).
 *
 * 예: "RISK_ON · 70% · 강한 상승 편향"
 */
export declare function formatMacroStanceLine(r: MacroStanceResult): string;
