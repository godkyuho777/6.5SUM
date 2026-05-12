import { describe, expect, it } from "vitest";
import {
  computeOOSMatch,
  computeRSquared,
  computeWilsonCIWidth,
  solveConstrainedLSQ,
  type HistoricalSignal,
} from "../statistics";

function makeSyntheticSignals(n: number, dominantCategory: "momentum" | "action"): HistoricalSignal[] {
  // dominantCategory 가 outcome.win 과 강한 상관 — 그 categorty 가중치가 높게 도출되어야.
  const out: HistoricalSignal[] = [];
  for (let i = 0; i < n; i++) {
    const isWin = i % 2 === 0 ? 1 : 0;
    out.push({
      scores: {
        momentum: dominantCategory === "momentum" ? (isWin ? 0.9 : 0.1) : 0.5,
        position: 0.5,
        trend: 0.5,
        volume: 0.5,
        action: dominantCategory === "action" ? (isWin ? 0.9 : 0.1) : 0.5,
      },
      outcome: { win: isWin as 0 | 1, profit: isWin ? 1 : -1 },
    });
  }
  return out;
}

describe("solveConstrainedLSQ", () => {
  it("표본 < 10 → 균등 가중치", () => {
    const w = solveConstrainedLSQ([]);
    expect(w.momentum).toBeCloseTo(0.2, 5);
    expect(w.position).toBeCloseTo(0.2, 5);
  });

  it("합 = 1 보장", () => {
    const sigs = makeSyntheticSignals(120, "action");
    const w = solveConstrainedLSQ(sigs);
    const sum = w.momentum + w.position + w.trend + w.volume + w.action;
    expect(Math.abs(sum - 1)).toBeLessThan(0.01);
  });

  it("모든 값 ≥ 0", () => {
    const sigs = makeSyntheticSignals(120, "momentum");
    const w = solveConstrainedLSQ(sigs);
    expect(w.momentum).toBeGreaterThanOrEqual(0);
    expect(w.position).toBeGreaterThanOrEqual(0);
    expect(w.trend).toBeGreaterThanOrEqual(0);
    expect(w.volume).toBeGreaterThanOrEqual(0);
    expect(w.action).toBeGreaterThanOrEqual(0);
  });

  it("dominant category 가중치 ↑", () => {
    const sigs = makeSyntheticSignals(120, "action");
    const w = solveConstrainedLSQ(sigs);
    // action 이 dominant → action 가중치가 균등 (0.2) 보다 높아야
    expect(w.action).toBeGreaterThan(0.2);
  });
});

describe("computeRSquared", () => {
  it("빈 배열 → 0", () => {
    expect(computeRSquared([], { momentum: 0.2, position: 0.2, trend: 0.2, volume: 0.2, action: 0.2 })).toBe(0);
  });

  it("완벽 예측 → R² 1에 가까움", () => {
    const sigs: HistoricalSignal[] = [
      { scores: { momentum: 1, position: 0, trend: 0, volume: 0, action: 0 }, outcome: { win: 1, profit: 1 } },
      { scores: { momentum: 0, position: 1, trend: 0, volume: 0, action: 0 }, outcome: { win: 0, profit: -1 } },
      { scores: { momentum: 1, position: 0, trend: 0, volume: 0, action: 0 }, outcome: { win: 1, profit: 1 } },
      { scores: { momentum: 0, position: 1, trend: 0, volume: 0, action: 0 }, outcome: { win: 0, profit: -1 } },
    ];
    const w = { momentum: 1, position: 0, trend: 0, volume: 0, action: 0 };
    const r2 = computeRSquared(sigs, w);
    expect(r2).toBeGreaterThan(0.99);
  });

  it("R² ≥ 0 (negative 방어)", () => {
    const sigs = makeSyntheticSignals(20, "momentum");
    const w = { momentum: 0, position: 0, trend: 0, volume: 0, action: 1 };
    const r2 = computeRSquared(sigs, w);
    expect(r2).toBeGreaterThanOrEqual(0);
  });
});

describe("computeOOSMatch", () => {
  it("빈 배열 → 0", () => {
    expect(computeOOSMatch([], { momentum: 0.2, position: 0.2, trend: 0.2, volume: 0.2, action: 0.2 })).toBe(0);
  });

  it("균등 outcome → 0.5 근처 일치", () => {
    const sigs: HistoricalSignal[] = Array.from({ length: 10 }, (_, i) => ({
      scores: { momentum: 0.5, position: 0.5, trend: 0.5, volume: 0.5, action: 0.5 },
      outcome: { win: (i % 2) as 0 | 1, profit: 0 },
    }));
    const w = { momentum: 0.2, position: 0.2, trend: 0.2, volume: 0.2, action: 0.2 };
    const match = computeOOSMatch(sigs, w);
    // 예측 = 0.5, actual = 0.5 → match = 1
    expect(match).toBeCloseTo(1, 1);
  });
});

describe("computeWilsonCIWidth", () => {
  it("빈 배열 → 0 폭", () => {
    expect(computeWilsonCIWidth([])).toBe(0);
  });

  it("표본 ↑ → CI 폭 ↓", () => {
    const small = makeSyntheticSignals(20, "momentum");
    const large = makeSyntheticSignals(500, "momentum");
    expect(computeWilsonCIWidth(large)).toBeLessThan(computeWilsonCIWidth(small));
  });
});
