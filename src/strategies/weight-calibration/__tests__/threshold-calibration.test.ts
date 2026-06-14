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

/**
 * xorshift32 — 결정적 의사난수. no_lookahead.test.ts 와 동일 패턴.
 * unseeded Math.random() 은 학습 표본의 win-rate 가 매 실행마다 흔들려
 * 노이즈 F1 가 가끔 0.7 가드를 넘겨 테스트가 flaky 였음 (999/1000 통과).
 * 시드를 고정하면 동일 시퀀스 → 동일 F1 → 재현 가능.
 */
function makeSeededRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s = s | 0;
    return ((s >>> 0) % 10000) / 10000;
  };
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

  it("노이즈 outcome (시드 고정) → 강한 신호 없음 (F1 < 0.7)", () => {
    // confidence 와 무관한 결정적 의사난수 outcome — 대표적 ~50% 노이즈.
    // seed 0xDEADBEEF → 학습 win-rate ≈ 0.494, best threshold 30,
    // F1 ≈ 0.661 (predict-all 베이스라인). 매 실행 동일.
    const next = makeSeededRng(0xdeadbeef);
    const sigs = makeSignals(200, () => (next() > 0.5 ? 1 : 0));
    const r = calibrateThreshold(sigs);
    // 노이즈엔 착취할 신호가 없음 → threshold 를 채택해도 F1 는 predict-all
    // 베이스라인 수준에 머물러야 함. 테스트 2 의 "진짜 신호"(F1 강함)와 대비.
    // 0.7 이상이면 calibrator 가 노이즈를 신호로 오인 (overfitting).
    expect(r.threshold).not.toBeNull();
    expect(r.f1_score).toBeLessThan(0.7);
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
