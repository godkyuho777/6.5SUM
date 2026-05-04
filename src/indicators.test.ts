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

  it("all values are finite numbers", () => {
    const candles = generateCandles(100);
    const indicators = calculateAllIndicators(candles);
    for (const [key, value] of Object.entries(indicators)) {
      expect(typeof value).toBe("number");
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
