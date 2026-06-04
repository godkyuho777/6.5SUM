/**
 * RS-MeanRevert modifier 단위 테스트.
 *
 * 검증:
 *   1. weak_laggard(rs30<−5% AND rs7<0) → multiplier 1.12
 *   2. 벤치마크(BTCUSDT) → 1.0 (자기참조 중립)
 *   3. 데이터 부족 → 1.0 (stub, throw X)
 *   4. 비-weak_laggard(leader/neutral) → 1.0 (억제 없음 — 헌장 비대칭 설계)
 *   5. combineAdditionalModifiers clamp 1.40 상한 가드
 */

import { describe, it, expect } from "vitest";
import type { Candle } from "@shared/types";
import { computeRsMeanRevert } from "./rs-mean-revert";
import { combineAdditionalModifiers } from "./index";

const INTERVAL_MS = 14_400_000; // 4h
const BASE_TS = 1_700_000_000_000;
const N = 200; // > RS_MIN_CANDLES(181)

/**
 * close 시퀀스를 받아 4h 간격 openTime 으로 캔들 배열 생성.
 * coin↔btc 가 같은 인덱스에서 같은 openTime 을 갖도록(openTime 조인 성립).
 */
function makeCandles(closes: number[]): Candle[] {
  return closes.map((close, i) => ({
    openTime: BASE_TS + i * INTERVAL_MS,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1000,
    closeTime: BASE_TS + i * INTERVAL_MS + INTERVAL_MS,
  }));
}

/** 일정한 close(평평) — BTC 벤치를 평평하게 두면 RS = 코인 자체 수익률. */
function flatCloses(value: number, n: number = N): number[] {
  return Array.from({ length: n }, () => value);
}

describe("computeRsMeanRevert", () => {
  it("weak_laggard (rs30<−5% AND rs7<0) → multiplier 1.12", () => {
    // BTC 평평. 코인은 180캔들(30일) 전 대비 −10% 이상 하락 + 최근 42캔들도 추가 하락
    // → rs30 < −0.05, rs7 < 0. 단조 하락이면 두 조건 모두 충족.
    const btc = makeCandles(flatCloses(100));
    // 100 → 80 으로 선형 하락 (−20%): rs30 ≈ log(80/100) = −0.223 < −0.05,
    // 단조 감소라 rs7 = log(coin/btc)[t] − [t−42] < 0.
    const coinCloses = Array.from(
      { length: N },
      (_, i) => 100 - (20 * i) / (N - 1),
    );
    const coin = makeCandles(coinCloses);

    const r = computeRsMeanRevert(coin, btc, "SOLUSDT");
    expect(r.status).toBe("real");
    expect(r.regime).toBe("weak_laggard");
    expect(r.rs30).toBeLessThan(-0.05);
    expect(r.rs7).toBeLessThan(0);
    expect(r.multiplier).toBeCloseTo(1.12, 10);
  });

  it("벤치마크 BTCUSDT → 1.0 (자기참조 중립, 억제/증폭 없음)", () => {
    const btc = makeCandles(flatCloses(100));
    const r = computeRsMeanRevert(btc, btc, "BTCUSDT");
    expect(r.regime).toBe("benchmark");
    expect(r.multiplier).toBe(1.0);
    expect(r.status).toBe("real");
  });

  it("데이터 부족 → 1.0 (stub, throw X)", () => {
    const btc = makeCandles(flatCloses(100));
    const shortCoin = makeCandles(flatCloses(50, 10)); // 10 캔들 < 181
    const r = computeRsMeanRevert(shortCoin, btc, "FOOUSDT");
    expect(r.multiplier).toBe(1.0);
    expect(r.status).toBe("stub");
  });

  it("BTC 벤치 부족 → 1.0 (stub)", () => {
    const coin = makeCandles(flatCloses(100));
    const shortBtc = makeCandles(flatCloses(100, 10));
    const r = computeRsMeanRevert(coin, shortBtc, "ETHUSDT");
    expect(r.multiplier).toBe(1.0);
    expect(r.status).toBe("stub");
  });

  it("강한 아웃퍼폼(leader/strong_leader) → 1.0 (억제 없음 — 비대칭 설계)", () => {
    // 코인이 BTC 대비 +20% 아웃퍼폼 + 상승추세 → strong_leader.
    // RS-Rotation 이었다면 ×1.15 였을 구간. RS-MeanRevert 는 반드시 1.0.
    const btc = makeCandles(flatCloses(100));
    const coinCloses = Array.from(
      { length: N },
      (_, i) => 100 + (20 * i) / (N - 1),
    );
    const coin = makeCandles(coinCloses);
    const r = computeRsMeanRevert(coin, btc, "SOLUSDT");
    expect(r.rs30).toBeGreaterThan(0.05);
    expect(r.multiplier).toBe(1.0); // 억제 절대 금지
  });

  it("중립(neutral, BTC 와 동행) → 1.0", () => {
    // 코인=BTC 동일 시세 → RS≈0 → neutral.
    const btc = makeCandles(flatCloses(100));
    const coin = makeCandles(flatCloses(100));
    const r = computeRsMeanRevert(coin, btc, "ADAUSDT");
    expect(Math.abs(r.rs30)).toBeLessThan(0.02);
    expect(r.regime).toBe("neutral");
    expect(r.multiplier).toBe(1.0);
  });

  it("never throws — 빈 배열에도 graceful neutral", () => {
    expect(() => computeRsMeanRevert([], [], "FOOUSDT")).not.toThrow();
    const r = computeRsMeanRevert([], [], "FOOUSDT");
    expect(r.multiplier).toBe(1.0);
  });
});

describe("combineAdditionalModifiers — rsMeanRevertMult wiring + clamp", () => {
  it("rsMeanRevertMult 1.12 가 곱셈 체인에 반영", () => {
    const out = combineAdditionalModifiers({ rsMeanRevertMult: 1.12 });
    expect(out).toBeCloseTo(1.12, 10);
  });

  it("미지정 시 1.0 (영향 없음, 불변)", () => {
    const out = combineAdditionalModifiers({});
    expect(out).toBe(1.0);
  });

  it("다른 modifier 와 누적해도 clamp 상한 1.40 가드", () => {
    // 1.12 × 1.30 × 1.20 = 1.747 → clamp 1.40 으로 cap.
    const out = combineAdditionalModifiers({
      rsMeanRevertMult: 1.12,
      marketBreadthMult: 1.3,
      fundingExtremeMult: 1.2,
    });
    expect(out).toBe(1.4);
  });

  it("NaN/undefined rsMeanRevertMult → 1.0 fallback (체인 무영향)", () => {
    const out = combineAdditionalModifiers({ rsMeanRevertMult: NaN });
    expect(out).toBe(1.0);
  });
});
