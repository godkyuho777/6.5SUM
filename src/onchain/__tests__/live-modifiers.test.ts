/**
 * Live modifier 단위 테스트 — Phase 2 wiring 검증.
 *
 * 검증 항목:
 *   1. computeExchangeNetflow (CryptoQuant)
 *      - 키 미설정 → stub
 *      - axios mock 정상 → ok + z-score 계산 정확
 *      - axios mock 에러 → error (graceful)
 *      - 데이터 < 7행 → error
 *      - 비-BTC symbol → stub
 *   2. computeMinerOutflow (CryptoQuant)
 *      - 비-BTC symbol → stub
 *      - 7d 합산 + z-score 매핑 검증
 *   3. computeLthSupply (Glassnode)
 *      - 비-BTC/ETH symbol → stub
 *      - 30d 변화율 계산 + 임계값 매핑 검증
 *   4. 임계값 helper 단위 테스트 (applyNetflowZscoreThreshold, etc.)
 */

import axios from "axios";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  __testing,
  computeExchangeNetflow,
  computeLthSupply,
  computeMinerOutflow,
} from "../stub-modifiers";

const {
  applyNetflowZscoreThreshold,
  applyMinerOutflowZscoreThreshold,
  applyLthSupplyChangeThreshold,
} = __testing;

// ─── env 백업/복원 ────────────────────────────────────────────────────

const ENV_KEYS = [
  "CRYPTOQUANT_API_KEY",
  "GLASSNODE_API_KEY",
  "ONCHAIN_MOCK",
] as const;
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

// ─── 1. applyNetflowZscoreThreshold ──────────────────────────────────

describe("applyNetflowZscoreThreshold — z-score → modifier", () => {
  test("z >= +2 → -0.25 (강한 유입)", () => {
    expect(applyNetflowZscoreThreshold(2)).toBe(-0.25);
    expect(applyNetflowZscoreThreshold(3)).toBe(-0.25);
    expect(applyNetflowZscoreThreshold(10)).toBe(-0.25);
  });

  test("z <= -2 → +0.20 (강한 유출)", () => {
    expect(applyNetflowZscoreThreshold(-2)).toBe(0.2);
    expect(applyNetflowZscoreThreshold(-3)).toBe(0.2);
  });

  test("z >= +1 → -0.10 (선형)", () => {
    expect(applyNetflowZscoreThreshold(1)).toBe(-0.1);
    expect(applyNetflowZscoreThreshold(1.5)).toBe(-0.1);
    expect(applyNetflowZscoreThreshold(1.99)).toBe(-0.1);
  });

  test("z <= -1 → +0.10", () => {
    expect(applyNetflowZscoreThreshold(-1)).toBe(0.1);
    expect(applyNetflowZscoreThreshold(-1.5)).toBe(0.1);
  });

  test("|z| < 1 → 0 (중립)", () => {
    expect(applyNetflowZscoreThreshold(0)).toBe(0);
    expect(applyNetflowZscoreThreshold(0.5)).toBe(0);
    expect(applyNetflowZscoreThreshold(-0.5)).toBe(0);
    expect(applyNetflowZscoreThreshold(0.99)).toBe(0);
  });

  test("non-finite → 0 (graceful)", () => {
    expect(applyNetflowZscoreThreshold(NaN)).toBe(0);
    expect(applyNetflowZscoreThreshold(Infinity)).toBe(0);
  });

  test("결과는 항상 [-0.25, +0.20] 범위 내", () => {
    const samples = [-100, -3, -2, -1, 0, 1, 2, 3, 100];
    for (const z of samples) {
      const r = applyNetflowZscoreThreshold(z);
      expect(r).toBeGreaterThanOrEqual(-0.25);
      expect(r).toBeLessThanOrEqual(0.2);
    }
  });
});

// ─── 2. applyMinerOutflowZscoreThreshold ─────────────────────────────

