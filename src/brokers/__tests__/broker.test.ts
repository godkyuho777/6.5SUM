/**
 * Broker abstraction tests (P2-#16, 2026-05-23).
 *
 * 검증 항목:
 *   - Broker interface 모든 메소드를 BybitV5Broker 가 구현
 *   - getDefaultBroker() singleton 동작
 *   - BROKER=unknown 시 graceful fallback (bybit-v5)
 *   - setDefaultBrokerForTests() 로 mock 주입 가능
 *
 * 헌장: 본 테스트는 network 호출 X — interface 형태만 검증.
 *   실제 Bybit 호출 테스트는 bybit-zod.test.ts (P2-#2) 에 분리.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import {
  BybitV5Broker,
  getDefaultBroker,
  setDefaultBrokerForTests,
} from "../index";
import type { Broker } from "../broker.interface";

describe("BybitV5Broker — interface 충족", () => {
  test("name = bybit-v5", () => {
    const b = new BybitV5Broker();
    expect(b.name).toBe("bybit-v5");
  });

  test("모든 Broker 메소드가 function 으로 존재", () => {
    const b = new BybitV5Broker();
    expect(typeof b.fetchKlines).toBe("function");
    expect(typeof b.fetch24hTicker).toBe("function");
    expect(typeof b.fetchAllTickers).toBe("function");
    expect(typeof b.fetchMultiplePrices).toBe("function");
    expect(typeof b.validateSymbol).toBe("function");
  });
});

describe("getDefaultBroker — env-driven selection", () => {
  const ORIGINAL_BROKER = process.env.BROKER;

  beforeEach(() => {
    setDefaultBrokerForTests(null); // cache 초기화
  });

  afterEach(() => {
    if (ORIGINAL_BROKER === undefined) {
      delete process.env.BROKER;
    } else {
      process.env.BROKER = ORIGINAL_BROKER;
    }
    setDefaultBrokerForTests(null);
  });

  test("BROKER 미설정 → bybit-v5", () => {
    delete process.env.BROKER;
    const b = getDefaultBroker();
    expect(b.name).toBe("bybit-v5");
  });

  test("BROKER=bybit → bybit-v5", () => {
    process.env.BROKER = "bybit";
    const b = getDefaultBroker();
    expect(b.name).toBe("bybit-v5");
  });

  test("BROKER=BYBIT (대소문자 무시) → bybit-v5", () => {
    process.env.BROKER = "BYBIT";
    const b = getDefaultBroker();
    expect(b.name).toBe("bybit-v5");
  });

  test("BROKER=unknown → graceful fallback to bybit-v5", () => {
    process.env.BROKER = "binance"; // 아직 미구현
    const b = getDefaultBroker();
    expect(b.name).toBe("bybit-v5");
  });

  test("singleton — 두 번째 호출은 동일 인스턴스", () => {
    const b1 = getDefaultBroker();
    const b2 = getDefaultBroker();
    expect(b1).toBe(b2);
  });
});

describe("setDefaultBrokerForTests — mock 주입", () => {
  afterEach(() => {
    setDefaultBrokerForTests(null);
  });

  test("mock broker 가 getDefaultBroker 결과로 반환", () => {
    const mock: Broker = {
      name: "mock-test",
      fetchKlines: async () => [],
      fetch24hTicker: async () => null,
      fetchAllTickers: async () => new Map(),
      fetchMultiplePrices: async () => new Map(),
      validateSymbol: async () => true,
    };
    setDefaultBrokerForTests(mock);
    const b = getDefaultBroker();
    expect(b.name).toBe("mock-test");
  });

  test("null 주입 후 다시 호출 → env 기반 재선택", () => {
    const mock: Broker = {
      name: "throwaway",
      fetchKlines: async () => [],
      fetch24hTicker: async () => null,
      fetchAllTickers: async () => new Map(),
      fetchMultiplePrices: async () => new Map(),
      validateSymbol: async () => true,
    };
    setDefaultBrokerForTests(mock);
    expect(getDefaultBroker().name).toBe("throwaway");

    setDefaultBrokerForTests(null);
    const b = getDefaultBroker();
    expect(b.name).toBe("bybit-v5"); // env 기반 재계산
  });
});
