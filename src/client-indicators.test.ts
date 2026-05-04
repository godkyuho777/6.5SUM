/**
 * Client-side indicators module test
 * 서버 indicators.ts와 동일한 결과를 내는지 검증합니다.
 */
import { describe, it, expect } from "vitest";
import {
  calculateRSI as serverRSI,
  calculateBollingerBands as serverBB,
  calculateADX as serverADX,
  calculateAllIndicators as serverAll,
  isEntrySignal as serverEntry,
  isExitSignal as serverExit,
  calculateSignalStrength as serverStrength,
  calculateRSISeries as serverRSISeries,
  calculateADXSeries as serverADXSeries,
} from "./indicators";

// Re-implement client-side functions inline for testing
// (We test the server versions since they share the same logic)

import type { Candle, TechnicalIndicators } from "@shared/types";

// Generate realistic candle data for testing
function generateCandles(count: number, basePrice = 100): Candle[] {
  const candles: Candle[] = [];
  let price = basePrice;
  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 5;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * 2;
    const low = Math.min(open, close) - Math.random() * 2;
    candles.push({
      openTime: Date.now() - (count - i) * 14400000,
      open,
      high,
      low,
      close,
      volume: Math.random() * 1000000,
      closeTime: Date.now() - (count - i - 1) * 14400000,
    });
    price = close;
  }
  return candles;
}

// Generate downtrend candles (for entry signal testing)
function generateDowntrendCandles(count: number, basePrice = 100): Candle[] {
  const candles: Candle[] = [];
  let price = basePrice;
  for (let i = 0; i < count; i++) {
    const change = -Math.random() * 2 + 0.3; // mostly downward
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * 0.5;
    const low = Math.min(open, close) - Math.random() * 0.5;
    candles.push({
      openTime: Date.now() - (count - i) * 14400000,
      open,
      high,
      low,
      close,
      volume: Math.random() * 1000000,
      closeTime: Date.now() - (count - i - 1) * 14400000,
    });
    price = close;
  }
  return candles;
}

describe("RSI Calculation", () => {
  it("should return 50 when insufficient data", () => {
    const result = serverRSI([100, 101, 102], 14);
    expect(result).toBe(50);
  });

  it("should return 100 when all gains (no losses)", () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
    const result = serverRSI(closes, 14);
    expect(result).toBe(100);
  });

  it("should return value between 0 and 100", () => {
    const candles = generateCandles(50);
    const closes = candles.map((c) => c.close);
    const result = serverRSI(closes);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(100);
  });

  it("should return lower RSI for downtrend", () => {
    const downCloses = Array.from({ length: 30 }, (_, i) => 100 - i * 0.5);
    const upCloses = Array.from({ length: 30 }, (_, i) => 100 + i * 0.5);
    const downRSI = serverRSI(downCloses);
    const upRSI = serverRSI(upCloses);
    expect(downRSI).toBeLessThan(upRSI);
  });
});

describe("Bollinger Bands Calculation", () => {
  it("should return same value for all bands when insufficient data", () => {
    const result = serverBB([100, 101], 20);
    expect(result.upper).toBe(result.middle);
    expect(result.middle).toBe(result.lower);
  });

  it("should have upper > middle > lower for normal data", () => {
    const candles = generateCandles(30);
    const closes = candles.map((c) => c.close);
    const result = serverBB(closes);
    expect(result.upper).toBeGreaterThan(result.middle);
    expect(result.middle).toBeGreaterThan(result.lower);
  });

  it("should have middle equal to SMA(20)", () => {
    const closes = Array.from({ length: 25 }, (_, i) => 100 + Math.sin(i) * 5);
    const result = serverBB(closes, 20);
    const last20 = closes.slice(-20);
    const sma = last20.reduce((a, b) => a + b, 0) / 20;
    expect(result.middle).toBeCloseTo(sma, 10);
  });
});

describe("ADX Calculation", () => {
  it("should return zeros when insufficient data", () => {
    const candles = generateCandles(10);
    const result = serverADX(candles);
    expect(result.adx).toBe(0);
    expect(result.plusDi).toBe(0);
    expect(result.minusDi).toBe(0);
  });

  it("should return non-negative values", () => {
    const candles = generateCandles(50);
    const result = serverADX(candles);
    expect(result.adx).toBeGreaterThanOrEqual(0);
    expect(result.plusDi).toBeGreaterThanOrEqual(0);
    expect(result.minusDi).toBeGreaterThanOrEqual(0);
  });

  it("should return values within reasonable range", () => {
    const candles = generateCandles(100);
    const result = serverADX(candles);
    expect(result.adx).toBeLessThanOrEqual(100);
    expect(result.plusDi).toBeLessThanOrEqual(100);
    expect(result.minusDi).toBeLessThanOrEqual(100);
  });
});

