import { describe, expect, test } from "vitest";

import {
  getOnchainTier,
  TIER_MODIFIERS,
  tierCoverageLabel,
} from "../symbol-tier";

describe("getOnchainTier", () => {
  test("BTC and ETH map to dedicated tiers", () => {
    expect(getOnchainTier("BTCUSDT")).toBe("btc");
    expect(getOnchainTier("ETHUSDT")).toBe("eth");
  });

  test("major alts (SOL/BNB/XRP/etc.) → major_alt", () => {
    expect(getOnchainTier("SOLUSDT")).toBe("major_alt");
    expect(getOnchainTier("BNBUSDT")).toBe("major_alt");
    expect(getOnchainTier("XRPUSDT")).toBe("major_alt");
    expect(getOnchainTier("ARBUSDT")).toBe("major_alt");
  });

  test("low-liquidity / unknown alts → small_alt", () => {
    expect(getOnchainTier("PEPEUSDT")).toBe("major_alt"); // PEPE is in MAJOR set
    expect(getOnchainTier("NEVERHEARDOFITUSDT")).toBe("small_alt");
    expect(getOnchainTier("VIRTUALUSDT")).toBe("small_alt");
  });

  test("case-insensitive lookup", () => {
    expect(getOnchainTier("btcusdt")).toBe("btc");
    expect(getOnchainTier("Ethusdt")).toBe("eth");
  });
});

describe("TIER_MODIFIERS", () => {
  test("BTC enables all 7 modifiers", () => {
    expect(TIER_MODIFIERS.btc).toHaveLength(7);
  });

  test("ETH enables 6 (no miner outflow)", () => {
    expect(TIER_MODIFIERS.eth).toHaveLength(6);
    expect(TIER_MODIFIERS.eth).not.toContain("minerOutflow");
  });

  test("major_alt enables 4 (CEX flows only)", () => {
    expect(TIER_MODIFIERS.major_alt).toHaveLength(4);
    expect(TIER_MODIFIERS.major_alt).toContain("netflow");
    expect(TIER_MODIFIERS.major_alt).toContain("whale");
    expect(TIER_MODIFIERS.major_alt).toContain("ssr");
    expect(TIER_MODIFIERS.major_alt).toContain("coinbasePremium");
    expect(TIER_MODIFIERS.major_alt).not.toContain("etfFlow");
  });

  test("small_alt enables only netflow + whale", () => {
    expect(TIER_MODIFIERS.small_alt).toEqual(["netflow", "whale"]);
  });
});

describe("tierCoverageLabel", () => {
  test("describes coverage for each tier", () => {
    expect(tierCoverageLabel("btc")).toContain("7 modifiers");
    expect(tierCoverageLabel("eth")).toContain("6 modifiers");
    expect(tierCoverageLabel("major_alt")).toContain("4 modifiers");
    expect(tierCoverageLabel("small_alt")).toContain("data sparse");
  });
});
