/**
 * CryptoQuant API 클라이언트 단위 테스트.
 *
 * 검증 항목:
 *   1. API 키 미설정 → status: "stub", data: []
 *   2. axios mock 정상 응답 → status: "ok" + 데이터 파싱
 *   3. axios mock 에러 → status: "error" (graceful, throw X)
 *   4. parseRow — 다양한 응답 shape (date/timestamp, net_flow/value 변형)
 */

import axios from "axios";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  __testing,
  fetchCryptoQuant,
  type CryptoQuantSeries,
} from "../sources/cryptoquant";

// ─── env 백업/복원 ────────────────────────────────────────────────────

const ENV_KEYS = ["CRYPTOQUANT_API_KEY"] as const;
let envBackup: Record<string, string | undefined> = {};

beforeEach(() => {
  envBackup = {};
  for (const k of ENV_KEYS) {
    envBackup[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (envBackup[k] === undefined) delete process.env[k];
    else process.env[k] = envBackup[k];
  }
  vi.restoreAllMocks();
});

// ─── 1. 키 미설정 → stub ─────────────────────────────────────────────

describe("fetchCryptoQuant — key 미설정 분기", () => {
  test("CRYPTOQUANT_API_KEY 없으면 status='stub' + data=[]", async () => {
    const r = await fetchCryptoQuant("btc/exchange-flows/netflow", 30);
    expect(r.status).toBe("stub");
    expect(r.data).toEqual([]);
    expect(r.detail).toContain("CRYPTOQUANT_API_KEY");
  });

  test("키 미설정 시 axios.get 호출되지 않음", async () => {
    const getSpy = vi.spyOn(axios, "get").mockResolvedValue({ data: {} });
    await fetchCryptoQuant("btc/exchange-flows/netflow", 30);
    expect(getSpy).not.toHaveBeenCalled();
  });
});

// ─── 2. axios mock 정상 응답 → ok ────────────────────────────────────

describe("fetchCryptoQuant — mock 정상 응답", () => {
  beforeEach(() => {
    process.env.CRYPTOQUANT_API_KEY = "test-key";
  });

  test("`result.data` shape: date + value → 정상 파싱", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({
      data: {
        result: {
          data: [
            { date: "2026-05-19", value: 1234.5 },
            { date: "2026-05-20", value: 2345.6 },
            { date: "2026-05-21", value: -987.0 },
          ],
        },
      },
    });

    const r = await fetchCryptoQuant("btc/exchange-flows/netflow", 30);
    expect(r.status).toBe("ok");
    expect(r.data).toHaveLength(3);
    expect(r.data[0]).toEqual({ date: "2026-05-19", value: 1234.5 });
    expect(r.data[2].value).toBe(-987);
  });

  test("`result.data` shape: timestamp + net_flow → 정상 파싱 (대안 키)", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({
      data: {
        result: {
          data: [
            { timestamp: "2026-05-19T00:00:00Z", net_flow: 1500 },
            { timestamp: "2026-05-20T00:00:00Z", net_flow: -500 },
          ],
        },
      },
    });

    const r = await fetchCryptoQuant("btc/exchange-flows/netflow", 30);
    expect(r.status).toBe("ok");
    expect(r.data).toHaveLength(2);
    expect(r.data[0]).toEqual({ date: "2026-05-19", value: 1500 });
    expect(r.data[1]).toEqual({ date: "2026-05-20", value: -500 });
  });

  test("miner outflow series → outflow 필드 우선 파싱", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({
      data: {
        result: {
          data: [
            { date: "2026-05-19", outflow: 800 },
            { date: "2026-05-20", outflow: 1200 },
          ],
        },
      },
    });

    const r = await fetchCryptoQuant("btc/miner-flows/outflow", 30);
    expect(r.status).toBe("ok");
    expect(r.data[0].value).toBe(800);
    expect(r.data[1].value).toBe(1200);
  });

  test("axios.get 가 올바른 URL/params 로 호출됨", async () => {
    const getSpy = vi.spyOn(axios, "get").mockResolvedValue({
      data: { result: { data: [] } },
    });
    await fetchCryptoQuant("btc/exchange-flows/netflow", 30);
    expect(getSpy).toHaveBeenCalledTimes(1);
    const callArgs = getSpy.mock.calls[0];
    expect(callArgs[0]).toContain("api.cryptoquant.com");
    expect(callArgs[0]).toContain("btc/exchange-flows/netflow");
    expect(callArgs[1]?.params).toMatchObject({
      api_key: "test-key",
      window: "day",
      limit: 30,
    });
  });

  test("빈 응답 (data: []) → status='ok' + data=[]", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({
      data: { result: { data: [] } },
    });
    const r = await fetchCryptoQuant("btc/exchange-flows/netflow", 30);
    expect(r.status).toBe("ok");
    expect(r.data).toEqual([]);
  });

  test("response.data.data (top-level data) 대안 경로", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({
      data: {
        data: [{ date: "2026-05-21", value: 100 }],
      },
    });
    const r = await fetchCryptoQuant("btc/exchange-flows/netflow", 30);
    expect(r.status).toBe("ok");
    expect(r.data).toHaveLength(1);
  });
});