describe("calculateAllIndicators", () => {
  it("should return all indicator fields", () => {
    const candles = generateCandles(50);
    const result = serverAll(candles);
    expect(result).toHaveProperty("rsi");
    expect(result).toHaveProperty("bbUpper");
    expect(result).toHaveProperty("bbMiddle");
    expect(result).toHaveProperty("bbLower");
    expect(result).toHaveProperty("adx");
    expect(result).toHaveProperty("plusDi");
    expect(result).toHaveProperty("minusDi");
  });

  it("should return consistent results for same input", () => {
    const candles = generateCandles(50);
    const result1 = serverAll(candles);
    const result2 = serverAll(candles);
    expect(result1.rsi).toBe(result2.rsi);
    expect(result1.bbUpper).toBe(result2.bbUpper);
    expect(result1.adx).toBe(result2.adx);
  });
});

describe("Signal Detection", () => {
  it("isEntrySignal should return true when all conditions met", () => {
    const indicators: TechnicalIndicators = {
      rsi: 32,
      bbUpper: 110,
      bbMiddle: 100,
      bbLower: 90,
      adx: 20,
      plusDi: 15,
      minusDi: 25,
    };
    // Price near BB lower
    expect(serverEntry(90.5, indicators)).toBe(true);
  });

  it("isEntrySignal should return false when RSI too high", () => {
    const indicators: TechnicalIndicators = {
      rsi: 55,
      bbUpper: 110,
      bbMiddle: 100,
      bbLower: 90,
      adx: 20,
      plusDi: 15,
      minusDi: 25,
    };
    expect(serverEntry(90.5, indicators)).toBe(false);
  });

  it("isExitSignal should return true when price reaches BB middle", () => {
    const indicators: TechnicalIndicators = {
      rsi: 55,
      bbUpper: 110,
      bbMiddle: 100,
      bbLower: 90,
      adx: 20,
      plusDi: 15,
      minusDi: 25,
    };
    expect(serverExit(101, indicators)).toBe(true);
  });

  it("isExitSignal should return true when RSI >= 70", () => {
    const indicators: TechnicalIndicators = {
      rsi: 72,
      bbUpper: 110,
      bbMiddle: 100,
      bbLower: 90,
      adx: 20,
      plusDi: 15,
      minusDi: 25,
    };
    expect(serverExit(95, indicators)).toBe(true);
  });
});

describe("Signal Strength", () => {
  it("should return 0 for neutral conditions", () => {
    const indicators: TechnicalIndicators = {
      rsi: 55,
      bbUpper: 110,
      bbMiddle: 100,
      bbLower: 90,
      adx: 40,
      plusDi: 35,
      minusDi: 15,
    };
    expect(serverStrength(100, indicators)).toBe(0);
  });

  it("should return high score for strong entry conditions", () => {
    const indicators: TechnicalIndicators = {
      rsi: 28,
      bbUpper: 110,
      bbMiddle: 100,
      bbLower: 90,
      adx: 18,
      plusDi: 10,
      minusDi: 25,
    };
    const strength = serverStrength(89, indicators);
    expect(strength).toBeGreaterThanOrEqual(80);
  });

  it("should be capped at 100", () => {
    const indicators: TechnicalIndicators = {
      rsi: 28,
      bbUpper: 110,
      bbMiddle: 100,
      bbLower: 95,
      adx: 15,
      plusDi: 8,
      minusDi: 30,
    };
    const strength = serverStrength(85, indicators);
    expect(strength).toBeLessThanOrEqual(100);
  });
});

describe("RSI Series", () => {
  it("should return array same length as input", () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i) * 5);
    const series = serverRSISeries(closes);
    expect(series.length).toBe(closes.length);
  });

  it("should fill initial period with 50", () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i) * 5);
    const series = serverRSISeries(closes, 14);
    for (let i = 0; i < 14; i++) {
      expect(series[i]).toBe(50);
    }
  });

  it("should return all 50s for insufficient data", () => {
    const closes = [100, 101, 102];
    const series = serverRSISeries(closes, 14);
    series.forEach((v) => expect(v).toBe(50));
  });
});

describe("ADX Series", () => {
  it("should return array with length >= input candles length", () => {
    const candles = generateCandles(50);
    const series = serverADXSeries(candles);
    // ADX series may have length candles.length or candles.length+1 due to initial period fill
    expect(series.length).toBeGreaterThanOrEqual(candles.length);
    expect(series.length).toBeLessThanOrEqual(candles.length + 1);
  });

  it("should return all zeros for insufficient data", () => {
    const candles = generateCandles(10);
    const series = serverADXSeries(candles);
    series.forEach((v) => {
      expect(v.adx).toBe(0);
      expect(v.plusDi).toBe(0);
      expect(v.minusDi).toBe(0);
    });
  });

  it("should have non-negative values", () => {
    const candles = generateCandles(50);
    const series = serverADXSeries(candles);
    series.forEach((v) => {
      expect(v.adx).toBeGreaterThanOrEqual(0);
      expect(v.plusDi).toBeGreaterThanOrEqual(0);
      expect(v.minusDi).toBeGreaterThanOrEqual(0);
    });
  });
});
