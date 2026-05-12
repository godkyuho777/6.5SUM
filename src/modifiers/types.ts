/**
 * Additional Strategies — modifier 결과 envelope.
 *
 * BBDX 코어 시그널의 *가중치(multiplier)* 로만 적용하기 위한 표준 타입.
 *
 * 헌장 규칙 3 (modifier-only) 준수:
 *   - 단독 시그널 발행 금지. 모든 출력은 multiplier 형태.
 *   - 키 미설정 / 데이터 부족 시 status="stub", multiplier=1.0 (영향 없음).
 *   - 외부 호출 실패 시 status="error", multiplier=1.0 (graceful, throw X).
 *
 * 헌장 7차원 매핑:
 *   1 momentum   → MACD Divergence
 *   2 volatility → (없음 — BB/ATR 가 이미 커버)
 *   5 structure  → Order Block (베타)
 *   6 macro      → Market Breadth, Funding Extreme
 *   7 onchain    → (기존 7-modifier 가 커버)
 */

export type ModifierStatus = "real" | "stub" | "mock" | "error";

export interface ModifierResult {
  /**
   * 0.30 ~ 1.40 multiplier. 1.0 = neutral (BBDX 점수에 영향 없음).
   * 헌장 규칙 3: standalone 시그널 X — 항상 base × multiplier 형태로 사용.
   */
  multiplier: number;
  /** 0~100 raw score. 시각화/디버깅용 (선택). */
  rawScore?: number;
  /** Human-readable 사유 (UI breakdown / 로그용). */
  reason: string;
  /** 헌장 7차원 중 어느 차원을 측정하는지 (1~7). */
  dimension: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  /** 데이터 상태. error 일 때만 errorDetail 채움. */
  status: ModifierStatus;
  /** error 시 detail (호출 실패, JSON parse 실패 등). */
  errorDetail?: string;
}

/**
 * 모든 추가 modifier 의 multiplier 곱셈 helper.
 *
 * 향후 weighting / dimension 별 가중을 추가할 수 있도록 thin wrapper.
 * 현재는 단순 product. NaN/undefined 는 1.0 으로 fallback.
 */
export function combineModifiers(...mods: Array<ModifierResult | null | undefined>): number {
  let product = 1.0;
  for (const m of mods) {
    if (!m) continue;
    const mult = Number.isFinite(m.multiplier) ? m.multiplier : 1.0;
    product *= mult;
  }
  return product;
}

/** Multiplier 를 안전 범위 [0.30, 1.40] 로 clamp. */
export function clampMultiplier(value: number, lo: number = 0.30, hi: number = 1.40): number {
  if (!Number.isFinite(value)) return 1.0;
  return Math.max(lo, Math.min(hi, value));
}

/** Neutral (영향 없음) modifier — 호출 실패 / 데이터 부족 시 사용. */
export function neutralModifier(
  dimension: ModifierResult["dimension"],
  reason: string,
  status: ModifierStatus = "stub",
  errorDetail?: string
): ModifierResult {
  return {
    multiplier: 1.0,
    rawScore: 0,
    reason,
    dimension,
    status,
    ...(errorDetail ? { errorDetail } : {}),
  };
}
