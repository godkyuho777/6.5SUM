/**
 * Glassnode API 클라이언트 단위 테스트.
 *
 * 검증 항목:
 *   1. API 키 미설정 → status: "stub", data: []
 *   2. axios mock 정상 응답 → status: "ok" + 데이터 파싱
 *   3. axios mock 에러 → status: "error" (graceful, throw X)
 *   4. parseRow — 표준 { t, v } shape
 */

import axios from "axios";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { __testing, fetchGlassnode } from "../sources/glassnode";

// ─── env 백업/복원 ────────────────────────────────────────────────────

const ENV_KEYS = ["GLASSNODE_API_KEY"] as const;
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

describe("fetchGlassnode — key 미설정 분기", () => {
  test("GLASSNODE_API_KEY 없으면 status='stub' + data=[]", async () => {
    const r = await fetchGlassnode("supply/lth_sum", "BTC", 30);
    expect(r.status).toBe("stub");
    expect(r.data).toEqual([]);
    expect(r.detail).toContain("GLASSNODE_API_KEY");
  });

  test("키 미설정 시 axios.get 호출되지 않음", async () => {
    const getSpy = vi.spyOn(axios, "get").mockResolvedValue({ data: [] });
    await fetchGlassnode("supply/lth_sum", "BTC", 30);
    expect(getSpy).not.toHaveBeenCalled();
  });
});

// ─── 2. axios mock 정상 응답 → ok ────────────────────────────────────

describe("fetchGlassnode — mock 정상 응답", () => {
  beforeEach(() => {
    process.env.GLASSNODE_API_KEY = "test-key";
  });

  test("표준 [{t, v}] shape → 정상 파싱", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({
      data: [
        { t: 1_716_163_200, v: 14_500_000 },
        { t: 1_716_249_600, v: 14_550_000 },
        { t: 1_716_336_000, v: 14_600_000 },
      ],
    });

    const r = await fetchGlassnode("supply/lth_sum", "BTC", 30);
    expect(r.status).toBe("ok");
    expect(r.data).toHaveLength(3);
    expect(r.data[0]).toEqual({ t: 1_716_163_200, v: 14_500_000 });
    expect(r.data[2].v).toBe(14_600_000);
  });

  test("axios.get 가 올바른 URL/params 로 호출됨 (BTC)", async () => {
    const getSpy = vi.spyOn(axios, "get").mockResolvedValue({ data: [] });
    await fetchGlassnode("supply/lth_sum", "BTC", 30);
    expect(getSpy).toHaveBeenCalledTimes(1);
    const callArgs = getSpy.mock.calls[0];
    expect(callArgs[0]).toContain("api.glassnode.com");
    expect(callArgs[0]).toContain("supply/lth_sum");
    expect(callArgs[1]?.params).toMatchObject({
      api_key: "test-key",
      a: "BTC",
      i: "24h",
    });
    // s (since) 는 동적, 그냥 존재만 확인.
    expect(callArgs[1]?.params?.s).toBeGreaterThan(0);
  });

  test("ETH 자산으로 호출", async () => {
    const getSpy = vi.spyOn(axios, "get").mockResolvedValue({ data: [] });
    await fetchGlassnode("supply/lth_sum", "ETH", 30);
    expect(getSpy.mock.calls[0][1]?.params).toMatchObject({ a: "ETH" });
  });

  test("빈 array → status='ok' + data=[]", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({ data: [] });
    const r = await fetchGlassnode("supply/lth_sum", "BTC", 30);
    expect(r.status).toBe("ok");
    expect(r.data).toEqual([]);
  });

  test("Non-array 응답 → status='ok' + data=[] (graceful)", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({ data: { unexpected: true } });
    const r = await fetchGlassnode("supply/lth_sum", "BTC", 30);
    expect(r.status).toBe("ok");
    expect(r.data).toEqual([]);
  });

  test("문자열 t/v 값 → parseInt/parseFloat 변환", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({
      data: [
        { t: "1716163200", v: "14500000.5" },
      ],
    });
    const r = await fetchGlassnode("supply/lth_sum", "BTC", 30);
    expect(r.status).toBe("ok");
    expect(r.data[0].t).toBe(1_716_163_200);
    expect(r.data[0].v).toBe(14_500_000.5);
  });

  test("invalid row mixed with valid → invalid skip, valid 유지", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({
      data: [
        { t: 1_716_163_200, v: 100 },
        null,                                  // null skip
        { t: "abc", v: 200 },                  // invalid t skip
        { t: 1_716_336_000, v: "n/a" },        // invalid v skip
        { t: 1_716_422_400, v: 300 },          // valid
      ],
    });
    const r = await fetchGlassnode("supply/lth_sum", "BTC", 30);
    expect(r.status).toBe("ok");
    expect(r.data).toHaveLength(2);
    expect(r.data[0].v).toBe(100);
    expect(r.data[1].v).toBe(300);
  });
});

// ─── 3. axios mock 에러 → graceful error ─────────────────────────────

describe("fetchGlassnode — graceful error", () => {
  beforeEach(() => {
    process.env.GLASSNODE_API_KEY = "test-key";
  });

  test("HTTP 401 → status='error' + data=[] (throw X)", async () => {
    vi.spyOn(axios, "get").mockRejectedValue(new Error("Request failed 401"));
    const r = await fetchGlassnode("supply/lth_sum", "BTC", 30);
    expect(r.status).toBe("error");
    expect(r.data).toEqual([]);
    expect(r.detail).toContain("호출 실패");
  });

  test("네트워크 오류 → status='error'", async () => {
    vi.spyOn(axios, "get").mockRejectedValue(new Error("ETIMEDOUT"));
    const r = await fetchGlassnode("supply/lth_sum", "ETH", 30);
    expect(r.status).toBe("error");
    expect(r.detail).toContain("ETIMEDOUT");
  });
});

// ─── 4. parseRow — { t, v } shape ────────────────────────────────────

describe("parseRow — Glassnode { t, v } shape", () => {
  test("number t + number v → 정상", () => {
    const r = __testing.parseRow({ t: 1_716_163_200, v: 1234.5 });
    expect(r).toEqual({ t: 1_716_163_200, v: 1234.5 });
  });

  test("문자열 t/v → 변환", () => {
    const r = __testing.parseRow({ t: "1716163200", v: "100" });
    expect(r).toEqual({ t: 1_716_163_200, v: 100 });
  });

  test("invalid t → null", () => {
    expect(__testing.parseRow({ t: "abc", v: 100 })).toBeNull();
    expect(__testing.parseRow({ v: 100 })).toBeNull();
  });

  test("invalid v → null", () => {
    expect(__testing.parseRow({ t: 1_716_163_200, v: "abc" })).toBeNull();
    expect(__testing.parseRow({ t: 1_716_163_200 })).toBeNull();
  });

  test("null/string row → null", () => {
    expect(__testing.parseRow(null)).toBeNull();
    expect(__testing.parseRow(undefined)).toBeNull();
    expect(__testing.parseRow("string")).toBeNull();
  });
});
