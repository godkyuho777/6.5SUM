/**
 * signal-thresholds.ts unit tests (P2-#1, 2026-05-23).
 *
 * 회귀 안전성 검증:
 *   - production default 가 indicators.ts 의 기존 값과 정확히 일치
 *   - overrideThresholds 가 deep-merge 정확
 */

import { describe, test, expect } from "vitest";
import {
  SIGNAL_THRESHOLDS,
  overrideThresholds,
} from "../signal-thresholds";

describe("SIGNAL_THRESHOLDS — production default 회귀", () => {
  test("LONG NUM path", () => {
    expect(SIGNAL_THRESHOLDS.long.num.rsiLow).toBe(25);
    expect(SIGNAL_THRESHOLDS.long.num.rsiHigh).toBe(38);
    expect(SIGNAL_THRESHOLDS.long.num.bbTolerance).toBe(0.02);
    expect(SIGNAL_THRESHOLDS.long.num.adxMax).toBe(20);
  });

  test("LONG PTN path", () => {
    expect(SIGNAL_THRESHOLDS.long.ptn.bbTolerance).toBe(0.05);
    expect(SIGNAL_THRESHOLDS.long.ptn.adxMax).toBe(25);
  });

  test("SHORT NUM path (LONG 대칭)", () => {
    expect(SIGNAL_THRESHOLDS.short.num.rsiLow).toBe(65);
    expect(SIGNAL_THRESHOLDS.short.num.rsiHigh).toBe(75);
    expect(SIGNAL_THRESHOLDS.short.num.bbTolerance).toBe(0.02);
    expect(SIGNAL_THRESHOLDS.short.num.adxMax).toBe(20);
  });

  test("SHORT PTN path", () => {
    expect(SIGNAL_THRESHOLDS.short.ptn.bbTolerance).toBe(0.05);
    expect(SIGNAL_THRESHOLDS.short.ptn.adxMax).toBe(25);
  });

  test("EXIT 임계값", () => {
    expect(SIGNAL_THRESHOLDS.exit.rsiThreshold).toBe(65);
    expect(SIGNAL_THRESHOLDS.exit.adxThreshold).toBe(30);
    expect(SIGNAL_THRESHOLDS.exit.plusDiThreshold).toBe(25);
  });

  test("VWAP 임계값", () => {
    expect(SIGNAL_THRESHOLDS.vwap.atTolerance).toBe(0.001);
    expect(SIGNAL_THRESHOLDS.vwap.pullbackProximity).toBe(0.005);
    expect(SIGNAL_THRESHOLDS.vwap.signalThreshold).toBe(50);
  });
});

describe("overrideThresholds — deep merge", () => {
  test("부분 override — long.num.rsiLow 만 변경", () => {
    const overridden = overrideThresholds(SIGNAL_THRESHOLDS, {
      long: { num: { rsiLow: 22 } },
    });
    // 변경 적용
    expect(overridden.long.num.rsiLow).toBe(22);
    // 나머지 long.num 유지
    expect(overridden.long.num.rsiHigh).toBe(SIGNAL_THRESHOLDS.long.num.rsiHigh);
    expect(overridden.long.num.bbTolerance).toBe(SIGNAL_THRESHOLDS.long.num.bbTolerance);
    // 다른 path 영향 X
    expect(overridden.long.ptn).toEqual(SIGNAL_THRESHOLDS.long.ptn);
    expect(overridden.short).toEqual(SIGNAL_THRESHOLDS.short);
    expect(overridden.exit).toEqual(SIGNAL_THRESHOLDS.exit);
  });

  test("다중 영역 override", () => {
    const overridden = overrideThresholds(SIGNAL_THRESHOLDS, {
      long: { num: { rsiLow: 22, rsiHigh: 36 } },
      exit: { rsiThreshold: 70 },
      vwap: { signalThreshold: 55 },
    });
    expect(overridden.long.num.rsiLow).toBe(22);
    expect(overridden.long.num.rsiHigh).toBe(36);
    expect(overridden.exit.rsiThreshold).toBe(70);
    expect(overridden.exit.adxThreshold).toBe(SIGNAL_THRESHOLDS.exit.adxThreshold);
    expect(overridden.vwap.signalThreshold).toBe(55);
  });

  test("빈 override 는 base 와 deep-equal", () => {
    const overridden = overrideThresholds(SIGNAL_THRESHOLDS, {});
    expect(overridden).toEqual(SIGNAL_THRESHOLDS);
    // referential 동일성은 보장 X (deep copy)
    expect(overridden).not.toBe(SIGNAL_THRESHOLDS);
  });

  test("override 가 원본 변경 안 함 (immutable)", () => {
    const before = JSON.parse(JSON.stringify(SIGNAL_THRESHOLDS));
    overrideThresholds(SIGNAL_THRESHOLDS, {
      long: { num: { rsiLow: 99 } },
    });
    expect(SIGNAL_THRESHOLDS).toEqual(before);
  });
});
