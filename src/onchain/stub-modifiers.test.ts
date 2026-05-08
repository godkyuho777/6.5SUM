/**
 * stub-modifiers — Onchain Mock Mode 테스트
 *
 * 검증 항목:
 *   1. 키 미설정 + ONCHAIN_MOCK 미설정 → status: "stub", value: 0
 *   2. ONCHAIN_MOCK=1 설정 → status: "mock", value 가 0 이 아닌 한계 이내,
 *      같은 symbol 재호출 시 같은 값 (결정론).
 *   3. 코인마다 다른 값이 나옴.
 *   4. mock 모드에서도 modifier 의 값 한계 (±0.20 또는 ±0.15) 안에 머묾.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  computeExchangeNetflow,
  computeWhaleAlert,
  computeEtfFlow,
  computeMinerOutflow,
  computeLthSupply,
  __testing,
} from "./stub-modifiers";

const ONCHAIN_KEY_VARS = [
  "CRYPTOQUANT_API_KEY",
  "WHALE_ALERT_API_KEY",
  "GLASSNODE_API_KEY",
  "ETF_FLOW_PROVIDER",
  "ONCHAIN_MOCK",
] as const;

function clearOnchainEnv() {
  for (const k of ONCHAIN_KEY_VARS) {
    delete process.env[k];
  }
}

let envBackup: Record<string, string | undefined> = {};

beforeEach(() => {
  envBackup = {};
  for (const k of ONCHAIN_KEY_VARS) {
    envBackup[k] = process.env[k];
  }
  clearOnchainEnv();
});

afterEach(() => {
  clearOnchainEnv();
  for (const k of ONCHAIN_KEY_VARS) {
    if (envBackup[k] !== undefined) {
      process.env[k] = envBackup[k];
    }
  }
});

// ─── 1. Default (no keys, no mock) → status: stub, value: 0 ─────────

describe("stub-modifiers: default (no keys, no mock)", () => {
  it("computeExchangeNetflow → status: stub, value: 0", async () => {
    const r = await computeExchangeNetflow("BTCUSDT");
    expect(r.status).toBe("stub");
    expect(r.value).toBe(0);
  });

  it("computeWhaleAlert → status: stub, value: 0", async () => {
    const r = await computeWhaleAlert("BTCUSDT");
    expect(r.status).toBe("stub");
    expect(r.value).toBe(0);
  });

  it("computeMinerOutflow (BTCUSDT) → status: stub, value: 0", async () => {
    const r = await computeMinerOutflow("BTCUSDT");
    expect(r.status).toBe("stub");
    expect(r.value).toBe(0);
  });

  it("computeLthSupply (ETHUSDT) → status: stub, value: 0", async () => {
    const r = await computeLthSupply("ETHUSDT");
    expect(r.status).toBe("stub");
    expect(r.value).toBe(0);
  });

  it("computeEtfFlow (BTCUSDT, no provider) → status: stub, value: 0", async () => {
    const r = await computeEtfFlow("BTCUSDT");
    expect(r.status).toBe("stub");
    expect(r.value).toBe(0);
  });
});

// ─── 2. Symbol-restricted modifiers stay stub regardless of mock ────

describe("stub-modifiers: symbol restrictions (mock mode active)", () => {
  beforeEach(() => {
    process.env.ONCHAIN_MOCK = "1";
  });

  it("miner_outflow rejects non-BTC even in mock mode", async () => {
    const r = await computeMinerOutflow("ETHUSDT");
    expect(r.status).toBe("stub");
    expect(r.value).toBe(0);
  });

  it("lth_supply rejects non-BTC/ETH even in mock mode", async () => {
    const r = await computeLthSupply("SOLUSDT");
    expect(r.status).toBe("stub");
    expect(r.value).toBe(0);
  });

  it("etf_flow rejects non-BTC/ETH even in mock mode", async () => {
    const r = await computeEtfFlow("SOLUSDT");
    expect(r.status).toBe("stub");
    expect(r.value).toBe(0);
  });
});

// ─── 3. ONCHAIN_MOCK=1 → status: mock, deterministic ────────────────

describe("stub-modifiers: ONCHAIN_MOCK=1 (deterministic mock)", () => {
  beforeEach(() => {
    process.env.ONCHAIN_MOCK = "1";
  });

  it("exchange_netflow returns status: mock with bounded value", async () => {
    const r = await computeExchangeNetflow("BTCUSDT");
    expect(r.status).toBe("mock");
    expect(Math.abs(r.value)).toBeLessThanOrEqual(0.2);
  });

  it("whale_alert returns status: mock with bounded value (±0.15)", async () => {
    const r = await computeWhaleAlert("BTCUSDT");
    expect(r.status).toBe("mock");
    expect(Math.abs(r.value)).toBeLessThanOrEqual(0.15);
  });

  it("miner_outflow (BTCUSDT) returns status: mock with bounded value (±0.15)", async () => {
    const r = await computeMinerOutflow("BTCUSDT");
    expect(r.status).toBe("mock");
    expect(Math.abs(r.value)).toBeLessThanOrEqual(0.15);
  });

  it("lth_supply (BTCUSDT) returns status: mock with bounded value (±0.15)", async () => {
    const r = await computeLthSupply("BTCUSDT");
    expect(r.status).toBe("mock");
    expect(Math.abs(r.value)).toBeLessThanOrEqual(0.15);
  });

  it("etf_flow (BTCUSDT) returns status: mock with bounded value (±0.20)", async () => {
    const r = await computeEtfFlow("BTCUSDT");
    expect(r.status).toBe("mock");
    expect(Math.abs(r.value)).toBeLessThanOrEqual(0.2);
  });

  it("is deterministic — same symbol returns same value across calls", async () => {
    const a = await computeExchangeNetflow("BTCUSDT");
    const b = await computeExchangeNetflow("BTCUSDT");
    const c = await computeExchangeNetflow("BTCUSDT");
    expect(a.value).toBe(b.value);
    expect(b.value).toBe(c.value);
  });

  it("varies across symbols (non-trivial distribution)", async () => {
    const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "ADAUSDT", "DOGEUSDT"];
    const values = await Promise.all(
      symbols.map((s) => computeExchangeNetflow(s).then((r) => r.value))
    );
    const uniq = new Set(values);
    // 적어도 2개 이상 서로 다른 값이 나와야 결정론 mock 의 분포가 살아있다.
    expect(uniq.size).toBeGreaterThanOrEqual(2);
  });

  it("at least one symbol produces a non-zero mock value (sanity)", async () => {
    const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "ADAUSDT", "DOGEUSDT"];
    const values = await Promise.all(
      symbols.map((s) => computeWhaleAlert(s).then((r) => r.value))
    );
    expect(values.some((v) => v !== 0)).toBe(true);
  });
});

// ─── 4. Real key takes precedence over mock ─────────────────────────

describe("stub-modifiers: real key precedence", () => {
  it("CRYPTOQUANT_API_KEY set + ONCHAIN_MOCK=1 → real-data path stub (not mock)", async () => {
    process.env.CRYPTOQUANT_API_KEY = "fake-key-for-test";
    process.env.ONCHAIN_MOCK = "1";
    const r = await computeExchangeNetflow("BTCUSDT");
    // 실데이터 경로 placeholder 는 status: "stub" 반환 (TODO v1.1).
    expect(r.status).toBe("stub");
    expect(r.value).toBe(0);
    // 환경변수 정리는 afterEach 가 처리.
  });
});

// ─── 5. Hash helper sanity ──────────────────────────────────────────

describe("stub-modifiers: deterministic hash helpers", () => {
  it("simpleHash is deterministic", () => {
    expect(__testing.simpleHash("BTCUSDT|whale_alert")).toBe(
      __testing.simpleHash("BTCUSDT|whale_alert")
    );
  });

  it("hashUnit returns [0, 1)", () => {
    for (const s of ["BTCUSDT", "ETHUSDT", "SOLUSDT", ""]) {
      const u = __testing.hashUnit(s);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
    }
  });

  it("mockValue stays within [-maxAbs, +maxAbs]", () => {
    for (const s of ["BTCUSDT", "ETHUSDT", "XRPUSDT", "DOTUSDT"]) {
      const v = __testing.mockValue(s, "whale_alert", 0.15);
      expect(v).toBeGreaterThanOrEqual(-0.15);
      expect(v).toBeLessThanOrEqual(0.15);
    }
  });
});
