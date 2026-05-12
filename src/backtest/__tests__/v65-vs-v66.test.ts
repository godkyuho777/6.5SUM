/**
 * v6.5 vs v6.6 비교 인프라 smoke test.
 *
 * 실제 Bybit fetch + 백테스트는 CLI (cli-compare-v65-v66.ts) 에서 수행.
 * 본 테스트는 비교 로직의 import 무결성과 calibration 모듈 연결만 검증.
 *
 * 실제 winRate 측정은 사용자가 직접 실행 (rate limit 분산):
 *   pnpm backtest:compare
 */

import { describe, expect, it } from "vitest";
import {
  evaluatePositionSignalsV66,
} from "../../strategies/bbdx-v66";
import {
  getWeightsForSignal,
  getThresholdForSignal,
} from "../../strategies/weight-calibration";

describe("v65-vs-v66 인프라", () => {
  it("evaluatePositionSignalsV66 export 가능", () => {
    expect(typeof evaluatePositionSignalsV66).toBe("function");
  });

  it("getWeightsForSignal — external manifest fallback (BTCUSDT 4h NUM long)", async () => {
    const r = await getWeightsForSignal({
      symbol: "BTCUSDT",
      tf: "4h",
      path: "NUM",
      side: "long",
    });
    // DB 없으면 external manifest → BTCUSDT 가 'all' 매칭에 fall through.
    expect(["external", "default"]).toContain(r.source);
    // 가중치 합 ≈ 1
    const sum =
      r.weights.momentum +
      r.weights.position +
      r.weights.trend +
      r.weights.volume +
      r.weights.action;
    expect(Math.abs(sum - 1)).toBeLessThan(0.01);
  });

  it("getThresholdForSignal — default fallback (1h timeframe)", async () => {
    const r = await getThresholdForSignal({
      symbol: "BTCUSDT",
      tf: "1h",
      side: "long",
    });
    // DB 없으면 default 40
    expect(r.threshold).toBeGreaterThan(0);
    expect(r.threshold).toBeLessThanOrEqual(100);
  });

  it("getThresholdForSignal — SHORT 도 fetch 가능", async () => {
    const r = await getThresholdForSignal({
      symbol: "BTCUSDT",
      tf: "1h",
      side: "short",
    });
    expect(r.threshold).toBeGreaterThan(0);
  });
});
