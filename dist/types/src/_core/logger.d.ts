/**
 * Structured logger (P1-#3, 2026-05-23) — pino JSON logger.
 *
 * AUDIT.md 권장: `console.log/warn/error` 산재 → production 로그 파싱 어려움.
 * pino 의 JSON 출력으로 Railway / Vercel / Datadog 등이 자동 인덱싱 가능.
 *
 * 사용법:
 *
 *   import { logger } from "./_core/logger";
 *   logger.info({ symbol: "BTCUSDT", price: 78000 }, "Signal detected");
 *   logger.warn("FRED_API_KEY 미설정 — stub 반환");
 *   logger.error({ err }, "Bybit fetch failed");
 *
 * Production (NODE_ENV=production):
 *   → JSON output (one log per line). Railway / Datadog 자동 파싱.
 *   → 예: {"level":30,"time":1779120111024,"msg":"server running","port":3000}
 *
 * Development:
 *   → pino-pretty 가 적용되어 사람 읽기 쉬운 colored output.
 *   → 예: [13:18:48.123] INFO: server running { port: 3000 }
 *
 * Log level:
 *   - LOG_LEVEL 환경변수로 제어 (trace / debug / info / warn / error / fatal)
 *   - default: development = "debug", production = "info"
 *
 * Migration 정책:
 *   - 새 코드는 logger.* 사용 권장
 *   - 기존 console.* 는 점진적 migration (영역별 commit). 한 번에 다 바꾸면
 *     PR 이 비대해지고 review 어려워짐.
 *   - prefix 표준 (예: [scanner], [db], [server]) 은 logger.child({ module: "..." })
 *     로 대체 가능.
 */
import { type Logger } from "pino";
/**
 * Root logger — production 에서는 JSON, dev 에서는 pretty.
 *
 * 모듈별로 logger.child({ module: "scanner" }) 로 분기 권장 — log entry 에
 * 자동으로 `module` 필드 추가되어 grep / filter 용이.
 */
export declare const logger: Logger;
/**
 * 자식 logger 생성 helper. console 의 prefix 패턴을 대체.
 *
 * Before:  console.log("[scanner] Quick warmup complete");
 * After:   const log = childLogger("scanner");
 *          log.info("Quick warmup complete");
 *          → {"level":30, "module":"scanner", "msg":"Quick warmup complete", ...}
 */
export declare function childLogger(module: string, extra?: Record<string, unknown>): Logger;
