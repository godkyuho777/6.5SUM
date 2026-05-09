/**
 * CVD Divergence modifier — 베타 stub 동작 확인.
 *
 * 본격 구현 (WebSocket trade stream) 은 본 작업 범위 외.
 * 항상 status="stub", multiplier=1.0 반환해야 함.
 */
import { describe, it, expect } from "vitest";
import { detectCvdDivergence } from "../cvd-divergence";

describe("detectCvdDivergence — 베타 stub", () => {
  it("항상 status='stub', multiplier=1.0, type='none', betaStub=true", async () => {
    const r = await detectCvdDivergence("BTCUSDT", []);
    expect(r.status).toBe("stub");
    expect(r.multiplier).toBe(1.0);
    expect(r.type).toBe("none");
    expect(r.betaStub).toBe(true);
    expect(r.dimension).toBe(4);
  });

  it("candles 전달해도 stub 동작 (TODO: WebSocket integration)", async () => {
    const dummyCandles = Array.from({ length: 100 }, (_, i) => ({
      openTime: i * 1000,
      open: 100,
      high: 101,
      low: 99,
      close: 100,
      volume: 100,
      closeTime: i * 1000 + 1000,
    }));
    const r = await detectCvdDivergence("ETHUSDT", dummyCandles);
    expect(r.status).toBe("stub");
    expect(r.multiplier).toBe(1.0);
    expect(r.betaStub).toBe(true);
  });
});
