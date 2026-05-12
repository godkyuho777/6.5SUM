import { describe, expect, it } from "vitest";
import { validateWeights, VALIDATION_THRESHOLDS } from "../validation";
import type { HistoricalSignal } from "../statistics";

function makeSignals(n: number, winRate: number): HistoricalSignal[] {
  const out: HistoricalSignal[] = [];
  for (let i = 0; i < n; i++) {
    const isWin = i / n < winRate ? 1 : 0;
    out.push({
      scores: {
        momentum: isWin ? 0.8 : 0.2,
        position: isWin ? 0.7 : 0.3,
        trend: 0.5,
        volume: 0.5,
        action: isWin ? 0.6 : 0.4,
      },
      outcome: { win: isWin as 0 | 1, profit: isWin ? 2 : -1 },
    });
  }
  return out;
}

describe("validateWeights", () => {
  const goodWeights = {
    momentum: 0.30,
    position: 0.25,
    trend: 0.20,
    volume: 0.15,
    action: 0.10,
  };

  it("합 ≠ 1 차단 (fallback)", () => {
    const bad = { ...goodWeights, action: 0.20 }; // sum 1.10
    const r = validateWeights(bad, "external", { signals: [], metadata: { r_squared: 0.2, sample_size: 1000 } });
    expect(r.recommendation).toBe("fallback");
    expect(r.validation.reason).toContain("합");
  });

  it("음수 가중치 차단", () => {
    const bad = { momentum: -0.1, position: 0.3, trend: 0.3, volume: 0.3, action: 0.2 };
    const r = validateWeights(bad, "external", { signals: [], metadata: { r_squared: 0.2, sample_size: 1000 } });
    expect(r.recommendation).toBe("fallback");
    expect(r.validation.reason).toContain("momentum");
  });

  it("external R² < 0.10 차단", () => {
    const r = validateWeights(goodWeights, "external", {
      signals: [],
      metadata: { r_squared: 0.05, sample_size: 5000 },
    });
    expect(r.recommendation).toBe("fallback");
    expect(r.validation.reason).toContain("R²");
  });

  it("external 표본 < 100 차단", () => {
    const r = validateWeights(goodWeights, "external", {
      signals: [],
      metadata: { r_squared: 0.20, sample_size: 50 },
    });
    expect(r.recommendation).toBe("fallback");
  });

  it("external 메타 통과 → use", () => {
    const r = validateWeights(goodWeights, "external", {
      signals: [],
      metadata: { r_squared: 0.18, sample_size: 5000 },
    });
    expect(r.recommendation).toBe("use");
    expect(r.validation.passed).toBe(true);
  });

  it("self_backtest 표본 < 100 차단", () => {
    const sigs = makeSignals(50, 0.6);
    const r = validateWeights(goodWeights, "self_backtest", { signals: sigs });
    expect(r.recommendation).toBe("fallback");
  });

  it("default → review_required", () => {
    const r = validateWeights(goodWeights, "default", { signals: [] });
    expect(r.recommendation).toBe("review");
    expect(r.validation.passed).toBe(false);
    expect(r.validation.reason).toContain("직관값");
  });

  it("VALIDATION_THRESHOLDS 명시 값", () => {
    expect(VALIDATION_THRESHOLDS.min_r_squared).toBe(0.10);
    expect(VALIDATION_THRESHOLDS.min_sample_size).toBe(100);
    expect(VALIDATION_THRESHOLDS.max_oos_diff).toBe(0.10);
    expect(VALIDATION_THRESHOLDS.max_ci_width).toBe(0.30);
  });
});
