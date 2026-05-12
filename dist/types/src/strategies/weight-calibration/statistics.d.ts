/**
 * Weight Calibration — Statistics Module (v6.6 §3.2).
 *
 * 가중치 도출 + 검증 메트릭:
 *   - solveConstrainedLSQ — 5 카테고리 점수 → outcome.profit 의 최적 가중치
 *     (sum=1, all ≥ 0 제약). scipy.optimize 없으므로 grid search + projection.
 *   - computeRSquared — 1 - SS_res / SS_tot
 *   - computeOOSMatch — validation set 에서 weights 가 예측한 winRate vs actual
 *   - computeWilsonCIWidth — 기존 calibration.ts 의 wilsonScoreInterval 재사용
 *
 * 헌장 규칙 2 (백테스트 알파): 도출 절차 transparent + R² + OOS 일치 검증.
 */
import type { WeightVector } from "./external-manifest";
/**
 * 1 시그널 = (5 카테고리 점수, outcome) 묶음.
 * 백테스트 trade 데이터를 본 형식으로 변환 후 LSQ 입력.
 */
export interface HistoricalSignal {
    /** 0~1 정규화된 카테고리 점수 */
    scores: {
        momentum: number;
        position: number;
        trend: number;
        volume: number;
        action: number;
    };
    outcome: {
        /** trade win = 1, loss = 0 */
        win: 0 | 1;
        /** 수익률 % (post fee). 미사용 — 미래 확장 */
        profit: number;
    };
}
/**
 * Constrained least squares — sum(w)=1, all w >= 0.
 *
 * 알고리즘 (자체 구현, scipy.optimize.minimize 부재 대응):
 *   1. Coordinate descent (gradient projection) — 각 카테고리 weight 를
 *      [0, 1] 범위에서 0.05 step 으로 검색.
 *   2. 5중 nested loop 는 비현실적 (20^5 = 3.2M) — Stratified grid + Dirichlet
 *      surface sampling.
 *   3. 1 차: 균등 분포 ({0.2, 0.2, ...}) 에서 시작, 각 축 ±0.10 perturbation.
 *   4. 2 차: 최적점 근방 ±0.05 fine grid.
 *
 * Loss = sum_i (score_i · w - outcome_i.win)^2.
 *
 * 표본 < 100 또는 NaN 발생 시 균등 가중치 ({0.2, 0.2, ...}) fallback.
 */
export declare function solveConstrainedLSQ(signals: HistoricalSignal[]): WeightVector;
/**
 * R² = 1 - SS_res / SS_tot.
 *
 *   pred_i = sum_k w_k · score_ik
 *   actual_i = signal.outcome.win
 *   SS_res = sum (actual - pred)^2
 *   SS_tot = sum (actual - mean(actual))^2
 *
 * SS_tot = 0 인 경우 (모든 outcome 동일) R² = 0 반환.
 */
export declare function computeRSquared(signals: HistoricalSignal[], weights: WeightVector): number;
/**
 * OOS 일치도 — validation set 에서 weights 가 예측한 winRate 와 actual winRate.
 *
 * 0~1 (1 = 완벽 일치).
 *   match = 1 - |predicted_winRate - actual_winRate|
 *
 * predicted_winRate = mean(predicted score) clipped [0, 1].
 * actual_winRate = sum(win) / n.
 */
export declare function computeOOSMatch(validation: HistoricalSignal[], weights: WeightVector): number;
/**
 * Wilson 95% CI 폭 — backtest/calibration.ts 의 wilsonScoreInterval 재사용.
 *
 * 좁을수록 표본 충분 (≤ 0.30 임계).
 */
export declare function computeWilsonCIWidth(signals: HistoricalSignal[]): number;
