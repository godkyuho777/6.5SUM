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
interface ValidationResult {
    category: string;
    passed: boolean;
    level: "info" | "warn" | "error";
    message: string;
    context?: Record<string, unknown>;
}
export declare function validateStartup(): ValidationResult[];
/**
 * Startup validation 결과를 logger 로 출력.
 *
 * 호출 시점: index.ts 의 startServer() 진입 시.
 */
export declare function logStartupValidation(): void;
export {};
