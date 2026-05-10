import { describe, expect, test } from "vitest";

import { computeMacroScore, MACRO_MULTIPLIERS } from "../../macro/liquidity";
import { computeOnchainScore } from "../../onchain/score";
import { classifyWaveAlignment } from "../../trend/wave-alignment";
import { tfTrendFixture } from "./_test_helpers";
import { computeFinalConfidence } from "../confidence";

describe("computeFinalConfidence — v6.5 §4.2 worked example", () => {
  test("BTC 4H NUM+PTN+BB confluence under macro=neutral / onchain=accumulation → final 100", () => {
    // §4.2 second scenario (after retrying with macro=neutral):
    //   base_strength = 80 (60 max from BB path + 20 confluence bonus baked in)
    //   confluence = 1.20 (3 paths)
    //   wave (partial_up) = 1.10
    //   macro (neutral) = 1.00
    //   onchain (accumulation, +0.42) = 1.15
    // 80 × 1.20 × 1.10 × 1.00 × 1.15 = 121.44 → clamp 100.
    const macro = computeMacroScore({}); // neutral by default
    expect(macro.regime).toBe("neutral");

    const onchain = computeOnchainScore("BTCUSDT", {
      // 0.422 score per §3.4 worked example
      netflowZscore: -2.4,
      whaleNetUsd: 180_000_000,
      ssrZscore: -1.8,
      coinbasePremium: 0.0008,
      etfFlowThreeDayUsd: 650_000_000,
      minerOutflowZscore: 0.3,
      lthSupplyThirtyDayChange: 0.015,
    });
    expect(onchain.regime).toBe("accumulation");

    const wave = classifyWaveAlignment([
      tfTrendFixture("4h", "BULLISH"),
      tfTrendFixture("1d", "SIDEWAYS"),
      tfTrendFixture("1w", "BULLISH"),
    ]);
    expect(wave.alignment).toBe("partial_up");

    const decision = computeFinalConfidence({
      path: "BB:Lower Bounce",
      concurrentPaths: ["NUM", "PTN"],
      baseStrength: 80,
      macro,
      onchain,
      wave,
    });

    expect(decision.blocked).toBe(false);
    expect(decision.finalConfidence).toBe(100);
    expect(decision.sizeFactor).toBe("normal");
    expect(decision.breakdown.confluence).toBeCloseTo(1.2, 5);
    expect(decision.breakdown.wave).toBe(1.1);
    expect(decision.breakdown.macro).toBe(1.0);
    expect(decision.breakdown.onchain).toBe(1.15);
  });

  test("first scenario under macro=tight → blocked because path is BB:Lower Bounce", () => {
    // Macro 'tight'. Use spread 10bp to land squarely in tight regime
    // (avoids float-precision boundary at 2bp).
    const macro = computeMacroScore({
      sofr: 4.4,
      iorb: 4.3, // spread 10bp → -40 score → tight
    });
    expect(macro.regime).toBe("tight");

    const onchain = computeOnchainScore("BTCUSDT", {});
    const wave = classifyWaveAlignment([
      tfTrendFixture("4h", "BULLISH"),
      tfTrendFixture("1d", "SIDEWAYS"),
      tfTrendFixture("1w", "BULLISH"),
    ]);

    const decision = computeFinalConfidence({
      path: "BB:Lower Bounce",
      concurrentPaths: ["NUM", "PTN"],
      baseStrength: 80,
      macro,
      onchain,
      wave,
    });

    expect(decision.blocked).toBe(true);
    expect(decision.blockReason?.reason).toBe("MACRO_TIGHT_BLOCK");
    expect(decision.finalConfidence).toBe(0);
  });
});

describe("computeFinalConfidence — gates short-circuit", () => {
  test("macro crisis blocks regardless of base strength", () => {
    const macro = computeMacroScore({
      sofr: 4.5,
      iorb: 4.3, // spread 20bp → -40
      tgaChange30d: 0.2, // → -20
      realFedFundsRate: 3, // → -15
      fedBalanceChange30d: -0.05, // → -25
    });
    expect(macro.regime).toBe("crisis");

    const onchain = computeOnchainScore("BTCUSDT", {});
    const wave = classifyWaveAlignment([tfTrendFixture("4h", "BULLISH")]);

    const decision = computeFinalConfidence({
      path: "BB:Riding",
      baseStrength: 95,
      macro,
      onchain,
      wave,
    });

    expect(decision.blocked).toBe(true);
    expect(decision.blockReason?.reason).toBe("MACRO_CRISIS_BLOCK");
    expect(decision.sizeFactor).toBe("reject");
  });

  test("onchain strong_distribution allows BB:Riding only", () => {
    const macro = computeMacroScore({});
    const onchain = computeOnchainScore("BTCUSDT", {
      netflowZscore: 3,
      whaleNetUsd: -500_000_000,
      ssrZscore: 2,
      coinbasePremium: -0.005,
      etfFlowThreeDayUsd: -2_000_000_000,
    });
    expect(onchain.regime).toBe("strong_distribution");

    const wave = classifyWaveAlignment([tfTrendFixture("4h", "BULLISH")]);

    // BB:Riding passes the gate (then formula would still apply).
    const okDecision = computeFinalConfidence({
      path: "BB:Riding",
      baseStrength: 60,
      macro,
      onchain,
      wave,
    });
    expect(okDecision.blocked).toBe(false);

    // NUM path is blocked.
    const blockedDecision = computeFinalConfidence({
      path: "NUM",
      baseStrength: 80,
      macro,
      onchain,
      wave,
    });
    expect(blockedDecision.blocked).toBe(true);
    expect(blockedDecision.blockReason?.reason).toBe(
      "ONCHAIN_STRONG_DISTRIBUTION_BLOCK"
    );
  });
});

