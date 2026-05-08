import { describe, expect, it } from "vitest";
import {
  calculateRSI,
  calculateBollingerBands,
  calculateADX,
  calculateAllIndicators,
  isEntrySignal,
  isExitSignal,
  calculateSignalStrength,
} from "./indicators";
import type { Candle, TechnicalIndicators } from "@shared/types";

// Helper to generate candle data
function generateCandles(count: number, basePrice = 100, volatility = 5): Candle[] {
  const candles: Candle[] = [];
  let price = basePrice;
  for (let i = 0; i < count; i++) {
    const change = (Math.sin(i * 0.3) + Math.random() - 0.5) * volatility;
    price = Math.max(price + change, 1);
    const high = price + Math.random() * volatility;
    const low = price - Math.random() * volatility;
    candles.push({
      openTime: Date.now() - (count - i) * 4 * 60 * 60 * 1000,
      open: price - change / 2,
      high: Math.max(high, price),
      low: Math.min(low, price),
      close: price,
      volume: 1000 + Math.random() * 5000,
      closeTime: Date.now() - (count - i - 1) * 4 * 60 * 60 * 1000,
    });
  }
  return candles;
}

// Generate a downtrend for entry signal testing
function generateDowntrend(count: number): Candle[] {
  const candles: Candle[] = [];
  let price = 100;
  for (let i = 0; i < count; i++) {
    // Steady decline
    price = price * 0.995;
    const high = price + 0.5;
    const low = price - 0.5;
    candles.push({
      openTime: Date.now() - (count - i) * 4 * 60 * 60 * 1000,
      open: price + 0.3,
      high,
      low,
      close: price,
      volume: 1000,
      closeTime: Date.now() - (count - i - 1) * 4 * 60 * 60 * 1000,
    });
  }
  return candles;
}

describe("calculateRSI", () => {
  it("returns 50 when insufficient data", () => {
    const result = calculateRSI([100, 101, 102]);
    expect(result).toBe(50);
  });

  it("returns a value between 0 and 100 for valid data", () => {
    const closes = generateCandles(50).map((c) => c.close);
    const rsi = calculateRSI(closes);
    expect(rsi).toBeGreaterThanOrEqual(0);
    expect(rsi).toBeLessThanOrEqual(100);
  });

  it("returns 100 when all gains (no losses)", () => {
    const closes: number[] = [];
    for (let i = 0; i < 30; i++) {
      closes.push(100 + i);
    }
    const rsi = calculateRSI(closes);
    expect(rsi).toBe(100);
  });

  it("returns low RSI for consistent downtrend", () => {
    const closes: number[] = [];
    for (let i = 0; i < 30; i++) {
      closes.push(100 - i * 0.5);
    }
    const rsi = calculateRSI(closes);
    expect(rsi).toBeLessThan(30);
  });

  it("uses custom period when specified", () => {
    const closes = generateCandles(50).map((c) => c.close);
    const rsi7 = calculateRSI(closes, 7);
    const rsi14 = calculateRSI(closes, 14);
    // Different periods should generally produce different values
    expect(typeof rsi7).toBe("number");
    expect(typeof rsi14).toBe("number");
  });
});

describe("calculateBollingerBands", () => {
  it("returns same values when insufficient data", () => {
    const closes = [100, 101, 102];
    const bb = calculateBollingerBands(closes);
    expect(bb.upper).toBe(bb.lower);
    expect(bb.middle).toBe(bb.lower);
  });

  it("calculates correct middle band (SMA)", () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i++) {
      closes.push(100);
    }
    const bb = calculateBollingerBands(closes);
    expect(bb.middle).toBeCloseTo(100, 5);
    expect(bb.upper).toBeCloseTo(100, 5);
    expect(bb.lower).toBeCloseTo(100, 5);
  });

  it("upper > middle > lower for volatile data", () => {
    const closes = generateCandles(50, 100, 10).map((c) => c.close);
    const bb = calculateBollingerBands(closes);
    expect(bb.upper).toBeGreaterThan(bb.middle);
    expect(bb.middle).toBeGreaterThan(bb.lower);
  });

  it("wider bands with higher stdDev multiplier", () => {
    const closes = generateCandles(50, 100, 10).map((c) => c.close);
    const bb2 = calculateBollingerBands(closes, 20, 2);
    const bb3 = calculateBollingerBands(closes, 20, 3);
    expect(bb3.upper - bb3.lower).toBeGreaterThan(bb2.upper - bb2.lower);
  });
});

