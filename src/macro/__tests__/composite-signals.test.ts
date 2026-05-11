/**
 * Tests for macro composite signals (C1~C4).
 * MACRO_LIQUIDITY_TRACKER_v2 §3.2.
 */

import { describe, expect, test } from "vitest";
import {
  c1_crisis,
  c2_riskOn,
  c3_netLiquidity,
  c4_cyclePhase,
  computeCompositeSignals,
  macroFreshnessMult,
  effectiveMacroMultiplier,
  type RawMacroData,
} from "../composite-signals";
import { computeMacroScoreV2 } from "../liquidity";

// ─── C1 — Crisis (AND, multiplicative) ──────────────────────────────────

describe("c1_crisis — SOFR-IORB spread × VIX", () => {
  test("no crisis indicators → 0", () => {
    expect(c1_crisis({ sofr: 4.3, iorb: 4.3, vix: 15 })).toBe(0);
  });

  test("spread 0bp, VIX 25 → 0 (spread side zero)", () => {
    expect(c1_crisis({ sofr: 4.3, iorb: 4.3, vix: 25 })).toBe(0);
  });

  test("spread 5bp, VIX 35 → moderate (0.5 × 0.57 ≈ 0.286)", () => {
    const c = c1_crisis({ sofr: 4.35, iorb: 4.3, vix: 35 });
    expect(c).toBeGreaterThan(0.25);
    expect(c).toBeLessThan(0.35);
  });

  test("spread 10bp+, VIX 50 → 1.0 (full crisis)", () => {
    const c = c1_crisis({ sofr: 4.5, iorb: 4.3, vix: 50 });
    expect(c).toBe(1.0);
  });

  test("missing inputs → 0 (graceful)", () => {
    expect(c1_crisis({})).toBe(0);
    expect(c1_crisis({ sofr: 4.5 })).toBe(0);
  });
});

// ─── C2 — Risk-on (additive) ────────────────────────────────────────────

describe("c2_riskOn — DXY + real_rate + VIX", () => {
  test("all bearish → 0", () => {
    const c = c2_riskOn({
      dxy_change_30d_pct: 0.05,
      fed_funds: 5,
      cpi_yoy: 2,
      vix: 30,
    });
    expect(c).toBe(0);
  });

  test("DXY -3%, real-rate -2%, VIX 12 → 1.0 (full risk-on)", () => {
    const c = c2_riskOn({
      dxy_change_30d_pct: -0.03, // 0.35
      fed_funds: 2,
      cpi_yoy: 4, // real -2 → 0.40
      vix: 12, // 0.25
    });
    // 0.35 + 0.4 + 0.25 = 1.0
    expect(c).toBeCloseTo(1.0, 2);
  });

  test("moderate risk-on (3 partial contributions)", () => {
    const c = c2_riskOn({
      dxy_change_30d_pct: -0.01, // 0.15
      fed_funds: 3,
      cpi_yoy: 3.5, // real -0.5 → 0.20
      vix: 18, // 0.10
    });
    expect(c).toBeCloseTo(0.45, 2);
  });

  test("missing inputs → 0", () => {
    expect(c2_riskOn({})).toBe(0);
  });
});

// ─── C3 — Net liquidity (30d window) ────────────────────────────────────

function makeHistory(walcl: number[], rrp: number[], tga: number[]): RawMacroData[] {
  return walcl.map((w, i) => ({ walcl: w, rrp: rrp[i], tga: tga[i] }));
}

describe("c3_netLiquidity — Fed net supply 30d change", () => {
  test("history < 30 → 0 (insufficient data)", () => {
    const h = makeHistory([100], [10], [20]);
    expect(c3_netLiquidity(h)).toBe(0);
  });

  test("net liquidity stable → 0", () => {
    const w = Array(31).fill(1000);
    const r = Array(31).fill(100);
    const t = Array(31).fill(200);
    expect(c3_netLiquidity(makeHistory(w, r, t))).toBe(0);
  });

  test("WALCL up + RRP/TGA stable → positive", () => {
    const w = Array.from({ length: 31 }, (_, i) => 1000 + i * 2);
    const r = Array(31).fill(100);
    const t = Array(31).fill(200);
    const c = c3_netLiquidity(makeHistory(w, r, t));
    expect(c).toBeGreaterThan(0);
  });

  test("WALCL down → negative", () => {
    const w = Array.from({ length: 31 }, (_, i) => 1000 - i * 5);
    const r = Array(31).fill(100);
    const t = Array(31).fill(200);
    const c = c3_netLiquidity(makeHistory(w, r, t));
    expect(c).toBeLessThan(0);
  });
});

// ─── C4 — Cycle phase ───────────────────────────────────────────────────