describe("applyMinerOutflowZscoreThreshold — z-score → modifier", () => {
  test("z >= +2 → -0.15 (매도 압력)", () => {
    expect(applyMinerOutflowZscoreThreshold(2)).toBe(-0.15);
    expect(applyMinerOutflowZscoreThreshold(3)).toBe(-0.15);
  });

  test("z >= +1 → -0.05", () => {
    expect(applyMinerOutflowZscoreThreshold(1)).toBe(-0.05);
    expect(applyMinerOutflowZscoreThreshold(1.5)).toBe(-0.05);
  });

  test("z <= -1.5 → +0.10 (holding)", () => {
    expect(applyMinerOutflowZscoreThreshold(-1.5)).toBe(0.1);
    expect(applyMinerOutflowZscoreThreshold(-3)).toBe(0.1);
  });

  test("그 외 → 0", () => {
    expect(applyMinerOutflowZscoreThreshold(0)).toBe(0);
    expect(applyMinerOutflowZscoreThreshold(0.5)).toBe(0);
    expect(applyMinerOutflowZscoreThreshold(-1)).toBe(0);
  });

  test("non-finite → 0", () => {
    expect(applyMinerOutflowZscoreThreshold(NaN)).toBe(0);
  });
});

// ─── 3. applyLthSupplyChangeThreshold ────────────────────────────────

describe("applyLthSupplyChangeThreshold — 30d 변화율 → modifier", () => {
  test(">= +2% → +0.10 (축적)", () => {
    expect(applyLthSupplyChangeThreshold(0.02)).toBe(0.1);
    expect(applyLthSupplyChangeThreshold(0.05)).toBe(0.1);
    expect(applyLthSupplyChangeThreshold(0.5)).toBe(0.1);
  });

  test("<= -2% → -0.15 (분배)", () => {
    expect(applyLthSupplyChangeThreshold(-0.02)).toBe(-0.15);
    expect(applyLthSupplyChangeThreshold(-0.05)).toBe(-0.15);
  });

  test("작은 양수 → 선형 보간 (양수 slope 5)", () => {
    expect(applyLthSupplyChangeThreshold(0.01)).toBeCloseTo(0.05, 4);
    expect(applyLthSupplyChangeThreshold(0.005)).toBeCloseTo(0.025, 4);
  });

  test("작은 음수 → 선형 보간 (음수 slope 7.5)", () => {
    expect(applyLthSupplyChangeThreshold(-0.01)).toBeCloseTo(-0.075, 4);
    expect(applyLthSupplyChangeThreshold(-0.005)).toBeCloseTo(-0.0375, 4);
  });

  test("0 → 0", () => {
    expect(applyLthSupplyChangeThreshold(0)).toBe(0);
  });

  test("non-finite → 0", () => {
    expect(applyLthSupplyChangeThreshold(NaN)).toBe(0);
    expect(applyLthSupplyChangeThreshold(Infinity)).toBe(0);
  });

  test("결과는 항상 [-0.15, +0.10] 범위 내", () => {
    const samples = [-1, -0.1, -0.05, -0.02, -0.005, 0, 0.005, 0.02, 0.05, 1];
    for (const v of samples) {
      const r = applyLthSupplyChangeThreshold(v);
      expect(r).toBeGreaterThanOrEqual(-0.15);
      expect(r).toBeLessThanOrEqual(0.1);
    }
  });
});

// ─── 4. computeExchangeNetflow — symbol/key 분기 ─────────────────────

describe("computeExchangeNetflow — symbol/key 분기", () => {
  test("비-BTC symbol → stub (영향 없음)", async () => {
    process.env.CRYPTOQUANT_API_KEY = "test-key";
    const r = await computeExchangeNetflow("ETHUSDT");
    expect(r.status).toBe("stub");
    expect(r.value).toBe(0);
    expect(r.detail).toContain("BTC 전용");
  });

  test("BTC + key 미설정 + ONCHAIN_MOCK=1 → mock", async () => {
    process.env.ONCHAIN_MOCK = "1";
    const r = await computeExchangeNetflow("BTCUSDT");
    expect(r.status).toBe("mock");
    expect(Math.abs(r.value)).toBeLessThanOrEqual(0.2);
  });

  test("BTC + key 미설정 → stub", async () => {
    const r = await computeExchangeNetflow("BTCUSDT");
    expect(r.status).toBe("stub");
    expect(r.value).toBe(0);
  });
});

// ─── 5. computeExchangeNetflow — live data 흐름 ──────────────────────

