import { describe, expect, test } from "vitest";

import { computeMacroScore, MACRO_MULTIPLIERS } from "../liquidity";

describe("computeMacroScore — empty / missing inputs", () => {
  test("no inputs → score 0, neutral regime, mult 1.0", () => {
    const r = computeMacroScore({});
    expect(r.score).toBe(0);
    expect(r.regime).toBe("neutral");
    expect(r.mult).toBe(1.0);
    expect(r.missingInputs).toContain("sofr_iorb_spread");
    expect(r.missingInputs).toContain("rrp_change_30d");
    expect(r.missingInputs).toContain("tga_change_30d");
    expect(r.missingInputs).toContain("fed_balance_change_30d");
    expect(r.missingInputs).toContain("real_fed_funds_rate");
  });
});

describe("computeMacroScore — v6.5 §2.4 worked example", () => {
  test("SOFR-IORB +2bp, RRP -8%, TGA -3%, Fed +0.2%, real-rate +0.8% → score -15 (tight boundary)", () => {
    const r = computeMacroScore({
      sofr: 4.32,
      iorb: 4.3,
      rrpChange30d: -0.08, // -8% (above -10% threshold so contributes 0)
      tgaChange30d: -0.03, // -3% (above -5% threshold so contributes 0)
      fedBalanceChange30d: 0.002, // +0.2% (below +1% threshold so contributes 0)
      realFedFundsRate: 0.8, // +0.8% (between 0 and 2 → 0)
    });
    expect(r.score).toBe(-15);
    expect(r.regime).toBe("tight");
    expect(r.mult).toBe(MACRO_MULTIPLIERS.tight);
  });
});

describe("computeMacroScore — regime boundaries", () => {
  test("crisis: spread > 5bp + tightening fires → score < -50", () => {
    const r = computeMacroScore({
      sofr: 4.4, // spread = 10bp → -40
      iorb: 4.3,
      tgaChange30d: 0.15, // → -20
      realFedFundsRate: 3, // → -15
    });
    // total = -40 + -20 + -15 = -75 → crisis
    expect(r.score).toBeLessThan(-50);
    expect(r.regime).toBe("crisis");
    expect(r.mult).toBe(0.3);
  });

  test("flooded: QE + drained TGA + drained RRP → score > +50", () => {
    const r = computeMacroScore({
      sofr: 4.3,
      iorb: 4.3, // spread=0 → +0
      rrpChange30d: -0.2, // → +25
      tgaChange30d: -0.1, // → +20
      fedBalanceChange30d: 0.02, // → +25
      realFedFundsRate: -0.5, // → +15
    });
    // 0 + 25 + 20 + 25 + 15 = 85 → flooded
    expect(r.score).toBeGreaterThan(50);
    expect(r.regime).toBe("flooded");
    expect(r.mult).toBe(1.4);
  });

  test("easy: moderate easing → 15 ≤ score ≤ 50", () => {
    // Use integer-spread inputs to dodge IEEE-754 noise on (sofr - iorb).
    // spread 1bp (just above 0, below 2) → 0 contribution
    // rrp -20% → +25
    // real-rate -0.5% → +15
    // total = 0 + 25 + 15 = 40 → easy
    const r = computeMacroScore({
      sofr: 5.01,
      iorb: 5.0,
      rrpChange30d: -0.2,
      realFedFundsRate: -0.5,
    });
    expect(r.score).toBeCloseTo(40, 5);
    expect(r.regime).toBe("easy");
    expect(r.mult).toBe(1.2);
  });
});

describe("computeMacroScore — score clamping", () => {
  test("score is clamped to [-100, +100]", () => {
    // All 5 inputs at maximum negative contribution: -40 + -15 + -20 + -25 + -15 = -115 → clamp to -100.
    const r = computeMacroScore({
      sofr: 4.5,
      iorb: 4.3, // → -40
      rrpChange30d: 0.5, // → -15
      tgaChange30d: 0.5, // → -20
      fedBalanceChange30d: -0.05, // → -25
      realFedFundsRate: 5, // → -15
    });
    expect(r.score).toBe(-100);
    expect(r.regime).toBe("crisis");
  });
});

describe("computeMacroScore — partial inputs", () => {
  test("only spread provided → score reflects spread alone", () => {
    const r = computeMacroScore({ sofr: 4.45, iorb: 4.3 }); // spread 15bp → -40
    expect(r.score).toBe(-40);
    expect(r.regime).toBe("tight");
  });
});
