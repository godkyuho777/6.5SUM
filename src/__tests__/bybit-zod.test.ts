/**
 * Bybit Zod schema unit tests (P2-#2, 2026-05-23).
 *
 * Bybit API 응답이 비정상일 때 (NaN, null, missing fields) Zod 가 정확히
 * 차단하는지 회귀 검증. 실제 axios 호출은 mock 으로 대체.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import axios from "axios";
import { fetchKlines, fetch24hTicker, fetchAll24hTickers } from "../bybit";

vi.mock("axios");

describe("Bybit Zod validation — fetchKlines", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("정상 응답 → Candle[] 반환", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({
      data: {
        retCode: 0,
        result: {
          list: [
            ["1700000000000", "78000", "78500", "77500", "78200", "1500", "117e6"],
            ["1699985600000", "77800", "78000", "77000", "78000", "1200", "93e6"],
          ],
        },
      },
    });
    const candles = await fetchKlines("BTCUSDT", "4h", 100);
    expect(candles.length).toBe(2);
    expect(candles[0].open).toBe(77800); // 역순 정렬 (오래된 것 먼저)
    expect(candles[0].close).toBe(78000);
    expect(candles[1].open).toBe(78000);
    expect(Number.isFinite(candles[0].volume)).toBe(true);
  });

  test("NaN / null 필드 → Zod 변환으로 0 처리 (NaN propagate 차단)", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({
      data: {
        retCode: 0,
        result: {
          list: [
            // open 이 null, high 가 빈 문자열 → Zod preprocess 가 0 으로 변환
            ["1700000000000", null, "", "77500", "78200", "1500", "117e6"],
          ],
        },
      },
    });
    const candles = await fetchKlines("BTCUSDT", "4h", 100);
    expect(candles.length).toBe(1);
    expect(candles[0].open).toBe(0); // null → 0
    expect(candles[0].high).toBe(0); // "" → 0
    expect(Number.isFinite(candles[0].low)).toBe(true);
  });

  test("응답이 list 가 아예 없으면 빈 배열", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({
      data: { retCode: 0, result: {} },
    });
    const candles = await fetchKlines("BTCUSDT", "4h", 100);
    expect(candles).toEqual([]);
  });

  test("retCode != 0 (Bybit API 에러) → 빈 배열", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({
      data: { retCode: 10001, retMsg: "Invalid symbol" },
    });
    const candles = await fetchKlines("INVALID", "4h", 100);
    expect(candles).toEqual([]);
  });
});

describe("Bybit Zod validation — fetch24hTicker", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("정상 응답 → 가격 데이터 반환", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({
      data: {
        retCode: 0,
        result: {
          list: [
            {
              symbol: "BTCUSDT",
              lastPrice: "78250.5",
              price24hPcnt: "0.0234",
              turnover24h: "8e8",
            },
          ],
        },
      },
    });
    const ticker = await fetch24hTicker("BTCUSDT");
    expect(ticker).not.toBeNull();
    expect(ticker?.price).toBe(78250.5);
    expect(ticker?.change24h).toBeCloseTo(2.34, 5); // 0.0234 × 100
    expect(ticker?.volume24h).toBe(8e8);
  });

  test("빈 lastPrice → 0 으로 처리 (NaN 안 됨)", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({
      data: {
        retCode: 0,
        result: {
          list: [
            {
              symbol: "BTCUSDT",
              lastPrice: "",
              price24hPcnt: "0",
              turnover24h: "0",
            },
          ],
        },
      },
    });
    const ticker = await fetch24hTicker("BTCUSDT");
    expect(ticker).not.toBeNull();
    expect(ticker?.price).toBe(0);
    expect(Number.isFinite(ticker?.price ?? NaN)).toBe(true);
  });

  test("list 빈 배열 → null", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({
      data: { retCode: 0, result: { list: [] } },
    });
    const ticker = await fetch24hTicker("BTCUSDT");
    expect(ticker).toBeNull();
  });
});

describe("Bybit Zod validation — fetchAll24hTickers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("USDT 쌍만 필터링", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({
      data: {
        retCode: 0,
        result: {
          list: [
            { symbol: "BTCUSDT", lastPrice: "78000", price24hPcnt: "0.02", turnover24h: "1e9" },
            { symbol: "BTCBTC", lastPrice: "1", price24hPcnt: "0", turnover24h: "0" },
            { symbol: "ETHUSDT", lastPrice: "3500", price24hPcnt: "-0.01", turnover24h: "5e8" },
            { symbol: "ETHBTC", lastPrice: "0.05", price24hPcnt: "0.01", turnover24h: "1e6" },
          ],
        },
      },
    });
    const tickers = await fetchAll24hTickers();
    expect(tickers.size).toBe(2);
    expect(tickers.has("BTCUSDT")).toBe(true);
    expect(tickers.has("ETHUSDT")).toBe(true);
    expect(tickers.has("BTCBTC")).toBe(false);
    expect(tickers.get("BTCUSDT")?.price).toBe(78000);
  });
});
