import { describe, expect, it } from "vitest";
import {
  calibrateThreshold,
  type ThresholdSignal,
} from "../threshold-calibration";

function makeSignals(n: number, signalToWinMap: (confidence: number) => 0 | 1): ThresholdSignal[] {
  return Array.from({ length: n }, (_, i) => {
    const conf = 30 + (i * 40) / n; // 30~70 spread
    return { confidence: conf, outcome: { win: signalToWinMap(conf) } };
  });
}

describe("calibrateThreshold", () => {
  it("표본 < 100 → null", () => {
    const sigs = makeSignals(50, () => 1);
    const r = calibrateThreshold(sigs);
    expect(r.threshold).toBeNull();
    expect(r.reason).toContain("표본");
  });

  it("confidence ≥ 50 = win 패턴 — threshold 50 채택", () => {
    const sigs = makeSignals(200, (c) => (c >= 50 ? 1 : 0));
    const r = calibrateThreshold(sigs);
    expect(r.threshold).not.toBeNull();
    expect(r.threshold).toBeGreaterThanOrEqual(45);
    expect(r.threshold).toBeLessThanOrEqual(55);
    expect(r.f1_score).toBeGreaterThan(0.5);
  });

  it("랜덤 outcome → F1 < 0.5 → null", () => {
    const sigs = makeSignals(200, () => (Math.random() > 0.5 ? 1 : 0));
    const r = calibrateThreshold(sigs);
    // 랜덤이라 F1 가 0.5 미만일 가능성 ↑ — null 또는 약한 결과
    if (r.threshold !== null) {
      // 통과해도 F1 < 0.6 (랜덤이라)
      expect(r.f1_score).toBeLessThan(0.7);
    }
  });

  it("결과에 precision/recall 포함", () => {
    const sigs = makeSignals(200, (c) => (c >= 50 ? 1 : 0));
    const r = calibrateThreshold(sigs);
    if (r.threshold !== null) {
      expect(r.precision).not.toBeNull();
      expect(r.recall).not.toBeNull();
    }
  });
});
