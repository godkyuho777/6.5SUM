/**
 * v6.3 EXIT scenario tests — Part II.1 §3 comparison table.
 *
 * The seven canonical scenarios that prove the v6.3 redesign behaves
 * differently from the defective v6.1 4-of-4 rule. Each test asserts
 * the v6.3 expected outcome explicitly.
 */

import { describe, expect, test } from "vitest";
import type {
  CandlePatternMatch,
  TechnicalIndicators,
} from "@shared/types";

import {
  decideExitForPosition,
  decideExitForScanner,
} from "..";

const baseInd: TechnicalIndicators = {
  rsi: 50,
  bbUpper: 110,
  bbMiddle: 100,
  bbLower: 90,
  adx: 15,
  plusDi: 22,
  minusDi: 18,
};

const bearishEngulfing: CandlePatternMatch = {
  name: "bearishEngulfing",
  bias: "bearish",
  candlesAgo: 0,
  strength: 85, // 0.85 in [0,1] terms — ≥0.6 threshold
};

describe("Part II.1 §3 — v6.3 EXIT scenario comparison", () => {
  test("S1: BB-mid recovery + RSI 65 + ADX 32 + +DI 27 → 50% partial only (NOT full v6.1 exit)", () => {
    const ind = { ...baseInd, rsi: 65, adx: 32, plusDi: 27, minusDi: 12 };
    const result = decideExitForScanner({
      price: 105,
      indicators: ind,
      bearishPatterns: [],
    });

    expect(result).not.toBeNull();
    expect(result!.category).toBe("A");
    expect(result!.action).toBe("partial_exit");
    expect(result!.ratio).toBe(0.5);
    // Reversal score is low because +DI > -DI (no cross) and no bearish pattern.
    // Even though ADX > 25, the spec says ADX confirms direction only when
    // -DI > +DI; here +DI dominates, so adxConfirmation=0.
  });

  test("S2: BB-mid recovery alone → 50% partial (was: hold under v6.1 with only 1/4 conditions)", () => {
    const result = decideExitForScanner({
      price: 100.5,
      indicators: baseInd,
      bearishPatterns: [],
    });

    expect(result).not.toBeNull();
    expect(result!.category).toBe("A");
    expect(result!.action).toBe("partial_exit");
    expect(result!.ratio).toBe(0.5);
  });

  test("S3: strong uptrend +DI 30 ADX 35 → hold (no exit, position rides)", () => {
    const ind = { ...baseInd, plusDi: 30, minusDi: 8, adx: 35 };
    const result = decideExitForScanner({
      price: 95, // below BB middle so EXIT-A doesn't fire
      indicators: ind,
      bearishPatterns: [],
    });

    expect(result).toBeNull();
  });

  test("S4: -DI cross + bearish engulfing → full reversal exit", () => {
    const ind = {
      ...baseInd,
      adx: 30,
      plusDi: 12,
      minusDi: 38, // strong cross
    };
    const result = decideExitForScanner({
      price: 95,
      indicators: ind,
      bearishPatterns: [bearishEngulfing],
    });

    expect(result).not.toBeNull();
    expect(result!.category).toBe("B");
    expect(result!.action).toBe("full_exit");
    expect(result!.ratio).toBe(1.0);
    expect(result!.reversalScore).toBeGreaterThanOrEqual(0.5);
  });

  test("S5: +5% gain → trailing stop activates (no exit, just stop move)", () => {
    const entry = 100;
    const price = 105; // +5%
    const result = decideExitForPosition({
      price,
      indicators: baseInd,
      bearishPatterns: [],
      position: {
        entryPrice: entry,
        currentStop: 97,
        stopMovedToBreakeven: true, // breakeven already done
      },
      entryBarIndex: 0,
      currentBarIndex: 5,
      // EXIT-A tier 1 was already taken when price first hit BB middle —
      // we're now testing the protection layer that runs after.
      tier1AlreadyTaken: true,
    });

    expect(result.decision).not.toBeNull();
    expect(result.decision!.category).toBe("C");
    expect(result.decision!.action).toBe("move_stop");
    expect(result.newStop).toBeCloseTo(105 * 0.97, 5);
  });

  test("S6: 5+ days no progress (30+ bars, <0.5% pnl) → time stop full exit", () => {
    const entry = 100;
    const price = 100.2; // +0.2% — under threshold
    const result = decideExitForPosition({
      price,
      indicators: { ...baseInd, plusDi: 22, minusDi: 18 },
      bearishPatterns: [],
      position: {
        entryPrice: entry,
        currentStop: 97,
        stopMovedToBreakeven: false,
      },
      entryBarIndex: 0,
      currentBarIndex: 30,
      // Tier-1 partial would have fired first; this test exercises D
      // after a position has stagnated at/above BB middle.
      tier1AlreadyTaken: true,
    });

    expect(result.decision).not.toBeNull();
    expect(result.decision!.category).toBe("D");
    expect(result.decision!.action).toBe("full_exit");
    expect(result.decision!.ratio).toBe(1.0);
  });

  test("S7: Fib 161.8% reached → automatic full exit (EXIT-A tier 3)", () => {
    const result = decideExitForScanner({
      price: 130,
      indicators: baseInd,
      bearishPatterns: [],
      fib161_8: 130,
    });

    expect(result).not.toBeNull();
    expect(result!.category).toBe("A");
    expect(result!.action).toBe("full_exit");
    expect(result!.ratio).toBe(1.0);
  });
});

