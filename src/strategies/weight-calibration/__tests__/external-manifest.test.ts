import { describe, expect, it } from "vitest";
import {
  classifySymbol,
  DEFAULT_THRESHOLDS,
  DEFAULT_WEIGHTS,
  EXTERNAL_WEIGHTS_MANIFEST,
  getExternalWeights,
} from "../external-manifest";

describe("external-manifest", () => {
  it("LONG 3 + SHORT 3 mirror = 6 sources", () => {
    expect(EXTERNAL_WEIGHTS_MANIFEST).toHaveLength(6);
    const longs = EXTERNAL_WEIGHTS_MANIFEST.filter((s) => s.weights.side === "long");
    const shorts = EXTERNAL_WEIGHTS_MANIFEST.filter((s) => s.weights.side === "short");
    expect(longs).toHaveLength(3);
    expect(shorts).toHaveLength(3);
  });

  it("각 source 의 가중치 합 = 1 (±0.001)", () => {
    for (const s of EXTERNAL_WEIGHTS_MANIFEST) {
      const sum =
        s.weights.momentum +
        s.weights.position +
        s.weights.trend +
        s.weights.volume +
        s.weights.action;
      expect(Math.abs(sum - 1)).toBeLessThan(0.001);
    }
  });

  it("DEFAULT_WEIGHTS 도 합 = 1", () => {
    for (const path of ["NUM", "PTN", "BB"] as const) {
      const w = DEFAULT_WEIGHTS[path];
      const sum =
        w.momentum + w.position + w.trend + w.volume + w.action;
      expect(Math.abs(sum - 1)).toBeLessThan(0.001);
    }
  });

  it("classifySymbol — 대표 코인 매핑", () => {
    expect(classifySymbol("BTCUSDT")).toBe("BTC");
    expect(classifySymbol("ETHUSDT")).toBe("ETH");
    expect(classifySymbol("SOLUSDT")).toBe("major_alts");
    expect(classifySymbol("ADAUSDT")).toBe("major_alts");
    expect(classifySymbol("XRPUSDT")).toBe("major_alts");
    expect(classifySymbol("DOGEUSDT")).toBe("all");
    expect(classifySymbol("AVAXUSDT")).toBe("all");
  });

  it("getExternalWeights — LONG 모든 path × 4h fallback", () => {
    for (const path of ["NUM", "PTN", "BB"]) {
      const res = getExternalWeights("BTCUSDT", "4h", path, "long");
      expect(res).not.toBeNull();
      expect(res!.weights.path).toBe(path);
      expect(res!.weights.side).toBe("long");
    }
  });

  it("getExternalWeights — SHORT 도 LONG mirror", () => {
    const longBB = getExternalWeights("BTCUSDT", "4h", "BB", "long");
    const shortBB = getExternalWeights("BTCUSDT", "4h", "BB", "short");
    expect(longBB).not.toBeNull();
    expect(shortBB).not.toBeNull();
    expect(shortBB!.weights.momentum).toBe(longBB!.weights.momentum);
    expect(shortBB!.source_id).toContain("short_mirror");
    expect(shortBB!.weights.metadata.warning).toBeTruthy();
    // SHORT sample_size 는 LONG 의 ~10%
    expect(shortBB!.weights.metadata.sample_size).toBeLessThan(
      longBB!.weights.metadata.sample_size,
    );
  });

  it("getExternalWeights — 1h timeframe 은 미정의 → null", () => {
    const res = getExternalWeights("BTCUSDT", "1h", "NUM", "long");
    expect(res).toBeNull();
  });

  it("DEFAULT_THRESHOLDS SHORT > LONG (보수적 +5)", () => {
    expect(DEFAULT_THRESHOLDS.short).toBe(45);
    expect(DEFAULT_THRESHOLDS.long).toBe(40);
    expect(DEFAULT_THRESHOLDS.short).toBeGreaterThan(DEFAULT_THRESHOLDS.long);
  });
});
