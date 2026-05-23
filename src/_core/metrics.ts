/**
 * Prometheus metrics (P2-#11, 2026-05-23).
 *
 * AUDIT.md 권장: 운영 시간 measure (latency, error rate, cache hit) 부재 →
 * 성능 저하 감지 어려움. prom-client 도입으로 /metrics endpoint 노출.
 *
 * Metric 종류:
 *   - Counter: 누적 (e.g. HTTP request 수, Bybit API call 수)
 *   - Histogram: 분포 (e.g. HTTP latency, Bybit fetch duration)
 *   - Gauge: 순간값 (e.g. active connection 수, cache size)
 *
 * Production 모니터링:
 *   - Railway / Datadog / Grafana 가 `/metrics` scrape (HTTP GET)
 *   - default metric (process CPU/memory/eventloop) 자동 노출
 *   - custom metric 은 의도된 모듈에서 explicit increment / observe 호출
 *
 * 보안: /metrics 는 internal endpoint — production 에서는 인증 또는
 * network ACL 권장 (Railway 의 internal network).
 */

import { collectDefaultMetrics, Counter, Histogram, Registry } from "prom-client";

// 전용 registry — default global registry 와 분리 (multiple instances 안전)
export const metricsRegistry = new Registry();

// process / Node.js / V8 기본 metric (CPU, memory, eventloop lag, GC 등)
collectDefaultMetrics({
  register: metricsRegistry,
  prefix: "tradelab_",
});

// ─── Custom metrics ────────────────────────────────────────────

/**
 * HTTP request counter — 경로 + 상태 코드 별 집계.
 *
 * 사용 예 (Express middleware):
 *   httpRequestsTotal.inc({ method: req.method, path: req.path, status: res.statusCode });
 */
export const httpRequestsTotal = new Counter({
  name: "tradelab_http_requests_total",
  help: "Total HTTP requests received, labeled by method, path, status",
  labelNames: ["method", "path", "status"] as const,
  registers: [metricsRegistry],
});

/**
 * HTTP request duration histogram (ms 단위).
 *
 * Bucket: 5/10/25/50/100/250/500/1000/2500/5000/10000 ms.
 */
export const httpRequestDurationMs = new Histogram({
  name: "tradelab_http_request_duration_ms",
  help: "HTTP request duration in ms",
  labelNames: ["method", "path"] as const,
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
  registers: [metricsRegistry],
});

/**
 * Bybit API call counter — endpoint + 성공/실패 분리.
 */
export const bybitApiCallsTotal = new Counter({
  name: "tradelab_bybit_api_calls_total",
  help: "Total Bybit V5 API calls, labeled by endpoint + status",
  labelNames: ["endpoint", "status"] as const,
  registers: [metricsRegistry],
});

/**
 * Bybit API call duration (ms).
 */
export const bybitApiDurationMs = new Histogram({
  name: "tradelab_bybit_api_duration_ms",
  help: "Bybit V5 API call duration in ms",
  labelNames: ["endpoint"] as const,
  buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000],
  registers: [metricsRegistry],
});

/**
 * Cache hit / miss counter.
 */
export const cacheAccessTotal = new Counter({
  name: "tradelab_cache_access_total",
  help: "Cache access count, labeled by cache name + hit/miss",
  labelNames: ["cache", "result"] as const,
  registers: [metricsRegistry],
});

/**
 * 시그널 생성 카운터 — strategy / side 별 집계.
 */
export const signalsGeneratedTotal = new Counter({
  name: "tradelab_signals_generated_total",
  help: "Total trading signals generated, labeled by strategy + side",
  labelNames: ["strategy", "side"] as const,
  registers: [metricsRegistry],
});

/**
 * Express middleware — 모든 HTTP 요청의 latency / count 자동 수집.
 *
 * 사용: app.use(metricsMiddleware()) — helmet / rate-limit 후, body-parser 전.
 *
 * /metrics 자체는 측정에서 제외 (self-instrument 무한 loop 방지).
 */
export function metricsMiddleware() {
  return (req: any, res: any, next: any) => {
    if (req.path === "/metrics") return next();

    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const durationNs = Number(process.hrtime.bigint() - start);
      const durationMs = durationNs / 1_000_000;
      // path 정규화 — :param 같은 dynamic segment 는 normalize 어려우니
      // 일단 raw path 사용 (label cardinality 폭증 위험은 향후 모니터링)
      const normalizedPath = normalizePath(req.path);
      httpRequestsTotal.inc({
        method: req.method,
        path: normalizedPath,
        status: String(res.statusCode),
      });
      httpRequestDurationMs.observe(
        { method: req.method, path: normalizedPath },
        durationMs,
      );
    });
    next();
  };
}

/**
 * Path 정규화 — UUID / 숫자 ID 등을 placeholder 로 치환하여 metric label
 * cardinality 폭증 방지.
 *
 *   /api/trpc/coins.detail?input=... → /api/trpc/coins.detail
 *   /api/health/abc123              → /api/health/:id (UUID 형식이면)
 */
function normalizePath(p: string): string {
  // query string 제거
  const cleaned = p.split("?")[0];
  // UUID 패턴
  const uuidRe =
    /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  // 긴 숫자 ID (positionId 등)
  const numIdRe = /\/\d{5,}/g;
  return cleaned.replace(uuidRe, "/:uuid").replace(numIdRe, "/:id");
}