describe("v6.3 priority ordering — STOP > B > A > C > D", () => {
  test("STOP loss beats every other category", () => {
    const result = decideExitForPosition({
      price: 92,
      indicators: { ...baseInd, plusDi: 8, minusDi: 40, adx: 35 },
      bearishPatterns: [bearishEngulfing],
      position: {
        entryPrice: 100,
        currentStop: 95,
        stopMovedToBreakeven: false,
      },
      entryBarIndex: 0,
      currentBarIndex: 60,
      stopLossHit: true,
    });
    expect(result.decision!.category).toBe("STOP");
  });

  test("Reversal beats profit target when both fire", () => {
    const ind = {
      ...baseInd,
      adx: 32,
      plusDi: 10,
      minusDi: 35,
    };
    const result = decideExitForScanner({
      price: 101, // would hit BB middle → EXIT-A
      indicators: ind,
      bearishPatterns: [bearishEngulfing], // also reversal
    });
    expect(result!.category).toBe("B");
  });
});

describe("v6.1 legacy compatibility", () => {
  test("populates v6.1 trigger fields for FE backward compat", () => {
    const ind = { ...baseInd, rsi: 65, adx: 32, plusDi: 27 };
    const result = decideExitForScanner({
      price: 105,
      indicators: ind,
      bearishPatterns: [],
    });

    expect(result!.triggers).toContain("bbMiddle");
    expect(result!.triggers).toContain("rsi65");
    expect(result!.triggers).toContain("adx30");
    expect(result!.triggers).toContain("plusDi25");
    expect(result!.conditionsMet).toBe(4);
  });

  test("relaxedToBearish flag mirrors v6.1 semantics", () => {
    const ind = { ...baseInd, rsi: 50, adx: 20, plusDi: 30 };
    const result = decideExitForScanner({
      price: 101,
      indicators: ind,
      bearishPatterns: [bearishEngulfing],
    });
    // bbMiddle + plusDi25 = 2 triggers, with bearish present → relaxed
    expect(result!.conditionsMet).toBe(2);
    expect(result!.relaxedToBearish).toBe(true);
  });
});

describe("Reversal score component breakdown", () => {
  test("DI cross alone with strong differential reaches partial threshold", () => {
    const ind = {
      ...baseInd,
      plusDi: 5,
      minusDi: 35, // (35-5)/30 = 1.0 → diCross 0.40
      adx: 20, // < 25 so no adxConfirmation
    };
    const result = decideExitForScanner({
      price: 95, // below BB middle
      indicators: ind,
      bearishPatterns: [],
    });
    // diCross 0.40 → above 0.30 partial threshold, below 0.50 full
    expect(result).not.toBeNull();
    expect(result!.category).toBe("B");
    expect(result!.action).toBe("partial_exit");
  });

  test("ADX confirmation only fires when -DI > +DI", () => {
    const indPlus = {
      ...baseInd,
      plusDi: 35,
      minusDi: 5,
      adx: 40, // strong but +DI dominates
    };
    const result = decideExitForScanner({
      price: 95,
      indicators: indPlus,
      bearishPatterns: [],
    });
    expect(result).toBeNull(); // no cross + no adx confirmation = no reversal
  });

  test("breakdown captures component contributions", () => {
    const ind = {
      ...baseInd,
      plusDi: 5,
      minusDi: 35,
      adx: 35,
    };
    const result = decideExitForScanner({
      price: 95,
      indicators: ind,
      bearishPatterns: [bearishEngulfing],
    });
    expect(result!.reversalBreakdown).toBeDefined();
    expect(result!.reversalBreakdown!.diCross).toBeGreaterThan(0);
    expect(result!.reversalBreakdown!.adxConfirmation).toBeGreaterThan(0);
    expect(result!.reversalBreakdown!.bearishPattern).toBeGreaterThan(0);
  });
});