describe("c4_cyclePhase — 5-way classification", () => {
  function mkHistory(
    fn: (i: number) => Partial<RawMacroData>,
  ): RawMacroData[] {
    return Array.from({ length: 91 }, (_, i) => fn(i));
  }

  test("insufficient history → neutral", () => {
    expect(c4_cyclePhase([])).toBe("neutral");
    expect(c4_cyclePhase([{ dgs10: 4, dgs2: 4 }])).toBe("neutral");
  });

  test("pre_recession — yc 양수에서 좁혀짐", () => {
    const h = mkHistory((i) => ({
      dgs10: 4.5,
      dgs2: i < 5 ? 3 : 4.3, // past yc=1.5, now yc=0.2 → diff > 0.5
      fed_funds: 3,
      cpi_yoy: 2,
    }));
    expect(c4_cyclePhase(h)).toBe("pre_recession");
  });

  test("recession_imminent — yc 음수 + 실질금리 > 1.5%", () => {
    const h = mkHistory(() => ({
      dgs10: 3,
      dgs2: 4, // yc = -1
      fed_funds: 5,
      cpi_yoy: 2, // real = 3
    }));
    expect(c4_cyclePhase(h)).toBe("recession_imminent");
  });

  test("fed_pivot — yc 양수 + 90일 전엔 음수", () => {
    const h = mkHistory((i) => ({
      dgs10: i < 5 ? 3 : 4.5, // past yc -1, now +0.5
      dgs2: i < 5 ? 4 : 4,
      fed_funds: 4,
      cpi_yoy: 3,
    }));
    expect(c4_cyclePhase(h)).toBe("fed_pivot");
  });

  test("crypto_rally — 실질금리 < 0 + yc > 0.5", () => {
    const h = mkHistory(() => ({
      dgs10: 4.5,
      dgs2: 3, // yc = 1.5
      fed_funds: 2,
      cpi_yoy: 4, // real = -2
    }));
    expect(c4_cyclePhase(h)).toBe("crypto_rally");
  });

  test("neutral fallback", () => {
    const h = mkHistory(() => ({
      dgs10: 4.5,
      dgs2: 4,
      fed_funds: 4,
      cpi_yoy: 3,
    }));
    expect(c4_cyclePhase(h)).toBe("neutral");
  });
});

// ─── computeCompositeSignals aggregator ────────────────────────────────

describe("computeCompositeSignals", () => {
  test("all four signals returned", () => {
    const out = computeCompositeSignals(
      { sofr: 4.3, iorb: 4.3, vix: 18, dxy_change_30d_pct: -0.01 },
      [],
    );
    expect(out).toHaveProperty("c1_crisis");
    expect(out).toHaveProperty("c2_riskOn");
    expect(out).toHaveProperty("c3_net_liquidity_30d_pct");
    expect(out).toHaveProperty("c4_cycle_phase");
    expect(out.c4_cycle_phase).toBe("neutral");
  });
});

// ─── Freshness ─────────────────────────────────────────────────────────

describe("macroFreshnessMult", () => {
  test("fresh (<24h) → 1.0", () => {
    expect(macroFreshnessMult(1)).toBe(1.0);
    expect(macroFreshnessMult(23)).toBe(1.0);
  });
  test("recent (<72h) → 0.9", () => {
    expect(macroFreshnessMult(48)).toBe(0.9);
  });
  test("stale (<168h) → 0.7", () => {
    expect(macroFreshnessMult(100)).toBe(0.7);
  });
  test("ancient → 0.5", () => {
    expect(macroFreshnessMult(200)).toBe(0.5);
  });
});

describe("effectiveMacroMultiplier", () => {
  test("flooded fresh → 1.4 unchanged", () => {
    expect(effectiveMacroMultiplier(1.4, 1)).toBeCloseTo(1.4, 5);
  });
  test("flooded stale → weakened", () => {
    expect(effectiveMacroMultiplier(1.4, 200)).toBeCloseTo(1.2, 5);
  });
});

// ─── V2 score with composite weighting ─────────────────────────────────

describe("computeMacroScoreV2 — composite-weighted score", () => {
  // 빈 입력 → base score=0 (모든 single-indicator missing → 0).
  // sofr=iorb=4.3 처럼 boundary 입력은 scoreSpread 가 +10 을 반환하므로
  // 본 composite delta 테스트는 빈 입력으로 base 를 0 에 고정.
  test("c1 > 0.6 reduces score by 20", () => {
    const r = computeMacroScoreV2(
      {}, // base score 0
      { c1_crisis: 0.7, c2_riskOn: 0, c3_net_liquidity_30d_pct: 0, c4_cycle_phase: "neutral" },
    );
    expect(r.score).toBe(-20);
    expect(r.regime).toBe("tight");
    expect(r.compositeAdjustment?.delta).toBe(-20);
  });

  test("c2 > 0.8 adds 20", () => {
    const r = computeMacroScoreV2(
      {},
      { c1_crisis: 0, c2_riskOn: 0.9, c3_net_liquidity_30d_pct: 0, c4_cycle_phase: "neutral" },
    );
    expect(r.score).toBe(20);
    expect(r.regime).toBe("easy");
    expect(r.compositeAdjustment?.delta).toBe(20);
  });

  test("both fire → cancel out", () => {
    const r = computeMacroScoreV2(
      {},
      { c1_crisis: 0.7, c2_riskOn: 0.9, c3_net_liquidity_30d_pct: 0, c4_cycle_phase: "neutral" },
    );
    expect(r.score).toBe(0);
    expect(r.compositeAdjustment?.delta).toBe(0);
  });
});