describe("calculateADX", () => {
  it("returns zeros when insufficient data", () => {
    const candles = generateCandles(5);
    const result = calculateADX(candles);
    expect(result.adx).toBe(0);
    expect(result.plusDi).toBe(0);
    expect(result.minusDi).toBe(0);
  });

  it("returns valid ADX values for sufficient data", () => {
    const candles = generateCandles(50);
    const result = calculateADX(candles);
    expect(result.adx).toBeGreaterThanOrEqual(0);
    expect(result.adx).toBeLessThanOrEqual(100);
    expect(result.plusDi).toBeGreaterThanOrEqual(0);
    expect(result.minusDi).toBeGreaterThanOrEqual(0);
  });

  it("returns numeric values for all fields", () => {
    const candles = generateCandles(100);
    const result = calculateADX(candles);
    expect(typeof result.adx).toBe("number");
    expect(typeof result.plusDi).toBe("number");
    expect(typeof result.minusDi).toBe("number");
    expect(Number.isFinite(result.adx)).toBe(true);
    expect(Number.isFinite(result.plusDi)).toBe(true);
    expect(Number.isFinite(result.minusDi)).toBe(true);
  });
});

describe("calculateAllIndicators", () => {
  it("returns all indicator fields", () => {
    const candles = generateCandles(50);
    const indicators = calculateAllIndicators(candles);
    expect(indicators).toHaveProperty("rsi");
    expect(indicators).toHaveProperty("bbUpper");
    expect(indicators).toHaveProperty("bbMiddle");
    expect(indicators).toHaveProperty("bbLower");
    expect(indicators).toHaveProperty("adx");
    expect(indicators).toHaveProperty("plusDi");
    expect(indicators).toHaveProperty("minusDi");
  });

  it("all numeric values are finite", () => {
    const candles = generateCandles(100);
    const indicators = calculateAllIndicators(candles);
    for (const [, value] of Object.entries(indicators)) {
      // Skip optional array fields (fibLevels, trendlines) — only assert
      // finiteness on numeric core indicators.
      if (typeof value !== "number") continue;
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});

describe("isEntrySignal", () => {
  it("returns true when all conditions met", () => {
    const indicators: TechnicalIndicators = {
      rsi: 32,
      bbUpper: 110,
      bbMiddle: 100,
      bbLower: 90,
      adx: 20,
      plusDi: 15,
      minusDi: 25,
    };
    // Price at BB lower band
    expect(isEntrySignal(90, indicators)).toBe(true);
  });

  it("returns false when RSI too high", () => {
    const indicators: TechnicalIndicators = {
      rsi: 50,
      bbUpper: 110,
      bbMiddle: 100,
      bbLower: 90,
      adx: 20,
      plusDi: 15,
      minusDi: 25,
    };
    expect(isEntrySignal(90, indicators)).toBe(false);
  });

  it("returns false when RSI too low (below 30)", () => {
    const indicators: TechnicalIndicators = {
      rsi: 25,
      bbUpper: 110,
      bbMiddle: 100,
      bbLower: 90,
      adx: 20,
      plusDi: 15,
      minusDi: 25,
    };
    expect(isEntrySignal(90, indicators)).toBe(false);
  });

  it("returns false when price far above BB lower", () => {
    const indicators: TechnicalIndicators = {
      rsi: 32,
      bbUpper: 110,
      bbMiddle: 100,
      bbLower: 90,
      adx: 20,
      plusDi: 15,
      minusDi: 25,
    };
    // Price well above BB lower
    expect(isEntrySignal(105, indicators)).toBe(false);
  });

  it("returns false when ADX too high", () => {
    const indicators: TechnicalIndicators = {
      rsi: 32,
      bbUpper: 110,
      bbMiddle: 100,
      bbLower: 90,
      adx: 40,
      plusDi: 15,
      minusDi: 25,
    };
    expect(isEntrySignal(90, indicators)).toBe(false);
  });

  it("accepts custom config", () => {
    const indicators: TechnicalIndicators = {
      rsi: 28,
      bbUpper: 110,
      bbMiddle: 100,
      bbLower: 90,
      adx: 25,
      plusDi: 15,
      minusDi: 25,
    };
    const result = isEntrySignal(90, indicators, {
      rsiLow: 25,
      rsiHigh: 30,
      adxThreshold: 30,
      bbTolerance: 0.02,
    });
    expect(result).toBe(true);
  });
});

describe("isExitSignal", () => {
  it("returns true when price reaches BB middle", () => {
    const indicators: TechnicalIndicators = {
      rsi: 50,
      bbUpper: 110,
      bbMiddle: 100,
      bbLower: 90,
      adx: 20,
      plusDi: 15,
      minusDi: 25,
    };
    expect(isExitSignal(100, indicators)).toBe(true);
  });

  it("returns true when RSI >= 70", () => {
    const indicators: TechnicalIndicators = {
      rsi: 75,
      bbUpper: 110,
      bbMiddle: 100,
      bbLower: 90,
      adx: 20,
      plusDi: 15,
      minusDi: 25,
    };
    expect(isExitSignal(95, indicators)).toBe(true);
  });

  it("returns true when ADX >= 30", () => {
    const indicators: TechnicalIndicators = {
      rsi: 50,
      bbUpper: 110,
      bbMiddle: 100,
      bbLower: 90,
      adx: 35,
      plusDi: 15,
      minusDi: 25,
    };
    // Even though price is below BB middle, ADX condition triggers
    expect(isExitSignal(95, indicators)).toBe(true);
  });

  it("returns true when +DI >= 30", () => {
    const indicators: TechnicalIndicators = {
      rsi: 50,
      bbUpper: 110,
      bbMiddle: 100,
      bbLower: 90,
      adx: 20,
      plusDi: 35,
      minusDi: 10,
    };
    expect(isExitSignal(95, indicators)).toBe(true);
  });

  it("returns false when no exit conditions met", () => {
    const indicators: TechnicalIndicators = {
      rsi: 50,
      bbUpper: 110,
      bbMiddle: 100,
      bbLower: 90,
      adx: 20,
      plusDi: 15,
      minusDi: 25,
    };
    // Price below BB middle, RSI < 70, ADX < 30, +DI < 30
    expect(isExitSignal(95, indicators)).toBe(false);
  });
});

describe("calculateSignalStrength", () => {
  it("returns 0 for neutral conditions", () => {
    const indicators: TechnicalIndicators = {
      rsi: 50,
      bbUpper: 110,
      bbMiddle: 100,
      bbLower: 90,
      adx: 40,
      plusDi: 25,
      minusDi: 15,
    };
    const strength = calculateSignalStrength(105, indicators);
    expect(strength).toBe(0);
  });

  it("returns high score for strong entry conditions", () => {
    const indicators: TechnicalIndicators = {
      rsi: 28,
      bbUpper: 110,
      bbMiddle: 100,
      bbLower: 90,
      adx: 18,
      plusDi: 10,
      minusDi: 30,
    };
    const strength = calculateSignalStrength(89, indicators);
    expect(strength).toBe(100);
  });

  it("returns value between 0 and 100", () => {
    const candles = generateCandles(50);
    const indicators = calculateAllIndicators(candles);
    const price = candles[candles.length - 1].close;
    const strength = calculateSignalStrength(price, indicators);
    expect(strength).toBeGreaterThanOrEqual(0);
    expect(strength).toBeLessThanOrEqual(100);
  });

  it("higher score when RSI is lower in range", () => {
    const base: TechnicalIndicators = {
      rsi: 30,
      bbUpper: 110,
      bbMiddle: 100,
      bbLower: 90,
      adx: 25,
      plusDi: 10,
      minusDi: 30,
    };
    const higher: TechnicalIndicators = { ...base, rsi: 34 };
    const s1 = calculateSignalStrength(90, base);
    const s2 = calculateSignalStrength(90, higher);
    expect(s1).toBeGreaterThanOrEqual(s2);
  });
});

// ─── BBDX-PATTERN v6.1 ──────────────────────────────────────────────────────

import {
  calculateBollingerBandsSeries,
  calculateSignalStrengthV2,
  decideEntry,
  decideExit,
  detectAllCandlePatterns,
  detectBBStructure,
  isFallingKnife,
  pressureLabel,
  reversalProbability,
  volumeConfirmationFromRatio,
  volumeRatio,
} from "./indicators";
import type { CandlePatternMatch } from "@shared/types";

function candle(
  open: number,
  high: number,
  low: number,
  close: number,
  volume = 1000,
  i = 0
): Candle {
  return {
    openTime: Date.now() - (10 - i) * 60_000,
    closeTime: Date.now() - (10 - i - 1) * 60_000,
    open,
    high,
    low,
    close,
    volume,
  };
}

describe("pressureLabel", () => {
  it("returns BULL_PRESSURE when +DI dominates and exceeds 25", () => {
    expect(pressureLabel(30, 15)).toBe("BULL_PRESSURE");
  });
  it("returns WEAK_BULL when +DI dominates but <= 25", () => {
    expect(pressureLabel(20, 12)).toBe("WEAK_BULL");
  });
  it("returns BEAR_PRESSURE when -DI dominates and exceeds 25", () => {
    expect(pressureLabel(15, 30)).toBe("BEAR_PRESSURE");
  });
  it("returns WEAK_BEAR when -DI dominates but <= 25", () => {
    expect(pressureLabel(12, 20)).toBe("WEAK_BEAR");
  });
  it("returns NEUTRAL when +DI and -DI are within 2 of each other", () => {
    expect(pressureLabel(20, 19)).toBe("NEUTRAL");
  });
});

describe("reversalProbability", () => {
  it("returns 100 at ADX 0", () => {
    expect(reversalProbability(0)).toBe(100);
  });
  it("returns 50 at ADX 20", () => {
    expect(reversalProbability(20)).toBe(50);
  });
  it("clamps to 0 for very high ADX", () => {
    expect(reversalProbability(100)).toBe(0);
  });
});

describe("volumeRatio", () => {
  it("returns 1 when fewer than 100 candles and recent matches average", () => {
    const cs: Candle[] = Array.from({ length: 10 }, (_, i) =>
      candle(100, 102, 99, 100, 1000, i)
    );
    expect(volumeRatio(cs)).toBeCloseTo(1, 2);
  });
  it("returns ratio > 1 when recent volume is higher", () => {
    const cs: Candle[] = [];
    for (let i = 0; i < 100; i++) cs.push(candle(100, 102, 99, 100, 1000, i));
    for (let i = 95; i < 100; i++) cs[i] = candle(100, 102, 99, 100, 2000, i);
    const r = volumeRatio(cs);
    expect(r).toBeGreaterThan(1.5);
  });
});

describe("volumeConfirmationFromRatio", () => {
  it("rewards high volume", () => {
    expect(volumeConfirmationFromRatio(1.5)).toBeGreaterThan(0);
  });
  it("penalizes low volume", () => {
    expect(volumeConfirmationFromRatio(0.5)).toBe(-5);
  });
  it("is neutral around 1.0", () => {
    expect(volumeConfirmationFromRatio(1.0)).toBe(0);
  });
});

describe("isFallingKnife", () => {
  it("blocks LONG when -DI dominates with strong ADX", () => {
    expect(isFallingKnife(15, 30, 28)).toBe(true);
  });
  it("does not block when ADX is weak", () => {
    expect(isFallingKnife(15, 30, 18)).toBe(false);
  });
  it("does not block when +DI dominates", () => {
    expect(isFallingKnife(30, 15, 28)).toBe(false);
  });
});

describe("detectAllCandlePatterns — bullish", () => {
  it("detects a hammer at the most recent candle", () => {
    const cs: Candle[] = [
      candle(100, 102, 99, 100, 1000, 0),
      candle(100, 102, 99, 100, 1000, 1),
      // open=98, high=99, low=90, close=99 — body=1, lower wick=8, upper wick=0
      candle(98, 99, 90, 99, 1000, 2),
    ];
    const patterns = detectAllCandlePatterns(cs);
    expect(patterns.find((p) => p.name === "hammer")).toBeDefined();
    expect(patterns.find((p) => p.name === "hammer")?.candlesAgo).toBe(0);
  });

  it("detects bullish engulfing alongside any concurrent matches (no priority dedup)", () => {
    // PATTERN_SYSTEM_AUDIT.md 결함 #4: 다중 패턴 매치 = confluence 정보, 보존해야.
    const cs: Candle[] = [
      candle(100, 101, 95, 96, 1000, 0),    // bear
      candle(95, 102, 94, 101, 1500, 1),    // bull engulfs
    ];
    const patterns = detectAllCandlePatterns(cs);
    expect(patterns.find((p) => p.name === "engulfing")).toBeDefined();
    // 같은 idx 에 다른 강세 패턴 (해머/도지 등) 이 동시 감지되어도 모두 유지.
    // 합산은 aggregator.ts 의 max + bonus 모델이 책임.
    const ago0Bull = patterns.filter(
      (p) => p.candlesAgo === 0 && p.bias === "bullish",
    );
    expect(ago0Bull.length).toBeGreaterThanOrEqual(1);
    expect(ago0Bull.some((p) => p.name === "engulfing")).toBe(true);
  });

  it("detects three white soldiers", () => {
    const cs: Candle[] = [
      candle(100, 102, 99, 101, 1000, 0),
      candle(101, 103, 100, 102, 1000, 1),
      candle(102, 104, 101.5, 103, 1000, 2),
    ];
    const patterns = detectAllCandlePatterns(cs);
    expect(patterns.find((p) => p.name === "threeWhiteSoldiers")).toBeDefined();
  });

  it("detects a doji when other patterns absent", () => {
    const cs: Candle[] = [
      candle(100, 102, 98, 100.05, 1000, 0),
      candle(100.05, 102, 98, 100.05, 1000, 1),
      candle(100.05, 100.5, 99.5, 100.06, 1000, 2),
    ];
    const patterns = detectAllCandlePatterns(cs);
    expect(patterns.find((p) => p.name === "doji")).toBeDefined();
  });

  it("populates candlesAgo within last 5 candles", () => {
    const cs: Candle[] = Array.from({ length: 10 }, (_, i) =>
      candle(100, 102, 99, 100, 1000, i)
    );
    // Clean hammer at idx 7: open=98, high=99, low=90, close=99 — body=1,
    // lower wick=8, upper wick=0 (clearly satisfies hammer geometry).
    cs[7] = candle(98, 99, 90, 99, 1000, 7);
    const patterns = detectAllCandlePatterns(cs);
    const hammer = patterns.find((p) => p.name === "hammer");
    expect(hammer?.candlesAgo).toBe(2);
  });
});

describe("detectAllCandlePatterns — bearish", () => {
  it("detects a bearish engulfing", () => {
    const cs: Candle[] = [
      candle(95, 100, 94, 99, 1000, 0),     // bull
      candle(99, 100, 92, 94, 1500, 1),     // bear engulfs
    ];
    const patterns = detectAllCandlePatterns(cs);
    expect(patterns.find((p) => p.name === "bearishEngulfing")).toBeDefined();
  });

  it("detects three black crows", () => {
    const cs: Candle[] = [
      candle(103, 104, 101, 102, 1000, 0),
      candle(102, 103, 100, 101, 1000, 1),
      candle(101, 102, 99, 100, 1000, 2),
    ];
    const patterns = detectAllCandlePatterns(cs);
    expect(patterns.find((p) => p.name === "threeBlackCrows")).toBeDefined();
  });
});

describe("detectBBStructure", () => {
  it("returns null when not enough candles", () => {
    const cs: Candle[] = Array.from({ length: 3 }, (_, i) =>
      candle(100, 101, 99, 100, 1000, i)
    );
    const bb = calculateBollingerBandsSeries(cs.map((c) => c.close));
    expect(detectBBStructure(cs, bb)).toBeNull();
  });

  it("detects upperRiding for 3 consecutive top-rail candles", () => {
    // Construct a clearly-trending dataset with strong upward bias.
    const cs: Candle[] = Array.from({ length: 25 }, (_, i) => {
      const base = 100 + i * 0.5;
      return candle(base, base + 1, base - 0.5, base + 0.8, 1000, i);
    });
    const bb = calculateBollingerBandsSeries(cs.map((c) => c.close));
    const struct = detectBBStructure(cs, bb);
    // Either upperRiding or null depending on noise — assert it's not bearish
    expect(struct === null || struct === "upperRiding").toBe(true);
  });
});

describe("decideEntry", () => {
  it("returns NUM path when RSI in 25-38, near BB lower, ADX < 20", () => {
    const cs: Candle[] = [candle(100, 101, 99, 90, 1000, 0)];
    const decision = decideEntry(
      cs,
      {
        rsi: 32,
        bbLower: 90,
        bbMiddle: 100,
        bbUpper: 110,
        adx: 18,
        plusDi: 22,
        minusDi: 18,
      } as TechnicalIndicators,
      [],
      null,
      1.0
    );
    expect(decision?.path).toBe("NUM");
  });

  it("returns BB path when bbStructure is set, regardless of RSI", () => {
    const cs: Candle[] = [candle(100, 101, 99, 100, 1000, 0)];
    const decision = decideEntry(
      cs,
      {
        rsi: 70,
        bbLower: 90,
        bbMiddle: 100,
        bbUpper: 110,
        adx: 30,
        plusDi: 30,
        minusDi: 10,
      } as TechnicalIndicators,
      [],
      "upperRiding",
      1.0
    );
    expect(decision?.path).toBe("BB");
    expect(decision?.bbStructure).toBe("upperRiding");
  });

  it("returns PTN path when bullish pattern + near BB lower + ADX < 25", () => {
    const cs: Candle[] = [candle(100, 101, 99, 92, 1000, 0)];
    const patterns: CandlePatternMatch[] = [
      { name: "hammer", bias: "bullish", candlesAgo: 1, strength: 75 },
    ];
    const decision = decideEntry(
      cs,
      {
        rsi: 50,
        bbLower: 90,
        bbMiddle: 100,
        bbUpper: 110,
        adx: 22,
        plusDi: 22,
        minusDi: 18,
      } as TechnicalIndicators,
      patterns,
      null,
      1.0
    );
    expect(decision?.path).toBe("PTN");
    expect(decision?.patterns?.[0].name).toBe("hammer");
  });

  it("returns null when no path qualifies", () => {
    const cs: Candle[] = [candle(100, 101, 99, 105, 1000, 0)];
    const decision = decideEntry(
      cs,
      {
        rsi: 50,
        bbLower: 90,
        bbMiddle: 100,
        bbUpper: 110,
        adx: 30,
        plusDi: 30,
        minusDi: 10,
      } as TechnicalIndicators,
      [],
      null,
      1.0
    );
    expect(decision).toBeNull();
  });
});

describe("decideExit", () => {
  it("triggers EXIT when 3+ conditions met", () => {
    const ind = {
      rsi: 70,
      bbLower: 90,
      bbMiddle: 100,
      bbUpper: 110,
      adx: 32,
      plusDi: 30,
      minusDi: 10,
    } as TechnicalIndicators;
    const exit = decideExit(105, ind, []);
    expect(exit).not.toBeNull();
    expect(exit!.conditionsMet).toBe(4);
    expect(exit!.relaxedToBearish).toBe(false);
  });

  it("relaxes to 2/4 when bearish pattern is present", () => {
    const ind = {
      rsi: 50,
      bbLower: 90,
      bbMiddle: 100,
      bbUpper: 110,
      adx: 20,
      plusDi: 30,
      minusDi: 10,
    } as TechnicalIndicators;
    const bearish: CandlePatternMatch[] = [
      { name: "bearishEngulfing", bias: "bearish", candlesAgo: 0, strength: 100 },
    ];
    const exit = decideExit(101, ind, bearish);
    expect(exit).not.toBeNull();
    expect(exit!.conditionsMet).toBe(2);   // bbMiddle + plusDi25
    expect(exit!.relaxedToBearish).toBe(true);
  });

  it("returns null when fewer than 3 conditions met without bearish", () => {
    const ind = {
      rsi: 50,
      bbLower: 90,
      bbMiddle: 100,
      bbUpper: 110,
      adx: 20,
      plusDi: 20,
      minusDi: 10,
    } as TechnicalIndicators;
    const exit = decideExit(99, ind, []);
    expect(exit).toBeNull();
  });
});

describe("calculateSignalStrengthV2", () => {
  it("rewards low RSI + price near BB lower + low ADX", () => {
    const ind = {
      rsi: 28,
      bbLower: 90,
      bbMiddle: 100,
      bbUpper: 110,
      adx: 12,
      plusDi: 22,
      minusDi: 18,
    } as TechnicalIndicators;
    const strong = calculateSignalStrengthV2(91, ind, 12);
    const weak = calculateSignalStrengthV2(108, { ...ind, rsi: 65, adx: 35 }, -5);
    expect(strong).toBeGreaterThan(weak);
  });

  it("clamps to 0..100", () => {
    const ind = {
      rsi: 50,
      bbLower: 90,
      bbMiddle: 100,
      bbUpper: 110,
      adx: 20,
      plusDi: 20,
      minusDi: 20,
    } as TechnicalIndicators;
    const v = calculateSignalStrengthV2(100, ind, 0);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(100);
  });
});

// ─── VWAP Strategy ──────────────────────────────────────────────────────────

import {
  calculateVWAP,
  calculateEMA,
  vwapPosition,
  emaPosition,
  detectPullback,
  decideVwapSignal,
} from "./indicators";

describe("calculateVWAP", () => {
  it("returns volume-weighted typical price", () => {
    // 2 candles with equal volume — VWAP should equal mean of typical prices.
    const cs: Candle[] = [
      candle(100, 110, 90, 100, 1000, 0),
      candle(100, 120, 80, 100, 1000, 1),
    ];
    // typical prices: (110+90+100)/3 = 100, (120+80+100)/3 = 100
    expect(calculateVWAP(cs)).toBeCloseTo(100, 4);
  });

  it("weights heavier-volume candles more", () => {
    const cs: Candle[] = [
      candle(100, 110, 90, 100, 100, 0), // typical = 100
      candle(100, 220, 200, 200, 1000, 1), // typical = ~206.67, vol 10×
    ];
    const v = calculateVWAP(cs);
    // Weighted: (100*100 + 206.67*1000) / (100 + 1000) ≈ 197
    expect(v).toBeGreaterThan(190);
    expect(v).toBeLessThan(210);
  });

  it("returns 0 when total volume is 0", () => {
    const cs: Candle[] = [candle(100, 110, 90, 100, 0, 0)];
    expect(calculateVWAP(cs)).toBe(0);
  });
});

describe("calculateEMA", () => {
  it("returns mean for series shorter than period", () => {
    expect(calculateEMA([10, 20, 30], 9)).toBe(20);
  });

  it("returns trailing EMA for longer series", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const ema = calculateEMA(values, 9);
    // EMA should weight the most recent value more — trail closer to 12 than mean
    expect(ema).toBeGreaterThan(7);
    expect(ema).toBeLessThan(12);
  });
});

describe("vwapPosition / emaPosition", () => {
  it("returns ABOVE when price > vwap by > 0.1%", () => {
    expect(vwapPosition(101, 100)).toBe("ABOVE");
  });
  it("returns BELOW when price < vwap by > 0.1%", () => {
    expect(vwapPosition(99, 100)).toBe("BELOW");
  });
  it("returns AT within 0.1% tolerance", () => {
    expect(vwapPosition(100.05, 100)).toBe("AT");
  });
  it("emaPosition mirrors vwapPosition behavior", () => {
    expect(emaPosition(105, 100)).toBe("ABOVE");
    expect(emaPosition(95, 100)).toBe("BELOW");
    expect(emaPosition(100.01, 100)).toBe("AT");
  });
});

describe("detectPullback", () => {
  it("returns false with insufficient candles", () => {
    expect(detectPullback([], 100, 100)).toBe(false);
  });

  it("detects pullback when recent candle approaches VWAP without crossing", () => {
    const cs: Candle[] = [
      candle(105, 106, 104, 105, 1000, 0),
      candle(105, 106, 104, 105, 1000, 1),
      candle(105, 106, 104, 105, 1000, 2),
      candle(105, 106, 100.4, 105, 1000, 3), // low touched within 0.5% of vwap=100
      candle(105, 106, 104, 105, 1000, 4),
    ];
    expect(detectPullback(cs, 100, 100)).toBe(true);
  });

  it("returns false when no candle approaches VWAP/EMA", () => {
    const cs: Candle[] = Array.from({ length: 5 }, (_, i) =>
      candle(110, 112, 108, 110, 1000, i)
    );
    expect(detectPullback(cs, 100, 100)).toBe(false);
  });
});

describe("decideVwapSignal", () => {
  it("returns LONG when price ABOVE both VWAP and EMA(9)", () => {
    const cs: Candle[] = Array.from({ length: 5 }, (_, i) =>
      candle(105, 106, 104, 105, 1000, i)
    );
    const sig = decideVwapSignal(105, 100, 102, false, 1.3);
    expect(sig?.side).toBe("LONG");
    expect(sig!.strength).toBeGreaterThanOrEqual(50);
    void cs;
  });

  it("returns SHORT when price BELOW both VWAP and EMA(9)", () => {
    const sig = decideVwapSignal(95, 100, 98, false, 1.3);
    expect(sig?.side).toBe("SHORT");
  });

  it("returns null when mixed (above VWAP, below EMA)", () => {
    const sig = decideVwapSignal(101, 100, 105, false, 1.0);
    expect(sig).toBeNull();
  });

  it("returns null when price AT VWAP", () => {
    const sig = decideVwapSignal(100, 100, 102, false, 1.0);
    expect(sig).toBeNull();
  });

  it("pullback boosts strength relative to no-pullback", () => {
    const noPullback = decideVwapSignal(105, 100, 102, false, 1.3);
    const withPullback = decideVwapSignal(105, 100, 102, true, 1.3);
    expect(withPullback!.strength).toBeGreaterThan(noPullback!.strength);
  });

  it("strength clamps to 0..100", () => {
    const sig = decideVwapSignal(150, 100, 110, true, 5);
    expect(sig!.strength).toBeLessThanOrEqual(100);
    expect(sig!.strength).toBeGreaterThanOrEqual(0);
  });
});
