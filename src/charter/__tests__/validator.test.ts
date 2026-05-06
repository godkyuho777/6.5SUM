import { describe, expect, test } from "vitest";

import {
  formatValidationReport,
  RULES,
  validateAgainstCharter,
  type StrategyDefinition,
} from "..";

const bbdxOnly: StrategyDefinition = {
  name: "BBDX-baseline",
  indicators: [
    { name: "RSI" },
    { name: "BB" },
    { name: "ADX" },
    { name: "Volume_zscore" },
    { name: "Candle_Pattern" },
  ],
};

const v64Full: StrategyDefinition = {
  name: "BBDX-v6.4",
  indicators: [
    { name: "RSI" },
    { name: "BB" },
    { name: "ADX" },
    { name: "Volume_zscore" },
    { name: "Wave_Tracker" },
    { name: "Fear&Greed" },
    { name: "Exchange_Netflow", isNew: true, hasBacktestEvidence: true },
  ],
};

describe("validateAgainstCharter — coverage", () => {
  test("BBDX-only signal misses macro and onchain dimensions", () => {
    const r = validateAgainstCharter(bbdxOnly);
    expect(r.passed).toBe(false);
    expect(r.coverage.covered).toBe(5);
    expect(r.missingDimensions.map((m) => m.dimension).sort()).toEqual([
      "macro",
      "onchain",
    ]);
  });

  test("v6.4 with onchain + macro covers all 7 dimensions", () => {
    const r = validateAgainstCharter(v64Full);
    expect(r.passed).toBe(true);
    expect(r.coverage.covered).toBe(7);
    expect(r.violations).toHaveLength(0);
    expect(r.missingDimensions).toHaveLength(0);
  });
});

describe("validateAgainstCharter — rule 1 (dimension duplicate)", () => {
  test("flags two volatility indicators (BB + ATR) as duplicate", () => {
    // ATR is volatility-primary even though it has trend as secondary —
    // BB + ATR in the same strategy should violate rule 1 unless paired.
    const dup: StrategyDefinition = {
      name: "dup-vol",
      indicators: [
        { name: "RSI" },
        { name: "BB" },
        { name: "ATR" },
        { name: "ADX" },
        { name: "Volume_zscore" },
        { name: "Wave_Tracker" },
        { name: "Fear&Greed" },
        { name: "Exchange_Netflow" },
      ],
    };
    const r = validateAgainstCharter(dup);
    const r1 = r.violations.filter(
      (v) => v.rule === RULES.R1_DIMENSION_DUPLICATE
    );
    expect(r1.length).toBeGreaterThan(0);
    expect(r1[0].context?.dimension).toBe("volatility");
  });

  test("RSI + MACD_histogram is allowed (explicit pair exception)", () => {
    const allowedPair: StrategyDefinition = {
      name: "rsi-macd-pair",
      indicators: [
        { name: "RSI" },
        { name: "MACD_histogram" },
        { name: "BB" },
        { name: "ADX" },
        { name: "Volume_zscore" },
        { name: "Wave_Tracker" },
        { name: "Fear&Greed" },
        { name: "Exchange_Netflow" },
      ],
    };
    const r = validateAgainstCharter(allowedPair);
    const r1 = r.violations.filter(
      (v) => v.rule === RULES.R1_DIMENSION_DUPLICATE
    );
    expect(r1).toHaveLength(0);
  });
});

describe("validateAgainstCharter — rule 2 (backtest alpha)", () => {
  test("blocks new indicator without backtest evidence", () => {
    const noBacktest: StrategyDefinition = {
      name: "no-backtest",
      indicators: [
        ...v64Full.indicators.slice(0, -1),
        { name: "ETF_Flow", isNew: true, hasBacktestEvidence: false },
      ],
    };
    const r = validateAgainstCharter(noBacktest);
    const r2 = r.violations.filter((v) => v.rule === RULES.R2_BACKTEST_ALPHA);
    expect(r2).toHaveLength(1);
    expect(r2[0].severity).toBe("blocking");
    expect(r2[0].context?.indicator).toBe("ETF_Flow");
  });

  test("does not block existing indicators that lack the flag", () => {
    // None of the indicators here are flagged isNew, so rule 2 doesn't fire
    // even though hasBacktestEvidence is unset.
    const r = validateAgainstCharter(v64Full);
    expect(
      r.violations.filter((v) => v.rule === RULES.R2_BACKTEST_ALPHA)
    ).toHaveLength(0);
  });
});

describe("validateAgainstCharter — rule 3 (no standalone signal)", () => {
  test("flags standalone-emitting indicator", () => {
    const standalone: StrategyDefinition = {
      name: "standalone",
      indicators: [
        ...v64Full.indicators.slice(0, -1),
        {
          name: "Whale_Alert",
          isNew: true,
          hasBacktestEvidence: true,
          emitsStandaloneSignal: true,
        },
      ],
    };
    const r = validateAgainstCharter(standalone);
    const r3 = r.violations.filter(
      (v) => v.rule === RULES.R3_NO_STANDALONE_SIGNAL
    );
    expect(r3).toHaveLength(1);
    expect(r3[0].context?.indicator).toBe("Whale_Alert");
  });
});

describe("validateAgainstCharter — unknown indicators", () => {
  test("warns when an indicator is missing from the registry", () => {
    const unknown: StrategyDefinition = {
      name: "unknown",
      indicators: [
        ...v64Full.indicators,
        { name: "MysteryGauge" },
      ],
    };
    const r = validateAgainstCharter(unknown);
    const warning = r.violations.find((v) => v.severity === "warning");
    expect(warning?.message).toContain("MysteryGauge");
  });
});

describe("formatValidationReport", () => {
  test("renders coverage badge for full strategy", () => {
    const text = formatValidationReport(validateAgainstCharter(v64Full));
    expect(text).toContain("✓ pass");
    expect(text).toContain("7/7");
  });

  test("renders missing dimension recommendation for partial coverage", () => {
    const text = formatValidationReport(validateAgainstCharter(bbdxOnly));
    expect(text).toContain("⚠️ partial");
    expect(text).toContain("거시 컨텍스트");
    expect(text).toContain("온체인");
  });
});
