/**
 * Multiple-comparison correction — Benjamini-Hochberg FDR.
 *
 * DUAL_BACKTEST_ENGINE_PLAN §2.3 + §9.4.
 *
 * 동일 사용자가 N 개 가설을 백테스트하면, 우연으로 5% 이 유의미하게 보임.
 * BH 절차로 false discovery rate 제어 → 사용자에게 정직한 alpha 보고.
 *
 * 참조: Benjamini & Hochberg (1995), JRSS-B.
 */
/**
 * Benjamini-Hochberg FDR correction.
 *
 * 입력: p-value 배열 (순서 무관).
 * 출력: 각 p-value 가 BH 보정 후 유의미한지 (원래 순서 유지).
 *
 * 알고리즘:
 *   1. p-value 를 ascending 정렬 (p_(1) ≤ p_(2) ≤ ... ≤ p_(m))
 *   2. critical_i = (i / m) * q  (i: 1-indexed rank)
 *   3. 가장 큰 k 를 찾되, p_(k) ≤ critical_k 인 k. ≤ k 인 모든 가설 reject.
 *
 * @param pValues 검정 p-value 배열
 * @param q       원하는 FDR 수준 (default 0.10 — Tradelab 규약)
 * @returns       같은 길이의 boolean 배열, true = 유의미
 */
export declare function benjaminiHochberg(pValues: number[], q?: number): boolean[];
/**
 * 사용자가 등록한 가설. P2 에서 `user_hypotheses` 테이블로 영속화.
 * 현재 in-memory 만 — backend-engineer 가 drizzle migration 후 보강.
 */
export interface UserHypothesis {
    user_id: string;
    hypothesis_id: string;
    registered_at: number;
    description: string;
    status: "registered" | "tested" | "invalidated";
    test_count: number;
    p_value?: number;
}
export interface MultipleComparisonReport<T> {
    result: T;
    /** 같은 사용자의 가설 중 본 결과를 포함하여 BH 적용한 결과. */
    alpha_significant_after_correction: boolean;
    /** 적용된 q 수준. */
    q: number;
    /** 함께 보정된 가설 수. */
    total_hypotheses: number;
    /** k-th 가설인지 (사용자에게 "N 번째 테스트입니다" 표시). */
    hypothesis_rank: number;
}
/**
 * 단일 결과 + 사용자의 다른 가설 p-value 들을 받아 BH 보정 적용.
 *
 * 결과의 `alpha_significant` 필드를 보정된 값으로 덮어쓰지 않고,
 * 별도 wrap 으로 반환 (호출자가 명시적 처리).
 */
export declare function applyMultipleComparisonCorrection<T extends {
    p_value: number;
    alpha_significant: boolean;
}>(result: T, user_hypotheses: UserHypothesis[], q?: number): MultipleComparisonReport<T>;
