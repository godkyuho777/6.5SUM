/**
 * coin-info.test.ts — CoinGecko Free 기반 코인 상세 정보 모듈 테스트.
 *
 * 검증 포인트:
 *   - 화이트리스트 코인 (BTC/ETH 등) 정상 응답 (mocked CoinGecko)
 *   - 화이트리스트 외 (UNKNOWNUSDT) → status: "stub"
 *   - 한국어 큐레이션 (description / useCase / category) 포함
 *   - CoinGecko 호출 실패 → status: "error" + graceful (throw 금지)
 *   - 캐시 hit (두 번째 호출은 axios 미호출)
 *   - 429 → rate limit 백오프 후 stale cache 반환
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import axios from "axios";

// axios 자동 mock — 각 테스트에서 mockResolvedValueOnce / mockRejectedValueOnce 로 제어.
vi.mock("axios");
const mockedAxios = vi.mocked(axios, true);

import { getCoinInfo, clearCoinInfoCache } from "./coin-info";

beforeEach(() => {
  clearCoinInfoCache();
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────
// Fixture — CoinGecko `/coins/bitcoin` 응답 샘플 (필요 필드만)
// ─────────────────────────────────────────────────────────────
const BTC_DETAIL_FIXTURE = {
  id: "bitcoin",
  symbol: "btc",
  name: "Bitcoin",
  market_cap_rank: 1,
  links: {
    homepage: ["https://bitcoin.org"],
    whitepaper: "https://bitcoin.org/bitcoin.pdf",
    repos_url: { github: ["https://github.com/bitcoin/bitcoin"] },
    twitter_screen_name: "bitcoin",
    subreddit_url: "https://www.reddit.com/r/Bitcoin/",
  },
  market_data: {
    current_price: { usd: 65000 },
    market_cap: { usd: 1_280_000_000_000 },
    fully_diluted_valuation: { usd: 1_365_000_000_000 },
    total_volume: { usd: 35_000_000_000 },
    circulating_supply: 19_700_000,
    total_supply: 19_700_000,
    max_supply: 21_000_000,
    ath: { usd: 73_750 },
    ath_date: { usd: "2024-03-14T07:10:36.635Z" },
    ath_change_percentage: { usd: -11.87 },
    atl: { usd: 67.81 },
  },
};

describe("getCoinInfo — 화이트리스트 코인 (BTC)", () => {
  it("CoinGecko 응답을 정상 매핑하고 status='real' 을 반환한다", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: BTC_DETAIL_FIXTURE });

    const result = await getCoinInfo("BTCUSDT");

    expect(result.status).toBe("real");
    expect(result.symbol).toBe("BTCUSDT");
    expect(result.baseSymbol).toBe("BTC");
    expect(result.coingeckoId).toBe("bitcoin");
    expect(result.name).toBe("Bitcoin");
    expect(result.rank).toBe(1);
    expect(result.marketCapUsd).toBe(1_280_000_000_000);
    expect(result.maxSupply).toBe(21_000_000);
    expect(result.currentPrice).toBe(65000);
    expect(result.ath).toBe(73_750);
    expect(result.athChangePct).toBeCloseTo(-11.87, 2);
    expect(result.homepage).toBe("https://bitcoin.org");
    expect(result.github).toBe("https://github.com/bitcoin/bitcoin");
    expect(result.twitter).toBe("https://twitter.com/bitcoin");
    expect(result.errorDetail).toBeUndefined();
  });

  it("한국어 큐레이션 (description / useCase / category / consensus) 을 포함한다", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: BTC_DETAIL_FIXTURE });

    const result = await getCoinInfo("BTCUSDT");

    // description 은 한국어로 시작 — CoinGecko 영문 description 이 덮어쓰지 않음
    expect(result.description).toMatch(/비트코인/);
    expect(result.description.length).toBeGreaterThan(40);
    expect(result.useCase).toMatch(/가치 저장/);
    expect(result.category).toContain("Store of Value");
    expect(result.consensus).toBe("Proof of Work");
    expect(result.launchDate).toBe("2009-01-03");
  });
});

describe("getCoinInfo — 화이트리스트 외", () => {
  it("UNKNOWN 코인은 status='stub' 으로 graceful 반환 (CoinGecko 호출 안 함)", async () => {
    const result = await getCoinInfo("FOOBARUSDT");

    expect(result.status).toBe("stub");
    expect(result.symbol).toBe("FOOBARUSDT");
    expect(result.baseSymbol).toBe("FOOBAR");
    expect(result.coingeckoId).toBe("");
    expect(result.description).toMatch(/whitelist 외/);
    expect(result.category).toEqual(["Unknown"]);
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });
});

describe("getCoinInfo — 캐시", () => {
  it("두 번째 호출은 axios 를 다시 호출하지 않는다 (1h 캐시)", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: BTC_DETAIL_FIXTURE });

    const first = await getCoinInfo("BTCUSDT");
    const second = await getCoinInfo("BTCUSDT");

    expect(first.status).toBe("real");
    expect(second.status).toBe("real");
    expect(second.cachedAt).toBe(first.cachedAt); // 같은 캐시 엔트리
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });
});

describe("getCoinInfo — 에러 처리", () => {
  it("CoinGecko 호출 실패 시 status='error' 반환 + throw 안 함", async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error("Network timeout"));

    const result = await getCoinInfo("ETHUSDT");

    expect(result.status).toBe("error");
    expect(result.symbol).toBe("ETHUSDT");
    expect(result.errorDetail).toMatch(/CoinGecko 호출 실패/);
    // 큐레이션은 여전히 살아있음 — UI 가 빈 화면이 되지 않도록
    expect(result.description).toMatch(/이더리움/);
    expect(result.category).toContain("Smart Contract Platform");
  });

  it("429 응답 시 백오프가 활성화되고 다음 호출도 graceful 처리", async () => {
    const rateLimitError: any = new Error("Too many requests");
    rateLimitError.response = { status: 429 };
    mockedAxios.get.mockRejectedValueOnce(rateLimitError);

    // 1) 429 한 번 발생
    const first = await getCoinInfo("SOLUSDT");
    expect(first.status).toBe("error");
    expect(first.errorDetail).toBeDefined();

    // 2) 백오프 중에는 axios 호출 자체를 스킵 (mockedAxios 추가 호출 X)
    const second = await getCoinInfo("ADAUSDT");
    expect(second.status).toBe("error");
    expect(mockedAxios.get).toHaveBeenCalledTimes(1); // 429 한 번만
    expect(second.errorDetail).toMatch(/rate limit/);
  });
});
