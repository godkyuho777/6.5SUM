import { describe, expect, test } from "vitest";

import { evaluateRegimeGates } from "../regime-gates";

describe("evaluateRegimeGates — macro crisis", () => {
  test("blocks every path", () => {
    for (const path of ["NUM", "PTN", "BB:Riding", "BB:Lower Bounce"]) {
      const r = evaluateRegimeGates({
        macroRegime: "crisis",
        onchainRegime: "neutral",
        path,
      });
      expect(r.blocked).toBe(true);
      expect(r.reason).toBe("MACRO_CRISIS_BLOCK");
    }
  });
});

describe("evaluateRegimeGates — macro tight", () => {
  test("blocks NUM (mean-reversion)", () => {
    const r = evaluateRegimeGates({
      macroRegime: "tight",
      onchainRegime: "neutral",
      path: "NUM",
    });
    expect(r.blocked).toBe(true);
    expect(r.reason).toBe("MACRO_TIGHT_BLOCK");
  });

  test("blocks PTN (mean-reversion)", () => {
    const r = evaluateRegimeGates({
      macroRegime: "tight",
      onchainRegime: "neutral",
      path: "PTN",
    });
    expect(r.blocked).toBe(true);
  });

  test("blocks BB:Lower Bounce (default conservative reading)", () => {
    const r = evaluateRegimeGates({
      macroRegime: "tight",
      onchainRegime: "neutral",
      path: "BB:Lower Bounce",
    });
    expect(r.blocked).toBe(true);
  });

  test("allows BB:Riding", () => {
    const r = evaluateRegimeGates({
      macroRegime: "tight",
      onchainRegime: "neutral",
      path: "BB:Riding",
    });
    expect(r.blocked).toBe(false);
  });

  test("allows BB:Squeeze", () => {
    const r = evaluateRegimeGates({
      macroRegime: "tight",
      onchainRegime: "neutral",
      path: "BB:Squeeze",
    });
    expect(r.blocked).toBe(false);
  });

  test("override unlocks BB:Lower Bounce when reviewer flips", () => {
    const r = evaluateRegimeGates({
      macroRegime: "tight",
      onchainRegime: "neutral",
      path: "BB:Lower Bounce",
      tightAllowList: ["BB:Riding", "BB:Squeeze", "BB:Lower Bounce"],
    });
    expect(r.blocked).toBe(false);
  });
});

describe("evaluateRegimeGates — onchain strong_distribution", () => {
  test("blocks NUM/PTN/BB:Lower Bounce by default (only BB:Riding allowed)", () => {
    for (const path of ["NUM", "PTN", "BB:Lower Bounce", "BB:Squeeze"]) {
      const r = evaluateRegimeGates({
        macroRegime: "neutral",
        onchainRegime: "strong_distribution",
        path,
      });
      expect(r.blocked).toBe(true);
      expect(r.reason).toBe("ONCHAIN_STRONG_DISTRIBUTION_BLOCK");
    }
  });

  test("allows BB:Riding", () => {
    const r = evaluateRegimeGates({
      macroRegime: "neutral",
      onchainRegime: "strong_distribution",
      path: "BB:Riding",
    });
    expect(r.blocked).toBe(false);
  });
});

describe("evaluateRegimeGates — neutral / non-blocking regimes", () => {
  test("neutral macro + accumulation onchain → all paths pass", () => {
    for (const path of ["NUM", "PTN", "BB:Riding", "BB:Lower Bounce", "BB:Squeeze"]) {
      const r = evaluateRegimeGates({
        macroRegime: "neutral",
        onchainRegime: "accumulation",
        path,
      });
      expect(r.blocked).toBe(false);
    }
  });

  test("easy macro + accumulation → all paths pass", () => {
    for (const path of ["NUM", "PTN", "BB:Riding"]) {
      const r = evaluateRegimeGates({
        macroRegime: "easy",
        onchainRegime: "accumulation",
        path,
      });
      expect(r.blocked).toBe(false);
    }
  });

  test("flooded + strong_accumulation → pass", () => {
    const r = evaluateRegimeGates({
      macroRegime: "flooded",
      onchainRegime: "strong_accumulation",
      path: "NUM",
    });
    expect(r.blocked).toBe(false);
  });

  test("distribution (not strong) does NOT block — only BB:Riding constraint applies on strong_distribution", () => {
    const r = evaluateRegimeGates({
      macroRegime: "neutral",
      onchainRegime: "distribution",
      path: "NUM",
    });
    expect(r.blocked).toBe(false);
  });
});
