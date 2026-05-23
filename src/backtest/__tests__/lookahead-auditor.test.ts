/**
 * Lookahead-free Auditor unit tests (P1-#1, 2026-05-23).
 *
 * 각 위반 종류 별로 minimum reproducible trade 를 만들어 audit 이 정확히
 * 잡아내는지 검증한다. 또한 정상 trade 가 false-positive 없이 통과하는지
 * 회귀 보장.
 */

import { describe, test, expect } from "vitest";
import { auditNoLookahead, formatAuditSummary } from "../lookahead-auditor";
import type { BacktestTrade } from "../types";

const HOUR_MS = 60 * 60 * 1000;
const FOUR_HOUR_MS = 4 * HOUR_MS;

/** 4h timeframe 의 정렬된 timestamp 생성 헬퍼 */
function alignedTs4h(daysFromEpoch: number, candleOffset: number): number {
  return daysFromEpoch * 24 * HOUR_MS + candleOffset * FOUR_HOUR_MS;
}

/** Minimum valid trade for 4h timeframe */
function makeValidTrade(overrides: Partial<BacktestTrade> = {}): BacktestTrade {
  const signalTs = alignedTs4h(10000, 0);
  return {
    signalTs,
    symbol: "BTCUSDT",
    tf: "4h",
    entryPrice: 50000,
    target: 51000,
    stopLoss: 49000,
    signalStrength: 75,
    rsi: 28,
    bbLower: 49500,
    bbMiddle: 50000,
    bbUpper: 50500,
    adx: 25,
    plusDi: 30,
    minusDi: 15,
    exitPrice: 51000,
    exitTs: signalTs + 5 * FOUR_HOUR_MS, // 5 candles after
    exitReason: "target_hit",
    returnPct: 2.0,
    maxFavorable: 2.5,
    maxAdverse: -0.5,
    win: true,
    holdingCandles: 5,
    ...overrides,
  };
}

describe("auditNoLookahead — happy path", () => {
  test("정상 trade 들은 violation 0건", () => {
    const trades = [
      makeValidTrade(),
      makeValidTrade({ symbol: "ETHUSDT" }),
      makeValidTrade({ symbol: "SOLUSDT", holdingCandles: 10, exitTs: alignedTs4h(10000, 0) + 10 * FOUR_HOUR_MS }),
    ];
    const result = auditNoLookahead(trades);
    expect(result.passed).toBe(true);
    expect(result.violationCount).toBe(0);
    expect(result.totalTrades).toBe(3);
  });

  test("빈 trades 배열은 자동 pass", () => {
    const result = auditNoLookahead([]);
    expect(result.passed).toBe(true);
    expect(result.totalTrades).toBe(0);
  });
});

describe("auditNoLookahead — temporal monotonicity", () => {
  test("exitTs < signalTs (시간 역행) detect", () => {
    const sig = alignedTs4h(10000, 5);
    const trades = [
      makeValidTrade({
        signalTs: sig,
        exitTs: sig - FOUR_HOUR_MS, // exit BEFORE signal
      }),
    ];
    const result = auditNoLookahead(trades);
    expect(result.passed).toBe(false);
    expect(result.byKind["temporal-monotonicity"]).toBeGreaterThan(0);
  });

  test("exitTs == signalTs 도 violation (≤ 조건)", () => {
    const sig = alignedTs4h(10000, 0);
    const trades = [
      makeValidTrade({ signalTs: sig, exitTs: sig, holdingCandles: 0 }),
    ];
    const result = auditNoLookahead(trades);
    expect(result.byKind["temporal-monotonicity"]).toBe(1);
  });
});

describe("auditNoLookahead — candle alignment", () => {
  test("4h 캔들 경계와 정렬 안 됨 → violation", () => {
    const trades = [
      makeValidTrade({
        signalTs: alignedTs4h(10000, 0) + 17 * 60 * 1000, // +17분 (4h boundary 안 맞음)
        exitTs: alignedTs4h(10000, 0) + 5 * FOUR_HOUR_MS,
      }),
    ];
    const result = auditNoLookahead(trades);
    expect(result.passed).toBe(false);
    expect(result.byKind["candle-alignment"]).toBeGreaterThan(0);
  });

  test("1M timeframe 은 alignment 검사 생략 (월 길이 가변)", () => {
    // 1M 의 임의 timestamp 도 alignment violation 아님
    const oddTs = alignedTs4h(10000, 0) + 13 * 60 * 1000;
    const trades = [
      makeValidTrade({
        tf: "1M",
        signalTs: oddTs,
        exitTs: oddTs + 30 * 24 * HOUR_MS, // 1 month later approximately
        holdingCandles: 1,
      }),
    ];
    const result = auditNoLookahead(trades);
    // alignment violation 0 이어야 함 (1M 제외 정책)
    expect(result.byKind["candle-alignment"]).toBe(0);
  });
});

describe("auditNoLookahead — holding consistency", () => {
  test("holdingCandles 와 실제 경과 시간 불일치 detect", () => {
    const sig = alignedTs4h(10000, 0);
    const trades = [
      makeValidTrade({
        signalTs: sig,
        exitTs: sig + 10 * FOUR_HOUR_MS, // 10 candles 경과
        holdingCandles: 5, // 5 라고 기록 → 불일치
      }),
    ];
    const result = auditNoLookahead(trades);
    expect(result.byKind["holding-consistency"]).toBeGreaterThan(0);
  });

  test("tolerance 안에 들어가는 1 candle 차이는 OK", () => {
    const sig = alignedTs4h(10000, 0);
    const trades = [
      makeValidTrade({
        signalTs: sig,
        exitTs: sig + 6 * FOUR_HOUR_MS,
        holdingCandles: 5, // 1 candle 차이 → tolerance 안
      }),
    ];
    const result = auditNoLookahead(trades, { holdingToleranceCandles: 1 });
    expect(result.byKind["holding-consistency"]).toBe(0);
  });
});

