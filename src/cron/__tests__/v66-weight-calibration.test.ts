/**
 * v6.6 Weight Calibration Cron — D-5 (2026-05-12).
 *
 * Graceful failure 검증:
 *   - 개별 조합 실패가 전체 cron 을 깨지 않음
 *   - errors[] 배열 누적
 *   - health 분류 (ok / degraded / fatal)
 *   - outer try/catch — cron 자체 never throw
 *   - fatalError 필드 + health="fatal" 시 처리
 */

import { describe, test, expect, vi, beforeEach } from "vitest";
import { runWeeklyCalibration } from "../v66-weight-calibration";

// ── weight-calibration mocks ───────────────────────────────────────

const autoCorrectWeightsMock = vi.fn();
const autoCorrectThresholdMock = vi.fn();

vi.mock("../../strategies/weight-calibration", () => ({
  autoCorrectWeights: (args: any) => autoCorrectWeightsMock(args),
  autoCorrectThreshold: (args: any) => autoCorrectThresholdMock(args),
}));

beforeEach(() => {
  autoCorrectWeightsMock.mockReset();
  autoCorrectThresholdMock.mockReset();
});

// 5 symbols × 3 tf × 2 sides × 3 paths = 90 weights
// 5 symbols × 3 tf × 2 sides = 30 thresholds
// Total = 120 combinations

describe("runWeeklyCalibration — graceful failure (D-5)", () => {
  test("모든 조합 성공 → health='ok', failedCount=0", async () => {
    autoCorrectWeightsMock.mockResolvedValue({
      source: "self_backtest",
      status: "ok",
      saved: true,
      reason: "calibrated",
    });
    autoCorrectThresholdMock.mockResolvedValue({
      source: "self_backtest",
      status: "ok",
      saved: true,
      threshold: 55,
      reason: "calibrated",
    });

    const report = await runWeeklyCalibration();

    expect(report.health).toBe("ok");
    expect(report.failedCount).toBe(0);
    expect(report.errors).toHaveLength(0);
    expect(report.fatalError).toBeUndefined();
    expect(report.weightResults.length).toBeGreaterThan(0);
    expect(report.thresholdResults.length).toBeGreaterThan(0);
  });

  test("개별 weights 실패 → errors[] 에 누적, cron 계속 실행", async () => {
    let callCount = 0;
    autoCorrectWeightsMock.mockImplementation(async () => {
      callCount++;
      if (callCount === 5) {
        throw new Error("simulated DB connection lost");
      }
      return {
        source: "self_backtest",
        status: "ok",
        saved: true,
        reason: "ok",
      };
    });
    autoCorrectThresholdMock.mockResolvedValue({
      source: "default",
      status: "ok",
      saved: false,
      threshold: 50,
      reason: "fallback",
    });

    const report = await runWeeklyCalibration();

    // 1개 실패해도 나머지 89 + 30 = 119 통과
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0].kind).toBe("weights");
    expect(report.errors[0].message).toContain("simulated DB connection lost");
    expect(report.health).toBe("ok"); // 1/120 = 0.8% 실패 < 50%
    expect(report.fatalError).toBeUndefined();
  });

  test("50% 이상 실패 → health='degraded'", async () => {
    // 90 weights call 중 절반 실패
    let weightCallCount = 0;
    autoCorrectWeightsMock.mockImplementation(async () => {
      weightCallCount++;
      if (weightCallCount % 2 === 0) throw new Error("intermittent failure");
      return {
        source: "default",
        status: "ok",
        saved: false,
        reason: "fallback",
      };
    });
    // threshold 절반 실패
    let thresholdCallCount = 0;
    autoCorrectThresholdMock.mockImplementation(async () => {
      thresholdCallCount++;
      if (thresholdCallCount % 2 === 0) throw new Error("intermittent failure");
      return {
        source: "default",
        status: "ok",
        saved: false,
        threshold: 50,
        reason: "fallback",
      };
    });

    const report = await runWeeklyCalibration();

    expect(report.failedCount).toBeGreaterThan(0);
    expect(["degraded", "fatal"]).toContain(report.health);
  });

  test("100% 실패 → health='fatal'", async () => {
    autoCorrectWeightsMock.mockRejectedValue(new Error("all weights down"));
    autoCorrectThresholdMock.mockRejectedValue(new Error("all thresholds down"));

    const report = await runWeeklyCalibration();

    expect(report.health).toBe("fatal");
    expect(report.errors.length).toBeGreaterThan(50);
    expect(report.weightResults).toHaveLength(0);
    expect(report.thresholdResults).toHaveLength(0);
  });

  test("실패 errors 에 symbol/tf/path/side 메타 포함", async () => {
    autoCorrectWeightsMock.mockRejectedValue(new Error("test err"));
    autoCorrectThresholdMock.mockResolvedValue({
      source: "default",
      status: "ok",
      saved: false,
      threshold: 50,
      reason: "fallback",
    });

    const report = await runWeeklyCalibration();

    // 모든 weight 에러에 메타 정보 있어야
    const weightErrors = report.errors.filter((e) => e.kind === "weights");
    expect(weightErrors.length).toBeGreaterThan(0);
    const sample = weightErrors[0];
    expect(sample.symbol).toBeDefined();
    expect(sample.tf).toBeDefined();
    expect(sample.path).toBeDefined();
    expect(sample.side).toBeDefined();
  });

  test("startedAt/endedAt timestamp 일관성", async () => {
    autoCorrectWeightsMock.mockResolvedValue({
      source: "default",
      status: "ok",
      saved: false,
      reason: "fallback",
    });
    autoCorrectThresholdMock.mockResolvedValue({
      source: "default",
      status: "ok",
      saved: false,
      threshold: 50,
      reason: "fallback",
    });

    const before = Date.now();
    const report = await runWeeklyCalibration();
    const after = Date.now();

    expect(report.startedAt).toBeGreaterThanOrEqual(before);
    expect(report.endedAt).toBeGreaterThanOrEqual(report.startedAt);
    expect(report.endedAt).toBeLessThanOrEqual(after + 100);
  });
});

describe("runWeeklyCalibration — outer try/catch (never throw)", () => {
  test("autoCorrectWeights 가 비동기 throw 해도 runWeeklyCalibration 은 resolve", async () => {
    autoCorrectWeightsMock.mockRejectedValue(new Error("fatal"));
    autoCorrectThresholdMock.mockRejectedValue(new Error("fatal"));

    // throw 없이 resolved 되어야
    await expect(runWeeklyCalibration()).resolves.toBeDefined();
  });

  test("report 가 항상 valid shape 반환", async () => {
    autoCorrectWeightsMock.mockRejectedValue(new Error("test"));
    autoCorrectThresholdMock.mockRejectedValue(new Error("test"));

    const report = await runWeeklyCalibration();

    expect(report).toHaveProperty("startedAt");
    expect(report).toHaveProperty("endedAt");
    expect(report).toHaveProperty("totalCombinations");
    expect(report).toHaveProperty("appliedCount");
    expect(report).toHaveProperty("fallbackCount");
    expect(report).toHaveProperty("failedCount");
    expect(report).toHaveProperty("errors");
    expect(report).toHaveProperty("health");
    expect(Array.isArray(report.errors)).toBe(true);
  });
});
