/**
 * P1-#4 (2026-05-10): provider-status unit tests.
 *
 * 7-modifier provider 상태 가시화 검증.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import {
  getOnchainProviderStatus,
  summarizeProviderStatus,
  describeProviderStatusForBacktest,
} from "../provider-status";

const ENV_KEYS = [
  "CRYPTOQUANT_API_KEY",
  "WHALE_ALERT_API_KEY",
  "GLASSNODE_API_KEY",
  "ETF_FLOW_PROVIDER",
  "ONCHAIN_MOCK",
];

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("getOnchainProviderStatus — 7 modifier 상태 (P1-#4)", () => {
  test("환경변수 모두 미설정 → coinbase_premium / ssr 만 real, 나머지 stub", () => {
    const status = getOnchainProviderStatus();
    expect(status).toHaveLength(7);

    const byKey = Object.fromEntries(status.map((s) => [s.key, s]));

    // Coinbase Premium + SSR 은 외부 키 불필요 → 항상 real
    expect(byKey.coinbase_premium.mode).toBe("real");
    expect(byKey.ssr.mode).toBe("real");

    // 나머지 5개는 stub
    expect(byKey.exchange_netflow.mode).toBe("stub");
    expect(byKey.whale_alert.mode).toBe("stub");
    expect(byKey.etf_flow.mode).toBe("stub");
    expect(byKey.miner_outflow.mode).toBe("stub");
    expect(byKey.lth_supply.mode).toBe("stub");
  });

  test("ONCHAIN_MOCK=1 → stub 자리에 mock 배치", () => {
    process.env.ONCHAIN_MOCK = "1";
    const status = getOnchainProviderStatus();
    const byKey = Object.fromEntries(status.map((s) => [s.key, s]));

    // stub 였던 5개가 mock 으로 바뀜
    expect(byKey.exchange_netflow.mode).toBe("mock");
    expect(byKey.whale_alert.mode).toBe("mock");
    expect(byKey.etf_flow.mode).toBe("mock");
    expect(byKey.miner_outflow.mode).toBe("mock");
    expect(byKey.lth_supply.mode).toBe("mock");

    // real 들은 그대로
    expect(byKey.coinbase_premium.mode).toBe("real");
    expect(byKey.ssr.mode).toBe("real");
  });

  test("CRYPTOQUANT_API_KEY 설정 → exchange_netflow + miner_outflow real", () => {
    process.env.CRYPTOQUANT_API_KEY = "test-key";
    const byKey = Object.fromEntries(
      getOnchainProviderStatus().map((s) => [s.key, s]),
    );
    expect(byKey.exchange_netflow.mode).toBe("real");
    expect(byKey.miner_outflow.mode).toBe("real");
  });

  test("ETF_FLOW_PROVIDER=farside → etf_flow real", () => {
    process.env.ETF_FLOW_PROVIDER = "farside";
    const byKey = Object.fromEntries(
      getOnchainProviderStatus().map((s) => [s.key, s]),
    );
    expect(byKey.etf_flow.mode).toBe("real");
  });
});

describe("summarizeProviderStatus (P1-#4)", () => {
  test("환경변수 미설정 → effective=2/7 (real=2, stub=5)", () => {
    const s = summarizeProviderStatus();
    expect(s.total).toBe(7);
    expect(s.real).toBe(2);
    expect(s.stub).toBe(5);
    expect(s.mock).toBe(0);
    expect(s.effective).toBe(2); // real + mock
  });

  test("ONCHAIN_MOCK=1 → effective=7/7 (real=2, mock=5)", () => {
    process.env.ONCHAIN_MOCK = "1";
    const s = summarizeProviderStatus();
    expect(s.real).toBe(2);
    expect(s.mock).toBe(5);
    expect(s.stub).toBe(0);
    expect(s.effective).toBe(7);
  });

  test("모든 키 설정 + mock → effective=7", () => {
    process.env.CRYPTOQUANT_API_KEY = "x";
    process.env.WHALE_ALERT_API_KEY = "x";
    process.env.GLASSNODE_API_KEY = "x";
    process.env.ETF_FLOW_PROVIDER = "farside";
    const s = summarizeProviderStatus();
    expect(s.real).toBe(7);
    expect(s.effective).toBe(7);
  });
});

describe("describeProviderStatusForBacktest (P1-#4)", () => {
  test("환경변수 미설정 → effective=2/7 메시지 + 경고 포함", () => {
    const msg = describeProviderStatusForBacktest();
    expect(msg).toContain("effective=2/7");
    expect(msg).toContain("ONCHAIN_MOCK=1"); // mock 권고 포함
  });

  test("ONCHAIN_MOCK=1 → 경고 없음 (mock 권고 미표시)", () => {
    process.env.ONCHAIN_MOCK = "1";
    const msg = describeProviderStatusForBacktest();
    expect(msg).toContain("effective=7/7");
    // mock 권고 메시지가 안 나옴
    expect(msg).not.toContain("ONCHAIN_MOCK=1 설정 시");
  });
});