describe("auditNoLookahead — partial exits", () => {
  test("partialExits offset 순서가 monotonic 아니면 violation", () => {
    const sig = alignedTs4h(10000, 0);
    const trades = [
      makeValidTrade({
        signalTs: sig,
        exitTs: sig + 10 * FOUR_HOUR_MS,
        holdingCandles: 10,
        partialExits: [
          { tier: 1, candleOffset: 5, price: 51000, ratio: 0.5, returnPct: 1.5 },
          { tier: 2, candleOffset: 3, price: 50800, ratio: 0.5, returnPct: 1.0 }, // ← 3 < 5
        ],
      }),
    ];
    const result = auditNoLookahead(trades);
    expect(result.byKind["partial-exits-ordering"]).toBe(1);
  });

  test("partialExits offset > holdingCandles 면 out-of-bounds", () => {
    const sig = alignedTs4h(10000, 0);
    const trades = [
      makeValidTrade({
        signalTs: sig,
        exitTs: sig + 5 * FOUR_HOUR_MS,
        holdingCandles: 5,
        partialExits: [
          { tier: 1, candleOffset: 3, price: 51000, ratio: 0.5, returnPct: 1.5 },
          { tier: 2, candleOffset: 7, price: 51500, ratio: 0.5, returnPct: 2.0 }, // ← 7 > 5
        ],
      }),
    ];
    const result = auditNoLookahead(trades);
    expect(result.byKind["partial-exits-out-of-bounds"]).toBe(1);
  });
});

describe("auditNoLookahead — negative holding", () => {
  test("holdingCandles 음수면 violation", () => {
    const sig = alignedTs4h(10000, 0);
    const trades = [
      makeValidTrade({
        signalTs: sig,
        exitTs: sig + FOUR_HOUR_MS,
        holdingCandles: -3,
      }),
    ];
    const result = auditNoLookahead(trades);
    expect(result.byKind["negative-holding"]).toBe(1);
  });
});

describe("auditNoLookahead — future timestamp", () => {
  test("signalTs > endMs 면 violation", () => {
    const endMs = alignedTs4h(10000, 0);
    const trades = [
      makeValidTrade({
        signalTs: alignedTs4h(10001, 0), // 1 day 후
        exitTs: alignedTs4h(10001, 5),
        holdingCandles: 5,
      }),
    ];
    const result = auditNoLookahead(trades, { endMs });
    expect(result.byKind["future-timestamp"]).toBeGreaterThan(0);
  });

  test("endMs 미지정 시 future-timestamp 검사 생략", () => {
    const trades = [
      makeValidTrade({
        signalTs: alignedTs4h(100000, 0), // 미래
        exitTs: alignedTs4h(100000, 5),
        holdingCandles: 5,
      }),
    ];
    const result = auditNoLookahead(trades); // endMs 미지정
    expect(result.byKind["future-timestamp"]).toBe(0);
  });
});

describe("auditNoLookahead — multiple violations", () => {
  test("한 trade 가 여러 종류 violation 동시 일으킬 수 있음", () => {
    const sig = alignedTs4h(10000, 0) + 17 * 60 * 1000; // candle 정렬 안 됨
    const trades = [
      makeValidTrade({
        signalTs: sig,
        exitTs: sig - FOUR_HOUR_MS, // 시간 역행
        holdingCandles: -2, // 음수
      }),
    ];
    const result = auditNoLookahead(trades);
    expect(result.violationCount).toBeGreaterThanOrEqual(3);
    expect(result.byKind["temporal-monotonicity"]).toBe(1);
    expect(result.byKind["candle-alignment"]).toBe(1);
    expect(result.byKind["negative-holding"]).toBe(1);
  });

  test("maxViolations 초과 시 추가 violations 목록에 안 담김 (count 는 유지)", () => {
    const trades: BacktestTrade[] = [];
    for (let i = 0; i < 100; i++) {
      // 각 trade 마다 정확히 1개 violation (temporal-monotonicity 만): exitTs <= signalTs
      // holdingCandles 도 시간차에 맞게 0 으로 → holding-consistency 통과
      const sig = alignedTs4h(10000, i);
      trades.push(
        makeValidTrade({
          signalTs: sig,
          exitTs: sig, // exitTs == signalTs (≤ 조건 violation)
          holdingCandles: 0,
        }),
      );
    }
    const result = auditNoLookahead(trades, { maxViolations: 10 });
    expect(result.violationCount).toBe(100); // 100 trades × 1 violation each
    expect(result.violations.length).toBe(10); // 샘플 cap
  });
});

describe("formatAuditSummary", () => {
  test("passed 시 ✓ 메시지", () => {
    const trades = [makeValidTrade()];
    const result = auditNoLookahead(trades);
    const msg = formatAuditSummary(result);
    expect(msg).toContain("PASSED");
    expect(msg).toContain("1 trades");
  });

  test("failed 시 ✗ + sample violations", () => {
    const sig = alignedTs4h(10000, 0);
    const trades = [
      makeValidTrade({ signalTs: sig, exitTs: sig - FOUR_HOUR_MS }),
    ];
    const result = auditNoLookahead(trades);
    const msg = formatAuditSummary(result);
    expect(msg).toContain("FAILED");
    expect(msg).toContain("temporal-monotonicity");
  });
});
