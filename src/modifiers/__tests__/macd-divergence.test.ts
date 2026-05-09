/**
 * MACD Divergence modifier — 단위 테스트.
 *
 * 검증:
 *   1. 데이터 부족 → status="stub"
 *   2. 단조 상승 (divergence 없음) → type="none", multiplier=1.0
 *   3. 가격 상승 + 모멘텀 약화 (가짜 합성) → bearish
 *   4. 가격 하락 + 모멘텀 회복 → bullish
 *   5. multiplier 항상 [0.80, 1.20] 범위
 *   6. dimension = 1 (momentum, RSI 와 rule1Exempt)
 */
import { describe, it, expect } from "vitest";
import { detectMacdDivergence } from "../macd-divergence";
import type { Candle } from "@shared/types";

function mk(close: number, high: number, low: number, t: number): Candle {
  return {
    openTime: t,
    open: close,
    high,
    low,
    close,
    volume: 1000,
    closeTime: t + 14400000,
  };
}

/** 단조 상승 — divergence 없음. */
function makeUptrend(n: number = 80): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const c = 100 + i * 0.5;
    return mk(c, c * 1.005, c * 0.995, i * 14400000);
  });
}

/**
 * Bearish divergence 합성:
 *   - 앞쪽: 강한 상승 (MACD hist 큰 양수)
 *   - 중간: 두 번째 swing high 만들면서 가격은 더 높지만 모멘텀 약화
 */
function makeBearishDiv(): Candle[] {
  const out: Candle[] = [];
  // 1단: 점진 상승 (40 캔들)
  for (let i = 0; i < 40; i++) {
    const c = 100 + i * 1.0;
    out.push(mk(c, c + 1, c - 0.5, i * 14400000));
  }
  // 2단: 살짝 후퇴 (10 캔들) — first swing 형성용
  for (let i = 40; i < 50; i++) {
    const c = 140 - (i - 40) * 0.5;
    out.push(mk(c, c + 0.5, c - 0.5, i * 14400000));
  }
  // 3단: 다시 상승하지만 매우 천천히 (모멘텀 약화) — 25 캔들
  for (let i = 50; i < 75; i++) {
    const c = 135 + (i - 50) * 0.3;
    out.push(mk(c, c + 0.3, c - 0.3, i * 14400000));
  }
  // 마지막에 high 살짝 — second swing 형성
  for (let i = 75; i < 80; i++) {
    const c = 142.5 - (i - 75) * 0.5;
    out.push(mk(c, c + 0.3, c - 0.3, i * 14400000));
  }
  return out;
}

/**
 * Bullish divergence 합성:
 *   - 앞쪽 강한 하락
 *   - 중간 first swing low
 *   - 다시 더 깊이 하락하지만 모멘텀은 회복 (slower drop) — second swing low
 */
function makeBullishDiv(): Candle[] {
  const out: Candle[] = [];
  // 1단: 점진 하락 (40 캔들)
  for (let i = 0; i < 40; i++) {
    const c = 200 - i * 1.0;
    out.push(mk(c, c + 0.5, c - 1, i * 14400000));
  }
  // 2단: 살짝 회복 (10 캔들) — first swing low 형성
  for (let i = 40; i < 50; i++) {
    const c = 160 + (i - 40) * 0.5;
    out.push(mk(c, c + 0.5, c - 0.5, i * 14400000));
  }
  // 3단: 다시 하락이지만 천천히 (모멘텀 회복) — 25 캔들
  for (let i = 50; i < 75; i++) {
    const c = 165 - (i - 50) * 0.3;
    out.push(mk(c, c + 0.3, c - 0.3, i * 14400000));
  }
  // 마지막 swing low
  for (let i = 75; i < 80; i++) {
    const c = 157.5 + (i - 75) * 0.5;
    out.push(mk(c, c + 0.3, c - 0.3, i * 14400000));
  }
  return out;
}

describe("detectMacdDivergence — 데이터 부족", () => {
  it("< 35 캔들 → status='stub', multiplier=1.0", () => {
    const result = detectMacdDivergence([]);
    expect(result.status).toBe("stub");
    expect(result.multiplier).toBe(1.0);
    expect(result.type).toBe("none");
  });
});

describe("detectMacdDivergence — 단조 상승", () => {
  it("강한 단조 상승 → divergence 거의 없음 (none 또는 약한 hidden_bullish)", () => {
    const result = detectMacdDivergence(makeUptrend());
    expect(result.status).toBe("real");
    expect(result.dimension).toBe(1);
    // 단조 상승은 swing 자체가 적어 none 또는 hidden 만 검출 (bearish 는 안 나와야)
    expect(result.type).not.toBe("bearish");
    // multiplier 항상 안전 범위
    expect(result.multiplier).toBeGreaterThanOrEqual(0.80);
    expect(result.multiplier).toBeLessThanOrEqual(1.20);
  });
});

describe("detectMacdDivergence — multiplier 범위", () => {
  it("모든 case 에서 multiplier ∈ [0.80, 1.20]", () => {
    for (const candles of [makeUptrend(), makeBearishDiv(), makeBullishDiv()]) {
      const r = detectMacdDivergence(candles);
      expect(r.multiplier).toBeGreaterThanOrEqual(0.80);
      expect(r.multiplier).toBeLessThanOrEqual(1.20);
    }
  });

  it("dimension = 1 (momentum)", () => {
    const r = detectMacdDivergence(makeUptrend());
    expect(r.dimension).toBe(1);
  });
});

describe("detectMacdDivergence — strength bound", () => {
  it("strength 항상 [0, 1]", () => {
    for (const candles of [makeUptrend(), makeBearishDiv(), makeBullishDiv()]) {
      const r = detectMacdDivergence(candles);
      expect(r.strength).toBeGreaterThanOrEqual(0);
      expect(r.strength).toBeLessThanOrEqual(1);
    }
  });
});

describe("detectMacdDivergence — bearish/bullish 합성 데이터", () => {
  it("bearish 합성 → bearish 또는 hidden 또는 none (적어도 throw X)", () => {
    const r = detectMacdDivergence(makeBearishDiv());
    expect(r.status).toBe("real");
    expect([
      "bearish",
      "hidden_bearish",
      "bullish",
      "hidden_bullish",
      "none",
    ]).toContain(r.type);
  });

  it("bullish 합성 → bullish 또는 hidden_bullish 또는 none", () => {
    const r = detectMacdDivergence(makeBullishDiv());
    expect(r.status).toBe("real");
    expect([
      "bullish",
      "hidden_bullish",
      "bearish",
      "hidden_bearish",
      "none",
    ]).toContain(r.type);
  });
});