describe("computeExchangeNetflow — live data (axios mock)", () => {
  beforeEach(() => {
    process.env.CRYPTOQUANT_API_KEY = "test-key";
  });

  test("정상 응답 + 강한 유입 (z > 2) → -0.25", async () => {
    // 평균 1000, std ~100, 마지막 값 1500 → z ≈ 5 → -0.25
    const data = [
      950, 1000, 1050, 980, 1020, 1010, 990, 970, 1030, 1000,
      1010, 990, 1000, 1020, 980, 1030, 990, 1010, 1000, 990,
      1010, 1020, 1000, 990, 1010, 1000, 980, 1020, 1010, 1500,
    ];
    vi.spyOn(axios, "get").mockResolvedValue({
      data: {
        result: {
          data: data.map((v, i) => ({
            date: `2026-05-${String(i + 1).padStart(2, "0")}`.slice(0, 10),
            value: v,
          })),
        },
      },
    });

    const r = await computeExchangeNetflow("BTCUSDT");
    expect(r.status).toBe("ok");
    expect(r.value).toBe(-0.25);
    expect(r.raw).toMatchObject({ latest: 1500 });
    // z 가 2 이상이어야 함.
    const z = (r.raw as { z: number }).z;
    expect(z).toBeGreaterThan(2);
  });

  test("정상 응답 + 강한 유출 (z < -2) → +0.20", async () => {
    // 평균 1000, 마지막 값 500 → z ≈ -5 → +0.20
    const data = [
      950, 1000, 1050, 980, 1020, 1010, 990, 970, 1030, 1000,
      1010, 990, 1000, 1020, 980, 1030, 990, 1010, 1000, 990,
      1010, 1020, 1000, 990, 1010, 1000, 980, 1020, 1010, 500,
    ];
    vi.spyOn(axios, "get").mockResolvedValue({
      data: {
        result: {
          data: data.map((v, i) => ({ date: `2026-05-${String(i + 1).padStart(2, "0")}`.slice(0, 10), value: v })),
        },
      },
    });

    const r = await computeExchangeNetflow("BTCUSDT");
    expect(r.status).toBe("ok");
    expect(r.value).toBe(0.2);
  });

  test("정상 응답 + 평범한 값 (|z| < 1) → 0", async () => {
    // 평균 1000, 마지막 값 1005 → z ≈ 0.2 → 0
    const data = [
      995, 1000, 1005, 1010, 990, 1000, 1005, 1010, 995, 1000,
      1005, 1000, 990, 1010, 1000, 995, 1005, 1010, 1000, 990,
      1005, 1010, 995, 1000, 1005, 1000, 1010, 995, 1000, 1005,
    ];
    vi.spyOn(axios, "get").mockResolvedValue({
      data: {
        result: {
          data: data.map((v, i) => ({ date: `2026-05-${String(i + 1).padStart(2, "0")}`.slice(0, 10), value: v })),
        },
      },
    });

    const r = await computeExchangeNetflow("BTCUSDT");
    expect(r.status).toBe("ok");
    expect(r.value).toBe(0);
  });

  test("데이터 부족 (< 7행) → error (graceful)", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({
      data: {
        result: {
          data: [
            { date: "2026-05-19", value: 100 },
            { date: "2026-05-20", value: 200 },
          ],
        },
      },
    });

    const r = await computeExchangeNetflow("BTCUSDT");
    expect(r.status).toBe("error");
    expect(r.value).toBe(0);
  });

  test("axios 에러 → error 반환 (throw X)", async () => {
    vi.spyOn(axios, "get").mockRejectedValue(new Error("401 Unauthorized"));
    const r = await computeExchangeNetflow("BTCUSDT");
    expect(r.status).toBe("error");
    expect(r.value).toBe(0);
  });
});

// ─── 6. computeMinerOutflow — live data 흐름 ─────────────────────────

