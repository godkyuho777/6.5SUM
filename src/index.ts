import "dotenv/config";
import express from "express";
import cors from "cors";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { ENV } from "./_core/env";
import { startBackgroundWarmup } from "./scanner";

async function startServer() {
  const app = express();

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // The Vercel rewrite proxy makes browser traffic same-origin in production,
  // but a permissive CORS policy lets us hit the backend directly during local
  // dev (Vite at :5173 → Express at :3000) and from server-side tools.
  const corsOrigins = (process.env.CORS_ORIGIN ?? "").split(",")
    .map(s => s.trim())
    .filter(Boolean);
  app.use(
    cors({
      origin: corsOrigins.length > 0 ? corsOrigins : true,
      credentials: false,
    })
  );

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  app.get("/api/debug/connectivity", async (_req, res) => {
    const results: Record<string, unknown> = {};
    const axios = (await import("axios")).default;

    const probe = async (
      label: string,
      fn: () => Promise<Record<string, unknown>>
    ) => {
      try {
        const start = Date.now();
        const data = await fn();
        results[label] = { status: "ok", timeMs: Date.now() - start, ...data };
      } catch (e: any) {
        results[label] = {
          status: "error",
          message: e.message,
          code: e.code,
          httpCode: e.response?.status,
        };
      }
    };

    await probe("bybit", async () => {
      const resp = await axios.get("https://api.bybit.com/v5/market/tickers", {
        params: { category: "spot", symbol: "BTCUSDT" },
        timeout: 10000,
      });
      return {
        httpCode: resp.status,
        retCode: resp.data?.retCode,
        price: resp.data?.result?.list?.[0]?.lastPrice,
      };
    });

    await probe("coingecko", async () => {
      const resp = await axios.get("https://api.coingecko.com/api/v3/ping", {
        timeout: 10000,
      });
      return { data: resp.data };
    });

    results.env = {
      nodeEnv: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
    };

    res.json(results);
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  app.listen(ENV.port, () => {
    console.log(`[server] running on http://localhost:${ENV.port}/`);
    startBackgroundWarmup();
  });
}

startServer().catch(err => {
  console.error("[server] failed to start", err);
  process.exit(1);
});
