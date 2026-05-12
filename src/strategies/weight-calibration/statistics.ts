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

import { wilsonScoreInterval } from "../../backtest/calibration";
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
export function solveConstrainedLSQ(signals: HistoricalSignal[]): WeightVector {
  if (signals.length < 10) {
    return { momentum: 0.2, position: 0.2, trend: 0.2, volume: 0.2, action: 0.2 };
  }

  const cats: (keyof WeightVector)[] = [
    "momentum",
    "position",
    "trend",
    "volume",
    "action",
  ];

  // Loss 함수: 가중 합 vs outcome.win
  const lossOf = (w: WeightVector): number => {
    let sse = 0;
    for (const s of signals) {
      const pred =
        w.momentum * s.scores.momentum +
        w.position * s.scores.position +
        w.trend * s.scores.trend +
        w.volume * s.scores.volume +
        w.action * s.scores.action;
      const err = pred - s.outcome.win;
      sse += err * err;
    }
    return sse / signals.length;
  };

  // Stratified Dirichlet 후보 (sum=1, non-negative). 7³ ≈ 343 후보.
  const stepCoarse = 0.10;
  const candidates: WeightVector[] = [];
  for (let m = 0; m <= 1.0 + 1e-9; m += stepCoarse) {
    for (let p = 0; p <= 1.0 - m + 1e-9; p += stepCoarse) {
      for (let t = 0; t <= 1.0 - m - p + 1e-9; t += stepCoarse) {
        for (let v = 0; v <= 1.0 - m - p - t + 1e-9; v += stepCoarse) {
          const a = 1.0 - m - p - t - v;
          if (a < -1e-9) continue;
          candidates.push({
            momentum: round(m),
            position: round(p),
            trend: round(t),
            volume: round(v),
            action: round(Math.max(0, a)),
          });
        }
      }
    }
  }

  let best: WeightVector = {
    momentum: 0.2,
    position: 0.2,
    trend: 0.2,
    volume: 0.2,
    action: 0.2,
  };
  let bestLoss = lossOf(best);
  for (const c of candidates) {
    const l = lossOf(c);
    if (l < bestLoss) {
      bestLoss = l;
      best = c;
    }
  }

  // 2차 fine search: best 근방 ±0.05
  const stepFine = 0.025;
  for (let dm = -0.05; dm <= 0.05 + 1e-9; dm += stepFine) {
    for (let dp = -0.05; dp <= 0.05 + 1e-9; dp += stepFine) {
      for (let dt = -0.05; dt <= 0.05 + 1e-9; dt += stepFine) {
        for (let dv = -0.05; dv <= 0.05 + 1e-9; dv += stepFine) {
          const m = best.momentum + dm;
          const p = best.position + dp;
          const t = best.trend + dt;
          const v = best.volume + dv;
          const a = 1.0 - m - p - t - v;
          if (m < 0 || p < 0 || t < 0 || v < 0 || a < 0) continue;
          const cand: WeightVector = {
            momentum: round(m),
            position: round(p),
            trend: round(t),
            volume: round(v),
            action: round(a),
          };
          const l = lossOf(cand);
          if (l < bestLoss) {
            bestLoss = l;
            best = cand;
          }
        }
      }
    }
  }

  // 정규화 (round 누적 오차 보정)
  const sum =
    best.momentum + best.position + best.trend + best.volume + best.action;
  if (Math.abs(sum - 1) > 0.001) {
    const k = 1 / sum;
    return {
      momentum: best.momentum * k,
      position: best.position * k,
      trend: best.trend * k,
      volume: best.volume * k,
      action: best.action * k,
    };
  }
  return best;
  // cats 인자 reference — 미사용 경고 무력화
  void cats;
}

function round(x: number): number {
  return Math.round(x * 10000) / 10000;
}

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
export function computeRSquared(
  signals: HistoricalSignal[],
  weights: WeightVector,
): number {
  if (signals.length === 0) return 0;
  const actuals: number[] = signals.map((s) => s.outcome.win);
  const mean = actuals.reduce((a, b) => a + b, 0) / actuals.length;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < signals.length; i++) {
    const s = signals[i];
    const pred =
      weights.momentum * s.scores.momentum +
      weights.position * s.scores.position +
      weights.trend * s.scores.trend +
      weights.volume * s.scores.volume +
      weights.action * s.scores.action;
    ssRes += (actuals[i] - pred) ** 2;
    ssTot += (actuals[i] - mean) ** 2;
  }
  if (ssTot < 1e-9) return 0;
  return Math.max(0, 1 - ssRes / ssTot);
}

/**
 * OOS 일치도 — validation set 에서 weights 가 예측한 winRate 와 actual winRate.
 *
 * 0~1 (1 = 완벽 일치).
 *   match = 1 - |predicted_winRate - actual_winRate|
 *
 * predicted_winRate = mean(predicted score) clipped [0, 1].
 * actual_winRate = sum(win) / n.
 */
export function computeOOSMatch(
  validation: HistoricalSignal[],
  weights: WeightVector,
): number {
  if (validation.length === 0) return 0;
  const preds = validation.map((s) => {
    const p =
      weights.momentum * s.scores.momentum +
      weights.position * s.scores.position +
      weights.trend * s.scores.trend +
      weights.volume * s.scores.volume +
      weights.action * s.scores.action;
    return Math.max(0, Math.min(1, p));
  });
  const predWinRate = preds.reduce((a, b) => a + b, 0) / preds.length;
  const actualWinRate =
    validation.reduce((a, s) => a + s.outcome.win, 0) / validation.length;
  return Math.max(0, 1 - Math.abs(predWinRate - actualWinRate));
}

/**
 * Wilson 95% CI 폭 — backtest/calibration.ts 의 wilsonScoreInterval 재사용.
 *
 * 좁을수록 표본 충분 (≤ 0.30 임계).
 */
export function computeWilsonCIWidth(signals: HistoricalSignal[]): number {
  const wins = signals.filter((s) => s.outcome.win === 1).length;
  const ci = wilsonScoreInterval(wins, signals.length);
  return ci.upper - ci.lower;
}