describe("computeFinalConfidence — Korea modifier", () => {
  test("KRW weakening +0.05 boosts macro multiplier", () => {
    const macro = computeMacroScore({}); // neutral, mult 1.0
    const onchain = computeOnchainScore("BTCUSDT", {});
    const wave = classifyWaveAlignment([tfTrendFixture("4h", "BULLISH")]);

    const noKorea = computeFinalConfidence({
      path: "BB:Riding",
      baseStrength: 60,
      macro,
      onchain,
      wave,
      koreaModifier: 0,
    });
    const withKorea = computeFinalConfidence({
      path: "BB:Riding",
      baseStrength: 60,
      macro,
      onchain,
      wave,
      koreaModifier: 0.05,
    });

    expect(withKorea.breakdown.macro).toBeCloseTo(1.05, 5);
    expect(withKorea.finalConfidence).toBeGreaterThan(noKorea.finalConfidence);
  });
});

describe("computeFinalConfidence — size factor", () => {
  test("low base + neutral multipliers → small / reject", () => {
    const macro = computeMacroScore({});
    const onchain = computeOnchainScore("BTCUSDT", {});
    const wave = classifyWaveAlignment([tfTrendFixture("4h", "SIDEWAYS")]);

    const r = computeFinalConfidence({
      path: "BB:Riding",
      baseStrength: 45,
      macro,
      onchain,
      wave,
    });
    // 45 × 1.0 × 0.85 (mixed wave) × 1.0 × 1.0 = 38.25 → reject
    expect(r.finalConfidence).toBeLessThan(40);
    expect(r.sizeFactor).toBe("reject");
  });
});

// ── P1-#1 (2026-05-10): `additional` multiplier wiring 검증 ──────────────────
describe("computeFinalConfidence — additional multiplier (P1-#1)", () => {
  test("additional 미지정 시 1.0 fallback (backward compat)", () => {
    const macro = computeMacroScore({});
    const onchain = computeOnchainScore("BTCUSDT", {});
    const wave = classifyWaveAlignment([tfTrendFixture("4h", "BULLISH")]);

    const r = computeFinalConfidence({
      path: "BB:Riding",
      baseStrength: 60,
      macro,
      onchain,
      wave,
    });
    expect(r.breakdown.additional).toBe(1.0);
  });

  test("additional=1.30 → finalConfidence ↑", () => {
    const macro = computeMacroScore({});
    const onchain = computeOnchainScore("BTCUSDT", {});
    const wave = classifyWaveAlignment([tfTrendFixture("4h", "BULLISH")]);

    const baseDecision = computeFinalConfidence({
      path: "BB:Riding",
      baseStrength: 60,
      macro,
      onchain,
      wave,
    });
    const boostedDecision = computeFinalConfidence({
      path: "BB:Riding",
      baseStrength: 60,
      macro,
      onchain,
      wave,
      additional: 1.30,
    });
    expect(boostedDecision.finalConfidence).toBeGreaterThan(
      baseDecision.finalConfidence
    );
    expect(boostedDecision.breakdown.additional).toBe(1.30);
  });

  test("additional=0.70 → finalConfidence ↓", () => {
    const macro = computeMacroScore({});
    const onchain = computeOnchainScore("BTCUSDT", {});
    const wave = classifyWaveAlignment([tfTrendFixture("4h", "BULLISH")]);

    const baseDecision = computeFinalConfidence({
      path: "BB:Riding",
      baseStrength: 60,
      macro,
      onchain,
      wave,
    });
    const dampedDecision = computeFinalConfidence({
      path: "BB:Riding",
      baseStrength: 60,
      macro,
      onchain,
      wave,
      additional: 0.70,
    });
    expect(dampedDecision.finalConfidence).toBeLessThan(
      baseDecision.finalConfidence
    );
  });

  test("additional 비유효 값(NaN/undefined) → 1.0 fallback", () => {
    const macro = computeMacroScore({});
    const onchain = computeOnchainScore("BTCUSDT", {});
    const wave = classifyWaveAlignment([tfTrendFixture("4h", "BULLISH")]);

    const r = computeFinalConfidence({
      path: "BB:Riding",
      baseStrength: 60,
      macro,
      onchain,
      wave,
      additional: NaN,
    });
    expect(r.breakdown.additional).toBe(1.0);
  });

  test("formula 일치: base × confluence × wave × macro × onchain × additional", () => {
    const macro = computeMacroScore({});
    const onchain = computeOnchainScore("BTCUSDT", {});
    const wave = classifyWaveAlignment([tfTrendFixture("4h", "BULLISH")]);

    const r = computeFinalConfidence({
      path: "BB:Riding",
      baseStrength: 60,
      macro,
      onchain,
      wave,
      additional: 1.20,
    });
    const { base, confluence, wave: w, macro: m, onchain: o, additional, raw } =
      r.breakdown;
    expect(raw).toBeCloseTo(base * confluence * w * m * o * additional, 5);
  });
});
