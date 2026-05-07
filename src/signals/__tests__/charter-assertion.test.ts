import { describe, expect, test } from "vitest";

import {
  assertSevenDimensions,
  CharterAssertionError,
} from "../charter-assertion";

describe("assertSevenDimensions", () => {
  test("passes for a fully-covered v6.5 strategy", () => {
    const result = assertSevenDimensions({
      strategy: "BBDX-v6.5",
      indicators: [
        { name: "RSI" },
        { name: "BB" },
        { name: "ADX" },
        { name: "Volume_zscore" },
        { name: "Wave_Tracker" },
        { name: "Fear&Greed" },
        { name: "Exchange_Netflow" },
      ],
    });
    expect(result.passed).toBe(true);
    expect(result.coverage.covered).toBe(7);
  });

  test("throws when missing macro + onchain", () => {
    expect(() =>
      assertSevenDimensions({
        strategy: "BBDX-baseline",
        indicators: [
          { name: "RSI" },
          { name: "BB" },
          { name: "ADX" },
          { name: "Volume_zscore" },
          { name: "Candle_Pattern" },
        ],
      })
    ).toThrow(CharterAssertionError);
  });

  test("throws when a critical violation fires (duplicate dimension)", () => {
    expect(() =>
      assertSevenDimensions({
        strategy: "BBDX-dup",
        indicators: [
          { name: "RSI" },
          { name: "BB" },
          { name: "ATR" }, // duplicate volatility
          { name: "ADX" },
          { name: "Volume_zscore" },
          { name: "Wave_Tracker" },
          { name: "Fear&Greed" },
          { name: "Exchange_Netflow" },
        ],
      })
    ).toThrow(CharterAssertionError);
  });

  test("attaches the validator result on the thrown error", () => {
    try {
      assertSevenDimensions({
        strategy: "missing-macro",
        indicators: [
          { name: "RSI" },
          { name: "BB" },
          { name: "ADX" },
          { name: "Volume_zscore" },
          { name: "Wave_Tracker" },
          { name: "Exchange_Netflow" },
        ],
      });
      expect.fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(CharterAssertionError);
      const e = err as CharterAssertionError;
      expect(e.result.missingDimensions.map((m) => m.dimension)).toContain(
        "macro"
      );
    }
  });
});
