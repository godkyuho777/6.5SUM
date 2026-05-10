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

export type MacroStance =
  | "RISK_ON"
  | "NEUTRAL_BULL"
  | "NEUTRAL"
  | "NEUTRAL_BEAR"
  | "RISK_OFF"
  | "DEFENSIVE";

export interface MacroStanceResult {
  stance: MacroStance;
  label: string; // 한글 라벨
  description: string; // 한글 설명
  recommendedAction: string; // 권장 액션
  /** 시각화용 색상 토큰 (Tailwind neon-* 매핑). */
  color: "green" | "cyan" | "yellow" | "orange" | "red";
  /** 신뢰도 백분위 (0~100). 분류 자체의 견고성. */
  stanceConfidence: number;
}

// ─── 분류 알고리즘 ────────────────────────────────────────

export function deriveMacroStance(
  compositeScore: number,
  bias: Signal,
  confidence: number,
  phase: MarketPhase,
): MacroStanceResult {
  // ── 1. DEFENSIVE 우선 (패닉 진행 + 강한 bearish + 매우 높은 confidence)
  if (
    phase === "PANIC" &&
    compositeScore <= 25 &&
    bias === "bearish" &&
    confidence >= 75
  ) {
    return {
      stance: "DEFENSIVE",
      label: "방어 (Defensive)",
      description:
        "패닉셀 진행 중. 위험자산 노출 최소화. 바닥 확인 신호(F&G < 20 + OI 반등) 대기.",
      recommendedAction: "현금/스테이블 보유. 매수 자제. 분할 진입 시 전체 자본의 20% 이내.",
      color: "red",
      stanceConfidence: Math.min(100, confidence + 5),
    };
  }

  // ── 2. RISK_ON (강한 상승)
  if (bias === "bullish" && confidence >= 60 && compositeScore >= 65) {
    return {
      stance: "RISK_ON",
      label: "위험 선호 (Risk-On)",
      description:
        "위험자산 적극 노출 가능. 추세 추종 진입 권장. 단, 과열(EXTREME_GREED + funding 과열) 시 분할 익절 준비.",
      recommendedAction: "신규 진입 OK. 추세 추종 + 익절 계획 필수. 레버리지 절제.",
      color: "green",
      stanceConfidence: confidence,
    };
  }

  // ── 3. RISK_OFF (강한 하락)
  if (bias === "bearish" && confidence >= 60 && compositeScore <= 35) {
    return {
      stance: "RISK_OFF",
      label: "위험 회피 (Risk-Off)",
      description:
        "거시 환경 부정적. 신규 롱 자제. 헷지 또는 숏 검토. 역추세 진입 시 분할 + 짧은 stop.",
      recommendedAction: "포지션 축소. 신규 롱 보류. 숏 또는 현금 비중 확대.",
      color: "red",
      stanceConfidence: confidence,
    };
  }

  // ── 4. NEUTRAL_BULL (약한 상승)
  if (bias === "bullish" && (confidence >= 40 || compositeScore >= 55)) {
    return {
      stance: "NEUTRAL_BULL",
      label: "약 상승 (Neutral-Bull)",
      description:
        "약한 상승 편향. 명확한 추세 진행 전. 확정 캔들 + 추가 컨플루언스 대기 권장.",
      recommendedAction: "분할 매수 검토. 신규 진입 시 stop 타이트하게. 사이즈 축소.",
      color: "cyan",
      stanceConfidence: Math.max(40, confidence),
    };
  }

  // ── 5. NEUTRAL_BEAR (약한 하락)
  if (bias === "bearish" && (confidence >= 40 || compositeScore <= 45)) {
    return {
      stance: "NEUTRAL_BEAR",
      label: "약 하락 (Neutral-Bear)",
      description:
        "약한 하락 편향. 추가 약세 가능성. 신규 롱 진입 자제. 보유 포지션은 stop 강화.",
      recommendedAction: "리스크 관리 강화. 보유 포지션 익절 검토. 신규 롱 보류.",
      color: "orange",
      stanceConfidence: Math.max(40, confidence),
    };
  }

  // ── 6. NEUTRAL (방향성 불명확 — tie 또는 confidence 낮음)
  return {
    stance: "NEUTRAL",
    label: "중립 (Neutral)",
    description:
      "신호 혼재 또는 신뢰도 부족. 방향성 불명확. 추가 데이터(거시 지표 / 차트 패턴) 확인 후 판단.",
    recommendedAction: "관망 우선. 진입 시 작은 사이즈 + 명확한 stop. 횡보 매매 검토.",
    color: "yellow",
    stanceConfidence: confidence,
  };
}

/**
 * 사람이 읽는 stance 요약 한 줄 (헤더 표기 용).
 *
 * 예: "RISK_ON · 70% · 강한 상승 편향"
 */
export function formatMacroStanceLine(r: MacroStanceResult): string {
  return `${r.stance} · ${r.stanceConfidence}% · ${r.description.split(".")[0]}`;
}