// ─── 3. axios mock 에러 → graceful error ─────────────────────────────

describe("fetchCryptoQuant — graceful error", () => {
  beforeEach(() => {
    process.env.CRYPTOQUANT_API_KEY = "test-key";
  });

  test("HTTP 401 → status='error', data=[] (throw X)", async () => {
    vi.spyOn(axios, "get").mockRejectedValue(new Error("Request failed 401"));
    const r = await fetchCryptoQuant("btc/exchange-flows/netflow", 30);
    expect(r.status).toBe("error");
    expect(r.data).toEqual([]);
    expect(r.detail).toContain("호출 실패");
  });

  test("네트워크 오류 → status='error' (throw X)", async () => {
    vi.spyOn(axios, "get").mockRejectedValue(new Error("ECONNREFUSED"));
    const r = await fetchCryptoQuant("btc/exchange-flows/netflow", 30);
    expect(r.status).toBe("error");
    expect(r.data).toEqual([]);
    expect(r.detail).toContain("ECONNREFUSED");
  });

  test("timeout → status='error'", async () => {
    vi.spyOn(axios, "get").mockRejectedValue(new Error("timeout of 10000ms exceeded"));
    const r = await fetchCryptoQuant("btc/miner-flows/outflow", 30);
    expect(r.status).toBe("error");
  });
});

// ─── 4. parseRow — shape 다양성 ──────────────────────────────────────

describe("parseRow — 다양한 응답 shape", () => {
  test("date + value → 정상 파싱 (netflow)", () => {
    const row = { date: "2026-05-21", value: 1234 };
    const r = __testing.parseRow(row, "btc/exchange-flows/netflow");
    expect(r).toEqual({ date: "2026-05-21", value: 1234 });
  });

  test("timestamp ISO → date 추출 (first 10 chars)", () => {
    const row = { timestamp: "2026-05-21T00:00:00Z", value: 500 };
    const r = __testing.parseRow(row, "btc/exchange-flows/netflow");
    expect(r?.date).toBe("2026-05-21");
  });

  test("net_flow 필드 (netflow series)", () => {
    const row = { date: "2026-05-21", net_flow: 999 };
    const r = __testing.parseRow(row, "btc/exchange-flows/netflow");
    expect(r?.value).toBe(999);
  });

  test("outflow 필드 (miner series)", () => {
    const row = { date: "2026-05-21", outflow: 777 };
    const r = __testing.parseRow(row, "btc/miner-flows/outflow");
    expect(r?.value).toBe(777);
  });

  test("문자열 value → parseFloat", () => {
    const row = { date: "2026-05-21", value: "1234.5" };
    const r = __testing.parseRow(row, "btc/exchange-flows/netflow");
    expect(r?.value).toBe(1234.5);
  });

  test("invalid date 형식 → null", () => {
    expect(__testing.parseRow({ date: "not-a-date", value: 1 }, "btc/exchange-flows/netflow")).toBeNull();
    expect(__testing.parseRow({ date: "2026/05/21", value: 1 }, "btc/exchange-flows/netflow")).toBeNull();
  });

  test("non-finite value → null", () => {
    expect(
      __testing.parseRow({ date: "2026-05-21", value: "abc" }, "btc/exchange-flows/netflow")
    ).toBeNull();
    expect(
      __testing.parseRow({ date: "2026-05-21", value: null }, "btc/exchange-flows/netflow")
    ).toBeNull();
  });

  test("null/undefined row → null", () => {
    expect(__testing.parseRow(null, "btc/exchange-flows/netflow")).toBeNull();
    expect(__testing.parseRow(undefined, "btc/exchange-flows/netflow")).toBeNull();
    expect(__testing.parseRow("string", "btc/exchange-flows/netflow")).toBeNull();
  });
});
