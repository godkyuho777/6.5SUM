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

import pino, { type LoggerOptions, type Logger } from "pino";

const isProd = process.env.NODE_ENV === "production";
const level = process.env.LOG_LEVEL ?? (isProd ? "info" : "debug");

const baseOptions: LoggerOptions = {
  level,
  // Production 에서는 JSON output (default), Railway / Datadog 호환.
  // ISO timestamp + UTC.
  timestamp: pino.stdTimeFunctions.isoTime,
  // Production 에서 process.pid / hostname 항상 포함 (multi-instance 운영 시 식별).
  base: isProd
    ? {
        pid: process.pid,
        hostname: process.env.HOSTNAME ?? "unknown",
      }
    : null, // dev 에서는 깔끔하게
  // Sensitive field redaction — 키 / 토큰 / 비밀번호 자동 마스킹.
  redact: {
    paths: [
      "*.password",
      "*.token",
      "*.apiKey",
      "*.api_key",
      "*.authorization",
      "*.cookie",
      "req.headers.authorization",
      "req.headers.cookie",
      "headers.authorization",
      "headers.cookie",
    ],
    censor: "[REDACTED]",
  },
};

// Development 전용: pino-pretty 로 colored / human-readable 출력.
// pino@8+ 부터는 transport option 사용.
const devTransport = isProd
  ? undefined
  : {
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss.l",
          ignore: "pid,hostname",
          singleLine: false,
        },
      },
    };

/**
 * Root logger — production 에서는 JSON, dev 에서는 pretty.
 *
 * 모듈별로 logger.child({ module: "scanner" }) 로 분기 권장 — log entry 에
 * 자동으로 `module` 필드 추가되어 grep / filter 용이.
 */
export const logger: Logger = pino({ ...baseOptions, ...devTransport });

/**
 * 자식 logger 생성 helper. console 의 prefix 패턴을 대체.
 *
 * Before:  console.log("[scanner] Quick warmup complete");
 * After:   const log = childLogger("scanner");
 *          log.info("Quick warmup complete");
 *          → {"level":30, "module":"scanner", "msg":"Quick warmup complete", ...}
 */
export function childLogger(module: string, extra: Record<string, unknown> = {}): Logger {
  return logger.child({ module, ...extra });
}
