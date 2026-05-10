import { describe, expect, test } from "vitest";

import {
  classifyWaveAlignment,
  WAVE_MULTIPLIERS,
  waveAlignmentToMultiplier,
} from "../wave-alignment";
import type { TimeframeTrend, TrendDirection } from "../multi-tf";

const tfTrend = (tf: string, direction: TrendDirection): TimeframeTrend => ({
  tf,
  direction,
  adx: 25,
  plusDi: 25,
  minusDi: 18,
  emaAlignment: "mixed",
});

describe("classifyWaveAlignment", () => {
  test("empty input → mixed", () => {
    const r = classifyWaveAlignment([]);
    expect(r.alignment).toBe("mixed");
    expect(r.mult).toBe(WAVE_MULTIPLIERS.mixed);
  });

  test("all 4 TFs bullish → perfect_up (×1.30)", () => {
    const r = classifyWaveAlignment([
      tfTrend("15m", "BULLISH"),
      tfTrend("1h", "BULLISH"),
      tfTrend("4h", "BULLISH"),
      tfTrend("1d", "BULLISH"),
    ]);
    expect(r.alignment).toBe("perfect_up");
    expect(r.mult).toBe(1.3);
  });

  test("longest TF bearish AND any other bullish → opposing (×0.30)", () => {
    const r = classifyWaveAlignment([
      tfTrend("15m", "BULLISH"),
      tfTrend("1h", "BULLISH"),
      tfTrend("4h", "SIDEWAYS"),
      tfTrend("1d", "BEARISH"),
    ]);
    expect(r.alignment).toBe("opposing");
    expect(r.mult).toBe(0.3);
  });

  test("majority bullish, longest sideways → partial_up", () => {
    // 15m bull (w=1) + 1h bull (w=2) + 4h bull (w=3) + 1d sideways (w=4)
    // bullFrac = 6/10 = 0.6 (NOT > 0.6) → mixed, not partial_up
    // bump 4h to bullish to get 9/10 = 0.9 → partial_up
    const r = classifyWaveAlignment([
      tfTrend("15m", "BULLISH"),
      tfTrend("1h", "BULLISH"),
      tfTrend("4h", "BULLISH"),
      tfTrend("1d", "SIDEWAYS"),
    ]);
    expect(r.alignment).toBe("partial_up");
    expect(r.mult).toBe(1.1);
  });

  test("conflicting (bull + bear, longest neutral) → mixed", () => {
    const r = classifyWaveAlignment([
      tfTrend("15m", "BULLISH"),
      tfTrend("1h", "BEARISH"),
      tfTrend("4h", "BULLISH"),
      tfTrend("1d", "SIDEWAYS"),
    ]);
    expect(r.alignment).toBe("mixed");
    expect(r.mult).toBe(0.85);
  });

  test("all sideways → mixed", () => {
    const r = classifyWaveAlignment([
      tfTrend("15m", "SIDEWAYS"),
      tfTrend("1h", "SIDEWAYS"),
      tfTrend("4h", "SIDEWAYS"),
      tfTrend("1d", "SIDEWAYS"),
    ]);
    expect(r.alignment).toBe("mixed");
  });

  test("v6.5 §4.2 'partial_up' worked example: 4h↑ / 1d sideways / 1w↑", () => {
    // The spec example uses 3 TFs with 1w heaviest. With weights {4h:3, 1d:4, 1w:5},
    // bull = 3 (4h) + 5 (1w) = 8, total = 12 → bullFrac = 0.667 > 0.6, no bear → partial_up.
    const r = classifyWaveAlignment([
      tfTrend("4h", "BULLISH"),
      tfTrend("1d", "SIDEWAYS"),
      tfTrend("1w", "BULLISH"),
    ]);
    expect(r.alignment).toBe("partial_up");
    expect(r.mult).toBe(1.1);
  });
});

// ── (나-2) Wave Alignment SHORT 미러 (P2 fix, 2026-05-10) ────────────────────
describe("waveAlignmentToMultiplier — SHORT mirror (P2 fix)", () => {
  test("LONG: perfect_up → 1.30 (강세 정렬 = LONG 강화)", () => {
    expect(waveAlignmentToMultiplier("perfect_up", "LONG")).toBe(1.3);
  });

  test("SHORT: perfect_down → 1.30 (약세 정렬 = SHORT 강화)", () => {
    expect(waveAlignmentToMultiplier("perfect_down", "SHORT")).toBe(1.3);
  });

  test("LONG: perfect_down → 0.65 (약세 정렬 시 LONG 차감)", () => {
    expect(waveAlignmentToMultiplier("perfect_down", "LONG")).toBe(0.65);
  });

  test("SHORT: perfect_up → 0.65 (강세 정렬 시 SHORT 차감, LONG 미러)", () => {
    expect(waveAlignmentToMultiplier("perfect_up", "SHORT")).toBe(0.65);
  });

  test("LONG: opposing → 0.30 (자본 보호)", () => {
    expect(waveAlignmentToMultiplier("opposing", "LONG")).toBe(0.3);
  });

  test("SHORT: opposing → 0.30 (자본 보호 — 양방향 위험)", () => {
    expect(waveAlignmentToMultiplier("opposing", "SHORT")).toBe(0.3);
  });

  test("SHORT: partial_up → 0.85 (약화 — LONG 의 mixed 와 동일)", () => {
    expect(waveAlignmentToMultiplier("partial_up", "SHORT")).toBe(0.85);
  });

  test("SHORT/LONG mixed → 0.85 (양방향 동일)", () => {
    expect(waveAlignmentToMultiplier("mixed", "LONG")).toBe(0.85);
    expect(waveAlignmentToMultiplier("mixed", "SHORT")).toBe(0.85);
  });
});
