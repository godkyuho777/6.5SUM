import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("coins.list", () => {
  it("returns a list of top coins with symbol and name", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.coins.list();

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty("symbol");
    expect(result[0]).toHaveProperty("name");
    expect(result[0].symbol).toContain("USDT");
    expect(result[0].name).not.toContain("USDT");
  });

  it("includes BTC and ETH in the list", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.coins.list();
    const symbols = result.map(c => c.symbol);

    expect(symbols).toContain("BTCUSDT");
    expect(symbols).toContain("ETHUSDT");
  });
});
