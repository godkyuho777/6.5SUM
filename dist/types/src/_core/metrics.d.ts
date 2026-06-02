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
import { Counter, Histogram, Registry } from "prom-client";
export declare const metricsRegistry: Registry<"text/plain; version=0.0.4; charset=utf-8">;
/**
 * HTTP request counter — 경로 + 상태 코드 별 집계.
 *
 * 사용 예 (Express middleware):
 *   httpRequestsTotal.inc({ method: req.method, path: req.path, status: res.statusCode });
 */
export declare const httpRequestsTotal: Counter<"status" | "path" | "method">;
/**
 * HTTP request duration histogram (ms 단위).
 *
 * Bucket: 5/10/25/50/100/250/500/1000/2500/5000/10000 ms.
 */
export declare const httpRequestDurationMs: Histogram<"path" | "method">;
/**
 * Bybit API call counter — endpoint + 성공/실패 분리.
 */
export declare const bybitApiCallsTotal: Counter<"status" | "endpoint">;
/**
 * Bybit API call duration (ms).
 */
export declare const bybitApiDurationMs: Histogram<"endpoint">;
/**
 * Cache hit / miss counter.
 */
export declare const cacheAccessTotal: Counter<"result" | "cache">;
/**
 * 시그널 생성 카운터 — strategy / side 별 집계.
 */
export declare const signalsGeneratedTotal: Counter<"side" | "strategy">;
/**
 * Express middleware — 모든 HTTP 요청의 latency / count 자동 수집.
 *
 * 사용: app.use(metricsMiddleware()) — helmet / rate-limit 후, body-parser 전.
 *
 * /metrics 자체는 측정에서 제외 (self-instrument 무한 loop 방지).
 */
export declare function metricsMiddleware(): (req: any, res: any, next: any) => any;