describe("computeMinerOutflow — live data (axios mock)", () => {
  beforeEach(() => {
    process.env.CRYPTOQUANT_API_KEY = "test-key";
  });

  test("비-BTC symbol → stub", async () => {
    const r = await computeMinerOutflow("ETHUSDT");
    expect(r.status).toBe("stub");
    expect(r.value).toBe(0);
    expect(r.detail).toContain("BTC 외");
  });

  test("정상 응답 + 강한 매도 (z > 2) → -0.15", async () => {
    // 평범한 outflow 23일 + 최근 7일 매우 큰 outflow → 7d sum z > 2.
    const baseline = Array(23).fill(100); // 첫 23일
    const surge = [500, 600, 700, 800, 900, 1000, 1100]; // 최근 7일 (sum 5600)
    const data = [...baseline, ...surge];
    vi.spyOn(axios, "get").mockResolvedValue({
      data: {
        result: {
          data: data.map((v, i) => ({
            date: `2026-05-${String(i + 1).padStart(2, "0")}`.slice(0, 10),
            outflow: v,
          })),
        },
      },
    });

    const r = await computeMinerOutflow("BTCUSDT");
    expect(r.status).toBe("ok");
    expect(r.value).toBe(-0.15);
  });

  test("axios 에러 → error 반환", async () => {
    vi.spyOn(axios, "get").mockRejectedValue(new Error("500 Server Error"));
    const r = await computeMinerOutflow("BTCUSDT");
    expect(r.status).toBe("error");
    expect(r.value).toBe(0);
  });

  test("데이터 부족 → error", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({
      data: { result: { data: [{ date: "2026-05-21", outflow: 100 }] } },
    });
    const r = await computeMinerOutflow("BTCUSDT");
    expect(r.status).toBe("error");
  });
});

// ─── 7. computeLthSupply — live data 흐름 ────────────────────────────

describe("computeLthSupply — live data (axios mock)", () => {
  beforeEach(() => {
    process.env.GLASSNODE_API_KEY = "test-key";
  });

  test("비-BTC/ETH symbol → stub", async () => {
    const r = await computeLthSupply("SOLUSDT");
    expect(r.status).toBe("stub");
    expect(r.value).toBe(0);
    expect(r.detail).toContain("LTH metric N/A");
  });

  test("BTC 30d +5% LTH 변화 → +0.10 (축적)", async () => {
    // first = 14_000_000, last = 14_700_000 → +5%
    vi.spyOn(axios, "get").mockResolvedValue({
      data: [
        { t: 1_716_163_200, v: 14_000_000 },
        { t: 1_716_249_600, v: 14_100_000 },
        { t: 1_716_336_000, v: 14_700_000 },
      ],
    });

    const r = await computeLthSupply("BTCUSDT");
    expect(r.status).toBe("ok");
    expect(r.value).toBe(0.1);
    const raw = r.raw as { changePct: number; asset: string };
    expect(raw.changePct).toBeCloseTo(0.05, 4);
    expect(raw.asset).toBe("BTC");
  });

  test("ETH 30d -3% LTH 변화 → -0.15 (분배)", async () => {
    // first = 100, last = 97 → -3%
    vi.spyOn(axios, "get").mockResolvedValue({
      data: [
        { t: 1_716_163_200, v: 100 },
        { t: 1_716_336_000, v: 97 },
      ],
    });

    const r = await computeLthSupply("ETHUSDT");
    expect(r.status).toBe("ok");
    expect(r.value).toBe(-0.15);
    const raw = r.raw as { asset: string };
    expect(raw.asset).toBe("ETH");
  });

  test("0% 근처 변화 → 선형 보간 ≈ 0", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({
      data: [
        { t: 1_716_163_200, v: 100 },
        { t: 1_716_336_000, v: 100.1 },
      ],
    });
    const r = await computeLthSupply("BTCUSDT");
    expect(r.status).toBe("ok");
    expect(Math.abs(r.value)).toBeLessThan(0.05);
  });

  test("데이터 부족 (< 2행) → error", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({ data: [] });
    const r = await computeLthSupply("BTCUSDT");
    expect(r.status).toBe("error");
    expect(r.value).toBe(0);
  });

  test("axios 에러 → error", async () => {
    vi.spyOn(axios, "get").mockRejectedValue(new Error("503"));
    const r = await computeLthSupply("BTCUSDT");
    expect(r.status).toBe("error");
  });

  test("key 미설정 → stub (live path 미진입)", async () => {
    delete process.env.GLASSNODE_API_KEY;
    const getSpy = vi.spyOn(axios, "get").mockResolvedValue({ data: [] });
    const r = await computeLthSupply("BTCUSDT");
    expect(r.status).toBe("stub");
    expect(getSpy).not.toHaveBeenCalled();
  });
});
