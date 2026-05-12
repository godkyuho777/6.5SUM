import { describe, expect, it, beforeEach } from "vitest";
import { autoCorrectWeights } from "../auto-correction";
import { clearWeightCaches } from "../fetch";

// DATABASE_URL 미설정 시 saveCalibratedWeights 는 ok:false 지만, autoCorrectWeights
// 의 weights/source/status 분기는 동작 — 본 테스트는 분기 로직만 검증.

describe("autoCorrectWeights", () => {
  beforeEach(() => {
    clearWeightCaches();
  });

  it("외부 manifest 일치 → source='external'", async () => {
    const r = await autoCorrectWeights({
      symbol: "BTCUSDT",
      tf: "4h",
      path: "NUM",
      side: "long",
    });
    expect(r.source).toBe("external");
    expect(r.status).toBe("production");
    expect(r.weights.momentum).toBeCloseTo(0.35, 5);
  });

  it("외부 manifest 없음 (1h timeframe) → source='default' + review_required", async () => {
    const r = await autoCorrectWeights({
      symbol: "BTCUSDT",
      tf: "1h",
      path: "NUM",
      side: "long",
    });
    expect(r.source).toBe("default");
    expect(r.status).toBe("review_required");
  });

  it("SHORT 도 mirror manifest 적용 → source='external'", async () => {
    const r = await autoCorrectWeights({
      symbol: "BTCUSDT",
      tf: "4h",
      path: "BB",
      side: "short",
    });
    expect(r.source).toBe("external");
    expect(r.status).toBe("production");
  });

  it("signalsFetch 공급 (충분한 표본) — self_backtest 시도", async () => {
    const r = await autoCorrectWeights(
      { symbol: "ETHUSDT", tf: "4h", path: "PTN", side: "long" },
      async () => {
        // synthetic — outcome.win 이 action score 와 상관
        return Array.from({ length: 150 }, (_, i) => ({
          scores: {
            momentum: 0.5,
            position: 0.5,
            trend: 0.5,
            volume: 0.5,
            action: i % 2 === 0 ? 0.9 : 0.1,
          },
          outcome: { win: (i % 2 === 0 ? 1 : 0) as 0 | 1, profit: 0 },
        }));
      },
    );
    // self_backtest 가 통과하면 그 source, 아니면 external fallback
    expect(["self_backtest", "external"]).toContain(r.source);
  });
});
