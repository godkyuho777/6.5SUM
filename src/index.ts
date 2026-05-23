import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { sql } from "drizzle-orm";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { ENV } from "./_core/env";
import { childLogger, logger } from "./_core/logger";
import { metricsMiddleware, metricsRegistry } from "./_core/metrics";
import { getDb } from "./db";
import { startBackgroundWarmup } from "./scanner";

const log = childLogger("server");

async function warmDbPool() {
  const db = await getDb();
  if (!db) return;
  const dbLog = childLogger("db");
  try {
    await db.execute(sql`SELECT 1`);
    dbLog.info("pool warm");
  } catch (err) {
    dbLog.warn({ err }, "warmup failed");
  }
}

async function startServer() {
  const app = express();

  // ── P1-#2 (2026-05-23): Security middleware ────────────────
  //
  // helmet — 보안 헤더 (CSP, X-Frame-Options, HSTS, X-Content-Type-Options 등)
  //   기본 설정. Production 에서 자동 보안 강화. CSP 는 inline scripts 가 필요한
  //   기존 페이지가 있을 수 있어 contentSecurityPolicy: false 로 두고 (helmet
  //   default 외 다른 헤더만 적용). 추후 CSP 정책 명확화되면 다시 활성.
  app.use(
    helmet({
      contentSecurityPolicy: false, // 일부 페이지에서 inline script 사용 가능성
      crossOriginEmbedderPolicy: false, // Bybit chart embeds 호환
    }),
  );

  // Trust proxy 1단계 (Railway / Vercel) — rate limit 가 정확한 client IP
  // 인식하도록. 0 (default) 면 X-Forwarded-For 무시 → 모든 요청이 같은 IP 로
  // 처리되어 rate limit 가 즉시 도달.
  app.set("trust proxy", 1);

  // express-rate-limit — 전역 IP 기반 rate limit (DDoS 1차 방어)
  //   기본 60 req / 분 / IP. Read 위주 endpoint 대상으로 충분히 관대.
  //   백테스트 / AI insight 같은 무거운 endpoint 는 별도 limiter 필요 (Phase 2).
  const globalLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    limit: 60, // 60 req per IP per minute
    standardHeaders: "draft-7", // RFC 9239 RateLimit headers
    legacyHeaders: false,
    message: { error: "TooManyRequests", retryAfter: 60 },
    // /api/health 는 limit 적용 안 함 — Railway / Vercel healthcheck 자유
    skip: (req) => req.path === "/api/health",
  });
  app.use(globalLimiter);

  // P2-#11: Prometheus metrics middleware — 모든 HTTP request latency 자동 측정.
  // helmet / rate-limit 다음, body parser 전에 배치.
  app.use(metricsMiddleware());

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
    // branch 는 Railway/Vercel 환경 변수에서 읽거나 (RAILWAY_GIT_BRANCH),
    // 빌드 타임에 주입된 BACKEND_BRANCH 환경 변수에서 읽는다. 로컬에서는 "local".
    const branch =
      process.env.BACKEND_BRANCH ??
      process.env.RAILWAY_GIT_BRANCH ??
      process.env.VERCEL_GIT_COMMIT_REF ??
      "local";
    res.json({ ok: true, branch, timestamp: Date.now() });
  });

  // P2-#11: Prometheus /metrics endpoint — Railway / Datadog / Grafana scrape.
  // No auth — production 에서는 internal network 또는 reverse proxy 로 access 제한 권장.
  app.get("/metrics", async (_req, res) => {
    res.set("Content-Type", metricsRegistry.contentType);
    res.end(await metricsRegistry.metrics());
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

  const server = app.listen(ENV.port, () => {
    log.info({ port: ENV.port }, `server running on http://localhost:${ENV.port}/`);
    void warmDbPool();
    startBackgroundWarmup();
  });

  // ── P1-#6 (2026-05-23): Graceful shutdown ──────────────────
  //
  // AUDIT.md 권장: SIGTERM/SIGINT 핸들러 없음 → Railway 가 deploy / restart
  // 시 진행 중 request 가 즉시 끊김. 결과: 사용자 일부가 incomplete response
  // 받음, DB 트랜잭션 dangling 가능.
  //
  // 정책:
  //   1. SIGTERM (Railway / Docker shutdown) → 새 connection 받지 않음
  //   2. 진행 중 request 완료 대기 (최대 30s, hard timeout)
  //   3. DB pool 종료 (있다면)
  //   4. process.exit(0)
  //
  // 30s timeout 은 Railway 의 graceful shutdown 한도와 일치 (이후 SIGKILL).
  const shutdown = async (signal: string) => {
    log.info({ signal }, "graceful shutdown started");
    // 1) 새 connection 차단
    server.close((err) => {
      if (err) {
        log.error({ err }, "server.close failed");
        process.exit(1);
      }
      log.info("server closed — no new connections");
    });

    // 2) Hard timeout — 30s 후 강제 종료
    const forceExitTimer = setTimeout(() => {
      log.warn("graceful shutdown timed out (30s) — forcing exit");
      process.exit(1);
    }, 30_000);
    forceExitTimer.unref(); // 타이머 자체가 event loop 잡지 않도록

    // 3) DB pool 종료 (있다면)
    try {
      const db = await getDb();
      // drizzle/postgres 의 pool 은 client 가 노출하므로 명시적 종료
      const client = (db as any)?.$client;
      if (client && typeof client.end === "function") {
        await client.end({ timeout: 5 });
        log.info("DB pool closed");
      }
    } catch (err) {
      log.warn({ err }, "DB pool close failed (ignoring)");
    }

    // 4) Exit
    log.info("graceful shutdown complete");
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  // Uncaught exceptions → log but don't crash (Railway 재시작 정책)
  process.on("uncaughtException", (err) => {
    logger.error({ err }, "uncaughtException — logging but continuing");
  });
  process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "unhandledRejection — logging but continuing");
  });
}

startServer().catch((err) => {
  logger.fatal({ err }, "[server] failed to start");
  process.exit(1);
});
