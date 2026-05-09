/**
 * Funding Extreme modifier — 단위 테스트 (axios mock).
 *
 * 검증:
 *   1. rate > +0.001 → long_extreme, multiplier 0.85
 *   2. rate > +0.0005 → long_elevated, 0.92
 *   3. rate ≈ 0 → neutral, 1.00
 *   4. rate < -0.0005 → short_elevated, 1.10
 *   5. rate < -0.001 → short_extreme, 1.20
 *   6. spot-only (list 비어 있음) → status="stub"
 *   7. fetch 실패 → status="error", multiplier=1.0 (graceful)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// axios mock — vi.mock 은 hoisted, beforeAll 보다 먼저 평가됨
vi.mock("axios", () => {
  const get = vi.fn();
  return {
    default: { get },
    get,
  };
});

import axios from "axios";
import {
  computeFundingExtreme,
  __clearFundingCache,
} from "../funding-extreme";

const mockedGet = axios.get as ReturnType<typeof vi.fn>;

function mockFundingResponse(rate: string) {
  return {
    data: {
      retCode: 0,
      result: {
        list: [{ fundingRate: rate, fundingRateTimestamp: "1700000000000" }],
      },
    },
  };
}

beforeEach(() => {
  __clearFundingCache();
  mockedGet.mockReset();
});

describe("computeFundingExtreme — 5 regime 분류", () => {
  it("rate > +0.001 → long_extreme, multiplier 0.85", async () => {
    mockedGet.mockResolvedValueOnce(mockFundingResponse("0.0015"));
    const r = await computeFundingExtreme("BTCUSDT");
    expect(r.regime).toBe("long_extreme");
    expect(r.multiplier).toBe(0.85);
    expect(r.status).toBe("real");
    expect(r.dimension).toBe(6);
  });

  it("rate ≈ +0.0007 → long_elevated, multiplier 0.92", async () => {
    mockedGet.mockResolvedValueOnce(mockFundingResponse("0.0007"));
    const r = await computeFundingExtreme("ETHUSDT");
    expect(r.regime).toBe("long_elevated");
    expect(r.multiplier).toBe(0.92);
  });

  it("rate ≈ 0 → neutral, multiplier 1.00", async () => {
    mockedGet.mockResolvedValueOnce(mockFundingResponse("0.00005"));
    const r = await computeFundingExtreme("SOLUSDT");
    expect(r.regime).toBe("neutral");
    expect(r.multiplier).toBe(1.0);
  });

  it("rate < -0.0005 → short_elevated, multiplier 1.10", async () => {
    mockedGet.mockResolvedValueOnce(mockFundingResponse("-0.0008"));
    const r = await computeFundingExtreme("DOGEUSDT");
    expect(r.regime).toBe("short_elevated");
    expect(r.multiplier).toBe(1.10);
  });

  it("rate < -0.001 → short_extreme, multiplier 1.20", async () => {
    mockedGet.mockResolvedValueOnce(mockFundingResponse("-0.0015"));
    const r = await computeFundingExtreme("XRPUSDT");
    expect(r.regime).toBe("short_extreme");
    expect(r.multiplier).toBe(1.20);
  });
});

describe("computeFundingExtreme — graceful fallback", () => {
  it("spot-only (list 비어 있음) → status='stub', multiplier=1.0", async () => {
    mockedGet.mockResolvedValueOnce({
      data: { retCode: 0, result: { list: [] } },
    });
    const r = await computeFundingExtreme("SPOTONLYUSDT");
    expect(r.status).toBe("stub");
    expect(r.multiplier).toBe(1.0);
    expect(r.regime).toBe("neutral");
  });

  it("fetch throw → status='error', multiplier=1.0 (graceful)", async () => {
    mockedGet.mockRejectedValueOnce(new Error("Network down"));
    const r = await computeFundingExtreme("BADCOIN");
    expect(r.status).toBe("error");
    expect(r.multiplier).toBe(1.0);
    expect(r.errorDetail).toContain("Network");
  });

  it("retCode != 0 → status='error', multiplier=1.0", async () => {
    mockedGet.mockResolvedValueOnce({
      data: { retCode: 10001, retMsg: "param error", result: { list: [] } },
    });
    const r = await computeFundingExtreme("WEIRDCOIN");
    expect(r.status).toBe("error");
    expect(r.multiplier).toBe(1.0);
  });
});

describe("computeFundingExtreme — 캐시", () => {
  it("동일 심볼 5분 내 재호출 시 axios 1번만 호출", async () => {
    mockedGet.mockResolvedValueOnce(mockFundingResponse("0.0001"));
    const r1 = await computeFundingExtreme("CACHEDUSDT");
    const r2 = await computeFundingExtreme("CACHEDUSDT");
    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(r1).toEqual(r2);
  });
});
