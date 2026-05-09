/**
 * Market Breadth modifier — 단위 테스트.
 *
 * 검증:
 *   1. 모든 심볼 RSI < 30 → panic, multiplier 1.30
 *   2. 모든 심볼 RSI > 70 → euphoria, multiplier 0.60
 *   3. 중간 분포 → neutral, multiplier 1.00
 *   4. 빈 universe → status="stub", multiplier=1.0
 *   5. 모든 fetch 실패 → status="stub", multiplier=1.0
 *   6. dimension = 6
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Candle } from "@shared/types";

// fetchKlines mock — vi.mock 은 hoisted
vi.mock("../../bybit", () => {
  return {
    fetchKlines: vi.fn(),
    fetch24hTicker: vi.fn(),
    fetchAll24hTickers: vi.fn(),
    fetchMultiplePrices: vi.fn(),
    validateSymbol: vi.fn(),
  };
});

import { fetchKlines } from "../../bybit";
import {
  computeMarketBreadth,
  __clearBreadthCache,
} from "../market-breadth";

const mockedFetch = fetchKlines as ReturnType<typeof vi.fn>;

/** 단조 하락 캔들 → RSI 매우 낮음. */
function makeFallingCandles(n = 250): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const c = 200 - i * 0.5;
    return {
      openTime: i * 14400000,
      open: c + 0.5,
      high: c + 0.6,
      low: c - 0.1,
      close: c,
      volume: 1000,
      closeTime: i * 14400000 + 14400000,
    };
  });
}

/** 단조 상승 → RSI 매우 높음. */
function makeRisingCandles(n = 250): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const c = 100 + i * 0.5;
    return {
      openTime: i * 14400000,
      open: c - 0.5,
      high: c + 0.1,
      low: c - 0.6,
      close: c,
      volume: 1000,
      closeTime: i * 14400000 + 14400000,
    };
  });
}

/** 횡보 → RSI 중립. */
function makeSidewaysCandles(n = 250): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const c = 100 + Math.sin(i / 5) * 1;
    return {
      openTime: i * 14400000,
      open: c,
      high: c + 0.5,
      low: c - 0.5,
      close: c,
      volume: 1000,
      closeTime: i * 14400000 + 14400000,
    };
  });
}

beforeEach(() => {
  __clearBreadthCache();
  mockedFetch.mockReset();
});

describe("computeMarketBreadth — 5 sentiment 분류", () => {
  it("모든 심볼 단조 하락 (RSI<30 70%) → panic, multiplier=1.30", async () => {
    mockedFetch.mockImplementation(async () => makeFallingCandles());
    const r = await computeMarketBreadth(
      ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"],
      "4h"
    );
    expect(r.sentiment).toBe("panic");
    expect(r.multiplier).toBe(1.30);
    expect(r.status).toBe("real");
    expect(r.dimension).toBe(6);
    expect(r.breakdown.rsiBelow30Pct).toBeGreaterThan(0.6);
  });

  it("모든 심볼 단조 상승 (RSI>70) → euphoria, multiplier=0.60", async () => {
    mockedFetch.mockImplementation(async () => makeRisingCandles());
    const r = await computeMarketBreadth(["X", "Y", "Z", "W", "V"], "4h");
    expect(r.sentiment).toBe("euphoria");
    expect(r.multiplier).toBe(0.60);
    expect(r.breakdown.rsiAbove70Pct).toBeGreaterThan(0.5);
  });

  it("횡보 → neutral, multiplier=1.0", async () => {
    mockedFetch.mockImplementation(async () => makeSidewaysCandles());
    const r = await computeMarketBreadth(["P", "Q", "R", "S"], "4h");
    expect(r.sentiment).toBe("neutral");
    expect(r.multiplier).toBe(1.0);
  });
});

describe("computeMarketBreadth — graceful fallback", () => {
  it("빈 universe → status='stub', multiplier=1.0", async () => {
    const r = await computeMarketBreadth([], "4h");
    expect(r.status).toBe("stub");
    expect(r.multiplier).toBe(1.0);
    expect(r.breakdown.totalCoins).toBe(0);
  });

  it("모든 fetch 실패 → status='stub', multiplier=1.0", async () => {
    mockedFetch.mockImplementation(async () => {
      throw new Error("Network down");
    });
    const r = await computeMarketBreadth(["A", "B", "C"], "4h");
    expect(r.status).toBe("stub");
    expect(r.multiplier).toBe(1.0);
    expect(r.breakdown.totalCoins).toBe(3); // 시도 한 개수
  });

  it("부분 실패 — 일부만 fetch 성공 → 실데이터 기반 분류", async () => {
    mockedFetch.mockImplementationOnce(async () => makeFallingCandles());
    mockedFetch.mockImplementationOnce(async () => makeFallingCandles());
    mockedFetch.mockImplementationOnce(async () => {
      throw new Error("fail");
    });
    const r = await computeMarketBreadth(["A", "B", "C"], "4h");
    expect(r.status).toBe("real");
    expect(r.breakdown.totalCoins).toBe(2);
  });
});

describe("computeMarketBreadth — 헌장 준수", () => {
  it("multiplier 항상 [0.30, 1.40]", async () => {
    mockedFetch.mockImplementation(async () => makeFallingCandles());
    const r = await computeMarketBreadth(["A"], "4h");
    expect(r.multiplier).toBeGreaterThanOrEqual(0.30);
    expect(r.multiplier).toBeLessThanOrEqual(1.40);
  });
});
