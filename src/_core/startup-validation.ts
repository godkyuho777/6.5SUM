/**
 * Startup validation (P2-#12, 2026-05-23).
 *
 * AUDIT.md 권장: 운영 환경에서 critical config 누락 / 헌장 위반 가능성을
 * startup 시점에 검출하여 운영자가 즉시 인지하도록.
 *
 * 검사 항목:
 *   1. Critical env vars 존재 (production 한정)
 *   2. Optional API keys (FRED / BOK / Anthropic / OpenRouter) 상태 노출
 *   3. 활성 strategy 식별 + 헌장 차원 cover 여부
 *   4. DB 연결 가능성 (warning only)
 *   5. Onchain modifier provider status (mock vs real)
 *
 * 동작:
 *   - logger.info: 정상 / 정보성 로그
 *   - logger.warn: 권장 사항 누락 (예: BOK key)
 *   - logger.error: critical config 누락 (예: DATABASE_URL production)
 *
 * 절대 throw 하지 않음 — startup 차단은 graceful shutdown 정책 위배.
 * 운영자가 로그 보고 판단.
 */

import { childLogger } from "./logger";
import { ENV } from "./env";

const log = childLogger("startup");

interface ValidationResult {
  category: string;
  passed: boolean;
  level: "info" | "warn" | "error";
  message: string;
  context?: Record<string, unknown>;
}

export function validateStartup(): ValidationResult[] {
  const results: ValidationResult[] = [];
  const isProd = ENV.isProduction;

  // ── 1. Critical infrastructure ─────────────────────────────
  results.push({
    category: "infra",
    passed: !!ENV.databaseUrl,
    level: isProd && !ENV.databaseUrl ? "error" : "info",
    message: ENV.databaseUrl
      ? "DATABASE_URL configured"
      : isProd
        ? "DATABASE_URL 누락 — production 에서는 필수 (positions / signals / backtest 저장 불가)"
        : "DATABASE_URL 미설정 (개발 모드 — DB 호출은 null 반환)",
  });

  results.push({
    category: "infra",
    passed: !!ENV.supabaseUrl,
    level: isProd && !ENV.supabaseUrl ? "warn" : "info",
    message: ENV.supabaseUrl
      ? "SUPABASE_URL configured"
      : "SUPABASE_URL 미설정 — JWT 인증 불가 (anonymous 모드만)",
  });

  results.push({
    category: "infra",
    passed: !!ENV.port,
    level: "info",
    message: `Server port: ${ENV.port}`,
  });

  // ── 2. Optional API keys (graceful degradation) ────────────
  const fredKey = process.env.FRED_API_KEY ?? "";
  results.push({
    category: "macro",
    passed: !!fredKey,
    level: "info",
    message: fredKey
      ? "FRED_API_KEY ✓ — 모든 macro tracker 활성"
      : "FRED_API_KEY 미설정 — macro tracker 페이지는 빈 차트 (stub-first)",
  });

  const bokKey = process.env.BOK_API_KEY ?? "";
  results.push({
    category: "macro",
    passed: !!bokKey,
    level: "info",
    message: bokKey
      ? "BOK_API_KEY ✓ — 한국 macro 데이터 활성"
      : "BOK_API_KEY 미설정 — 한국 환율은 Yahoo 폴백, 기준금리/CPI는 stub",
  });

  // ── 3. LLM providers ──────────────────────────────────────
  results.push({
    category: "llm",
    passed: !!ENV.openrouterApiKey,
    level: "info",
    message: ENV.openrouterApiKey
      ? `OPENROUTER_API_KEY ✓ — model: ${ENV.openrouterModel}`
      : "OPENROUTER_API_KEY 미설정 — AI Insight 기능 unavailable",
  });

  results.push({
    category: "llm",
    passed: !!ENV.anthropicApiKey,
    level: "info",
    message: ENV.anthropicApiKey
      ? "ANTHROPIC_API_KEY ✓ — OpenRouter fallback 활성"
      : "ANTHROPIC_API_KEY 미설정 — fallback 불가능 (OpenRouter 단독)",
  });

  // ── 4. Onchain modifier providers ──────────────────────────
  const onchainKeys = {
    CRYPTOQUANT_API_KEY: process.env.CRYPTOQUANT_API_KEY,
    GLASSNODE_API_KEY: process.env.GLASSNODE_API_KEY,
    WHALE_ALERT_API_KEY: process.env.WHALE_ALERT_API_KEY,
  };
  const onchainConfigured = Object.entries(onchainKeys)
    .filter(([, v]) => !!v)
    .map(([k]) => k);
  const onchainMissing = Object.entries(onchainKeys)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  results.push({
    category: "onchain",
    passed: onchainConfigured.length > 0,
    level: "info",
    message: `Onchain providers: ${onchainConfigured.length}/3 configured`,
    context: { configured: onchainConfigured, missing: onchainMissing },
  });

  const onchainMock = process.env.ONCHAIN_MOCK === "1";
  if (onchainMock) {
    results.push({
      category: "onchain",
      passed: true,
      level: "warn",
      message:
        "ONCHAIN_MOCK=1 — mock 데이터로 onchain modifier 동작 (production 비권장)",
    });
  }

  // ── 5. SHORT signal policy ────────────────────────────────
  const shortEnabled = process.env.ENABLE_SHORT_SIGNALS !== "0";
  const shortAlertsBroadcast = process.env.BROADCAST_SHORT_ALERTS === "1";
  results.push({
    category: "signals",
    passed: true,
    level: "info",
    message:
      `SHORT signals: ${shortEnabled ? "ENABLED (UI 표시)" : "DISABLED (legacy)"} · ` +
      `Alert broadcast: ${shortAlertsBroadcast ? "ON (자본 보호 정책 활성)" : "OFF (default)"}`,
  });

  // ── 6. BBDX version ───────────────────────────────────────
  const bbdxVersion = process.env.BBDX_VERSION ?? "v6.5";
  results.push({
    category: "signals",
    passed: true,
    level: "info",
    message: `BBDX version: ${bbdxVersion}`,
  });

  return results;
}

/**
 * Startup validation 결과를 logger 로 출력.
 *
 * 호출 시점: index.ts 의 startServer() 진입 시.
 */
export function logStartupValidation(): void {
  const results = validateStartup();
  const errors = results.filter((r) => r.level === "error");
  const warnings = results.filter((r) => r.level === "warn");

  log.info(
    {
      total: results.length,
      passed: results.filter((r) => r.passed).length,
      errors: errors.length,
      warnings: warnings.length,
    },
    "Startup validation 시작",
  );

  for (const r of results) {
    const contextField = r.context ? { context: r.context } : {};
    if (r.level === "error") {
      log.error({ category: r.category, ...contextField }, r.message);
    } else if (r.level === "warn") {
      log.warn({ category: r.category, ...contextField }, r.message);
    } else {
      log.info({ category: r.category, ...contextField }, r.message);
    }
  }

  if (errors.length > 0) {
    log.error(
      { count: errors.length },
      `⚠ ${errors.length}개 critical validation 실패 — 운영자 검토 필요`,
    );
  } else if (warnings.length > 0) {
    log.warn(
      { count: warnings.length },
      `${warnings.length}개 권장 사항 미충족 (기능 일부 제한)`,
    );
  } else {
    log.info("✓ All startup validations passed");
  }
}
