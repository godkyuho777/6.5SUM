import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock bybit module before importing scanner
vi.mock("./bybit", () => {
  return {
    fetchKlines: vi.fn(async (symbol: string, interval: string, limit: number) => {
      const seed = interval === "1h" ? 1 : interval === "4h" ? 2 : interval === "1d" ? 3 : 4;
      const basePrice = symbol === "BTCUSDT" ? 60000 : 3000;
      const candles = [];
      let price = basePrice * (1 + seed * 0.01);
      for (let i = 0; i < limit; i++) {
        const change = Math.sin(i * 0.3 + seed) * 100;
        price = price + change;
        candles.push({
          openTime: Date.now() - (limit - i) * 4 * 60 * 60 * 1000,
          open: price - change / 2,
          high: price + 50,
          low: price - 50,
          close: price,
          volume: 1000 + i * 10,
          closeTime: Date.now() - (limit - i - 1) * 4 * 60 * 60 * 1000,
        });
      }
      return candles;
    }),
    fetch24hTicker: vi.fn(async (symbol: string) => ({
      price: symbol === "BTCUSDT" ? 60000 : 3000,
      change24h: 1.5,
      volume24h: 1000000,
    })),
    fetchAll24hTickers: vi.fn(async () => {
      const map = new Map();
      map.set("BTCUSDT", { price: 60000, change24h: 1.5, volume24h: 1000000 });
      map.set("ETHUSDT", { price: 3000, change24h: 2.0, volume24h: 500000 });
      map.set("SOLUSDT", { price: 100, change24h: 3.0, volume24h: 200000 });
      return map;
    }),
    fetchMultiplePrices: vi.fn(async () => new Map()),
    validateSymbol: vi.fn(async () => true),
  };
});

import { scanCoin, scanCoinsPage, scanAllCoins, getCoinDetail, clearCache } from "./scanner";
import { fetchKlines, fetchAll24hTickers } from "./bybit";

beforeEach(() => {
  clearCache();
  vi.clearAllMocks();
});

describe("scanCoin", () => {
  it("returns a CoinScanResult with all indicator fields", async () => {
    const result = await scanCoin("BTCUSDT", "4h");
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe("BTCUSDT");
    expect(result!.indicators).toHaveProperty("rsi");
    expect(result!.indicators).toHaveProperty("bbUpper");
    expect(result!.indicators).toHaveProperty("bbMiddle");
    expect(result!.indicators).toHaveProperty("bbLower");
    expect(result!.indicators).toHaveProperty("adx");
    expect(result!.indicators).toHaveProperty("plusDi");
    expect(result!.indicators).toHaveProperty("minusDi");
    expect(typeof result!.isEntrySignal).toBe("boolean");
    expect(typeof result!.isExitSignal).toBe("boolean");
    expect(typeof result!.signalStrength).toBe("number");
  });

  it("passes correct interval to fetchKlines", async () => {
    await scanCoin("BTCUSDT", "1h");
    expect(fetchKlines).toHaveBeenCalledWith("BTCUSDT", "1h", 100);

    clearCache();
    await scanCoin("BTCUSDT", "1d");
    expect(fetchKlines).toHaveBeenCalledWith("BTCUSDT", "1d", 100);
  });

  it("uses cache for repeated calls with same symbol+interval", async () => {
    await scanCoin("BTCUSDT", "4h");
    await scanCoin("BTCUSDT", "4h");
    expect(fetchKlines).toHaveBeenCalledTimes(1);
  });

  it("does NOT use cache when interval differs", async () => {
    await scanCoin("BTCUSDT", "4h");
    await scanCoin("BTCUSDT", "1h");
    expect(fetchKlines).toHaveBeenCalledTimes(2);
  });
});

