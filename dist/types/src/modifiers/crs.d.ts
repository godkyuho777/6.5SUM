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
/**
 * CRS-lite multiplier 산출.
 *
 * @param candles 시간순 정렬 spot 캔들. 마지막 캔들 = 평가 대상(= falling-knife 풀린 반등 캔들).
 * @param timeframe "1h" 면 vel 임계값 강화, 그 외(4h 포함)는 4h 값 fallback.
 *
 * 게이트(BB 하단 + 급락 vel + 긴 아래꼬리) 미통과 시 multiplier 1.0 → 기존 동작 불변.
 */
export declare function computeCRS(candles: Candle[], timeframe: string): ModifierResult;
