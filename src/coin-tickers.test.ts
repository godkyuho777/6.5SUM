/**
 * coin-tickers.test.ts — CoinGecko Free 기반 거래소 상장 정보 모듈 테스트.
 *
 * 검증 포인트:
 *   - Symbol normalization (BTCUSDT → BTC, btcusdc → BTC, ETHKRW → ETH)
 *   - 화이트리스트 외 심볼 (XYZUSDT) → ok:false / code:"NOT_FOUND"
 *   - axios mock 정상 응답 → ticker 파싱
 *   - trust_score 정렬 (green > yellow > red > unknown), 동률 시 volume DESC
 *   - limit 적용 (slice 후 totalCount 는 limit 이전 전체)
 *   - 캐시 hit (두 번째 호출은 axios 미호출, cached:true)
 *   - RATE_LIMITED 처리 (axios 429)
 *   - INTERNAL 처리 (네트워크 / 타임아웃)
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import axios from "axios";

vi.mock("axios");
const mockedAxios = vi.mocked(axios, true);

import {
  fetchCoinTickers,
  clearCoinTickersCache,
  normalizeBaseSymbol,
} from "./coin-tickers";

beforeEach(() => {
  clearCoinTickersCache();
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────
// Fixture — CoinGecko /coins/bitcoin/tickers 응답 샘플
// 신뢰도/볼륨 다양하게 섞어서 정렬 검증.
// ─────────────────────────────────────────────────────────────
const BTC_TICKERS_FIXTURE = {
  tickers: [
    // red, 높은 볼륨 — 정렬 후 하위
    {
      base: "BTC",
      target: "USDT",
      market: { name: "RedExchange", identifier: "red_ex" },
      last: 78000,
      converted_last: { usd: 78000 },
      converted_volume: { usd: 5_000_000_000 },
      trust_score: "red",
      bid_ask_spread_percentage: 0.5,
      last_traded_at: "2026-05-21T10:00:00Z",
      is_stale: false,
      trade_url: "https://red.example/trade",
    },
    // green, 중간 볼륨 — 정렬 후 1순위 (green + 더 높은 vol)
    {
      base: "BTC",
      target: "USDT",
      market: { name: "Binance", identifier: "binance" },
      last: 78100,
      converted_last: { usd: 78100 },
      converted_volume: { usd: 2_000_000_000 },
      trust_score: "green",
      bid_ask_spread_percentage: 0.01,
      last_traded_at: "2026-05-21T10:00:00Z",
      is_stale: false,
      trade_url: "https://binance.com/trade/BTC_USDT",
    },
    // green, 높은 볼륨 — 정렬 후 진짜 1순위
    {
      base: "BTC",
      target: "USD",
      market: { name: "Coinbase Exchange", identifier: "gdax" },
      last: 78050,
      converted_last: { usd: 78050 },
      converted_volume: { usd: 3_500_000_000 },
      trust_score: "green",
      bid_ask_spread_percentage: 0.02,
      last_traded_at: "2026-05-21T10:00:00Z",
      is_stale: false,
      trade_url: "https://exchange.coinbase.com/trade/BTC-USD",
    },
    // yellow — green 다음
    {
      base: "BTC",
      target: "USDT",
      market: { name: "Bybit", identifier: "bybit_spot" },
      last: 78090,
      converted_last: { usd: 78090 },
      converted_volume: { usd: 1_000_000_000 },
      trust_score: "yellow",
      bid_ask_spread_percentage: 0.05,
      last_traded_at: "2026-05-21T10:00:00Z",
      is_stale: false,
      trade_url: "https://www.bybit.com/trade/spot/BTC/USDT",
    },
    // unknown — 가장 하위
    {
      base: "BTC",
      target: "BUSD",
      market: { name: "UnknownEx", identifier: "unknown_ex" },
      last: 78030,
      converted_last: { usd: 78030 },
      converted_volume: { usd: 50_000_000 },
      trust_score: null,
      bid_ask_spread_percentage: null,
      last_traded_at: "2026-05-21T09:00:00Z",
      is_stale: true,
      trade_url: null,
    },
  ],
};

// ─────────────────────────────────────────────────────────────
// 1. Symbol normalization
// ─────────────────────────────────────────────────────────────
describe("normalizeBaseSymbol", () => {
  it("USDT / USDC / KRW / USD 접미사를 제거하고 대문자로 정규화한다", () => {
    expect(normalizeBaseSymbol("BTCUSDT")).toBe("BTC");
    expect(normalizeBaseSymbol("btcusdc")).toBe("BTC");
    expect(normalizeBaseSymbol("ETHKRW")).toBe("ETH");
    expect(normalizeBaseSymbol("solusd")).toBe("SOL");
  });

  it("접미사가 없는 심볼은 그대로 대문자화한다", () => {
    expect(normalizeBaseSymbol("btc")).toBe("BTC");
    expect(normalizeBaseSymbol("ETH")).toBe("ETH");
  });
});

// ─────────────────────────────────────────────────────────────
// 2. 화이트리스트 외 심볼
// ─────────────────────────────────────────────────────────────
describe("fetchCoinTickers — 화이트리스트 외", () => {
  it("XYZUSDT 같은 미등록 심볼은 ok:false + NOT_FOUND 를 반환한다", async () => {
    const result = await fetchCoinTickers({ symbol: "XYZUSDT", limit: 10 });
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.code).toBe("NOT_FOUND");
      expect(result.message).toContain("XYZ");
    }
    // axios 호출 안 함 (whitelist 차단)
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
// 3. 정상 응답 + 매핑
// ─────────────────────────────────────────────────────────────
describe("fetchCoinTickers — 정상 응답 (BTC)", () => {
  it("CoinGecko 응답을 매핑하고 ok:true + tickers 배열을 반환한다", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: BTC_TICKERS_FIXTURE });

    const result = await fetchCoinTickers({ symbol: "BTCUSDT", limit: 10 });
    expect(result.ok).toBe(true);
    if (result.ok !== true) return;

    expect(result.symbol).toBe("BTC");
    expect(result.coinGeckoId).toBe("bitcoin");
    expect(result.tickers).toHaveLength(5);
    expect(result.totalCount).toBe(5);
    expect(result.cached).toBe(false);
    expect(result.computedAt).toBeTruthy();
  });

  it("ticker 필드를 모두 매핑한다 (price, volume, spread, tradeUrl, isStale)", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: BTC_TICKERS_FIXTURE });

    const result = await fetchCoinTickers({ symbol: "BTCUSDT", limit: 10 });
    if (result.ok !== true) throw new Error("expected ok:true");

    // 첫번째는 정렬 후 Coinbase (green + 최고 volume)
    const top = result.tickers[0];
    expect(top.exchange.name).toBe("Coinbase Exchange");
    expect(top.exchange.identifier).toBe("gdax");
    expect(top.exchange.trustScore).toBe("green");
    expect(top.base).toBe("BTC");
    expect(top.target).toBe("USD");
    expect(top.price).toBe(78050);
    expect(top.volume24hUsd).toBe(3_500_000_000);
    expect(top.bidAskSpreadPct).toBe(0.02);
    expect(top.tradeUrl).toBe("https://exchange.coinbase.com/trade/BTC-USD");
    expect(top.isStale).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// 4. 정렬 — trust_score (green > yellow > red > unknown), 동률 시 volume DESC
// ─────────────────────────────────────────────────────────────
describe("fetchCoinTickers — 정렬", () => {
  it("trust_score 순서대로 정렬한다 (green > yellow > red > unknown)", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: BTC_TICKERS_FIXTURE });

    const result = await fetchCoinTickers({ symbol: "BTCUSDT", limit: 10 });
    if (result.ok !== true) throw new Error("expected ok:true");

    const scores = result.tickers.map((t) => t.exchange.trustScore);
    expect(scores).toEqual(["green", "green", "yellow", "red", "unknown"]);
  });

  it("동일 trust_score 안에서는 volume DESC", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: BTC_TICKERS_FIXTURE });

    const result = await fetchCoinTickers({ symbol: "BTCUSDT", limit: 10 });
    if (result.ok !== true) throw new Error("expected ok:true");

    // 두 green: Coinbase (3.5B) > Binance (2B)
    expect(result.tickers[0].exchange.name).toBe("Coinbase Exchange");
    expect(result.tickers[1].exchange.name).toBe("Binance");
  });
});

// ─────────────────────────────────────────────────────────────
// 5. limit
// ─────────────────────────────────────────────────────────────
describe("fetchCoinTickers — limit", () => {
  it("limit 적용 후에도 totalCount 는 전체 ticker 개수", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: BTC_TICKERS_FIXTURE });

    const result = await fetchCoinTickers({ symbol: "BTCUSDT", limit: 2 });
    if (result.ok !== true) throw new Error("expected ok:true");

    expect(result.tickers).toHaveLength(2);
    expect(result.totalCount).toBe(5);
    // 상위 2개는 둘 다 green
    expect(result.tickers.map((t) => t.exchange.trustScore)).toEqual([
      "green",
      "green",
    ]);
  });
});

// ─────────────────────────────────────────────────────────────
// 6. 캐시
// ─────────────────────────────────────────────────────────────
describe("fetchCoinTickers — 캐시", () => {
  it("두 번째 호출은 axios 미호출 + cached:true", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: BTC_TICKERS_FIXTURE });

    const first = await fetchCoinTickers({ symbol: "BTCUSDT", limit: 10 });
    expect(first.ok).toBe(true);
    if (first.ok === true) expect(first.cached).toBe(false);

    const second = await fetchCoinTickers({ symbol: "BTCUSDT", limit: 10 });
    expect(second.ok).toBe(true);
    if (second.ok === true) {
      expect(second.cached).toBe(true);
      expect(second.tickers).toHaveLength(5);
    }
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });

  it("limit 이 다르면 별개 캐시 키", async () => {
    mockedAxios.get
      .mockResolvedValueOnce({ data: BTC_TICKERS_FIXTURE })
      .mockResolvedValueOnce({ data: BTC_TICKERS_FIXTURE });

    await fetchCoinTickers({ symbol: "BTCUSDT", limit: 10 });
    await fetchCoinTickers({ symbol: "BTCUSDT", limit: 5 });

    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────
// 7. RATE_LIMITED (429)
// ─────────────────────────────────────────────────────────────
describe("fetchCoinTickers — RATE_LIMITED", () => {
  it("axios 가 429 응답 시 ok:false + code:RATE_LIMITED 반환 (throw 금지)", async () => {
    mockedAxios.get.mockRejectedValueOnce({
      response: { status: 429 },
      message: "Request failed with status code 429",
    });

    const result = await fetchCoinTickers({ symbol: "BTCUSDT", limit: 10 });
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.code).toBe("RATE_LIMITED");
      expect(result.message).toContain("rate limit");
    }
  });
});

// ─────────────────────────────────────────────────────────────
// 8. INTERNAL (네트워크 오류 / 기타)
// ─────────────────────────────────────────────────────────────
describe("fetchCoinTickers — INTERNAL", () => {
  it("axios 네트워크 실패 시 ok:false + code:INTERNAL (throw 금지)", async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error("ECONNRESET"));

    const result = await fetchCoinTickers({ symbol: "BTCUSDT", limit: 10 });
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.code).toBe("INTERNAL");
      expect(result.message).toContain("ECONNRESET");
    }
  });

  it("응답이 비어있어도 정상 처리 (tickers: [], totalCount: 0)", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { tickers: [] } });

    const result = await fetchCoinTickers({ symbol: "BTCUSDT", limit: 10 });
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.tickers).toHaveLength(0);
      expect(result.totalCount).toBe(0);
    }
  });
});