describe("scanCoinsPage", () => {
  it("returns paginated results with correct metadata", async () => {
    const result = await scanCoinsPage(1, 2, "4h", ["BTCUSDT", "ETHUSDT", "SOLUSDT"]);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(2);
    expect(result.total).toBe(3);
    expect(result.totalPages).toBe(2);
    expect(result.coins.length).toBe(2);
  });

  it("returns correct coins for page 2", async () => {
    const result = await scanCoinsPage(2, 2, "4h", ["BTCUSDT", "ETHUSDT", "SOLUSDT"]);
    expect(result.page).toBe(2);
    expect(result.coins.length).toBe(1);
    expect(result.coins[0].symbol).toBe("SOLUSDT");
  });

  it("returns empty for out-of-range page", async () => {
    const result = await scanCoinsPage(5, 2, "4h", ["BTCUSDT", "ETHUSDT"]);
    expect(result.coins.length).toBe(0);
  });

  it("fetches tickers once for all pages", async () => {
    await scanCoinsPage(1, 2, "4h", ["BTCUSDT", "ETHUSDT"]);
    expect(fetchAll24hTickers).toHaveBeenCalledTimes(1);
  });
});

describe("scanAllCoins", () => {
  it("returns results for all provided symbols", async () => {
    const symbols = ["BTCUSDT", "ETHUSDT"];
    const results = await scanAllCoins(symbols, "4h");
    expect(results.length).toBe(2);
    expect(results.map((r) => r.symbol)).toContain("BTCUSDT");
    expect(results.map((r) => r.symbol)).toContain("ETHUSDT");
  });

  it("fetches 24h tickers first then klines for each coin", async () => {
    const symbols = ["BTCUSDT", "ETHUSDT"];
    await scanAllCoins(symbols, "4h");
    expect(fetchAll24hTickers).toHaveBeenCalledTimes(1);
    expect(fetchKlines).toHaveBeenCalledWith("BTCUSDT", "4h", 100);
    expect(fetchKlines).toHaveBeenCalledWith("ETHUSDT", "4h", 100);
  });

  it("uses cached results and skips klines fetch for cached coins", async () => {
    await scanAllCoins(["BTCUSDT"], "4h");
    vi.clearAllMocks();

    const results = await scanAllCoins(["BTCUSDT"], "4h");
    expect(results.length).toBe(1);
    expect(fetchKlines).not.toHaveBeenCalled();
  });
});

describe("getCoinDetail", () => {
  it("returns candles, indicators, rsiSeries, and adxSeries", async () => {
    const detail = await getCoinDetail("BTCUSDT", "4h", 100);
    expect(detail).not.toBeNull();
    expect(detail!.candles.length).toBeGreaterThan(0);
    expect(detail!.indicators).toHaveProperty("rsi");
    expect(Array.isArray(detail!.rsiSeries)).toBe(true);
    expect(Array.isArray(detail!.adxSeries)).toBe(true);
  });

  it("passes correct interval to fetchKlines", async () => {
    await getCoinDetail("BTCUSDT", "6h", 100);
    expect(fetchKlines).toHaveBeenCalledWith("BTCUSDT", "6h", 100);
  });

  it("cache is separated by symbol+interval", async () => {
    await getCoinDetail("BTCUSDT", "4h", 100);
    await getCoinDetail("BTCUSDT", "1h", 100);
    expect(fetchKlines).toHaveBeenCalledTimes(2);

    await getCoinDetail("BTCUSDT", "4h", 100);
    expect(fetchKlines).toHaveBeenCalledTimes(2); // still 2 - cached
  });
});

describe("interval support for all timeframes", () => {
  const intervals = ["1h", "4h", "6h", "1d", "1w", "1M"] as const;

  for (const tf of intervals) {
    it(`scanCoin works with ${tf} interval`, async () => {
      clearCache();
      const result = await scanCoin("BTCUSDT", tf);
      expect(result).not.toBeNull();
      expect(result!.symbol).toBe("BTCUSDT");
      expect(Number.isFinite(result!.indicators.rsi)).toBe(true);
      expect(Number.isFinite(result!.indicators.adx)).toBe(true);
    });
  }
});
