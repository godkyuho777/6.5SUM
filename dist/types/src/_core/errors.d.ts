/**
 * Standardized error codes (P1-#4, 2026-05-23).
 *
 * AUDIT.md 권장: tRPC routers 의 throw 가 generic Error 또는 anonymous
 * TRPCError 를 사용하여 client side 에서 구체적 처리 불가. 본 모듈은
 * Tradelab-specific error codes 를 정의하고 TRPCError 매핑 헬퍼를 제공.
 *
 * 사용 예:
 *
 *   import { tradelabError } from "./_core/errors";
 *
 *   // tRPC procedure 내부
 *   throw tradelabError("SYMBOL_NOT_FOUND", {
 *     message: `${symbol} 데이터 없음`,
 *     context: { symbol },
 *   });
 *
 * Frontend 가 받는 응답:
 *   {
 *     "data": {
 *       "code": "BAD_REQUEST", // TRPCError code
 *       "tradelabCode": "SYMBOL_NOT_FOUND", // Tradelab-specific
 *       "message": "BTCUSDT 데이터 없음",
 *       "context": { "symbol": "BTCUSDT" }
 *     }
 *   }
 *
 * 가이드라인:
 *   - 4xx 류 (사용자 입력 오류) → BAD_REQUEST / NOT_FOUND / UNAUTHORIZED
 *   - 5xx 류 (서버 / 외부 API 오류) → INTERNAL_SERVER_ERROR / TIMEOUT
 *   - Rate limit → TOO_MANY_REQUESTS
 *
 * 추가 정책:
 *   - context 객체에 sensitive data (token, password) 절대 금지
 *   - 사용자 facing message 는 한국어 OK, but tradelabCode 는 영문 SCREAMING_SNAKE
 */
import { TRPCError } from "@trpc/server";
/**
 * Tradelab-specific error code enum.
 *
 * 새 코드 추가 시:
 *   1. 의미가 기존 코드와 명확히 구분되는지 확인
 *   2. TRPC_CODE_MAP 에 매핑 추가
 *   3. 사용자 facing 메시지 가이드라인 (한국어, 비기술적 표현)
 */
export type TradelabErrorCode = "SYMBOL_NOT_FOUND" | "INVALID_TIMEFRAME" | "INVALID_PARAMETER" | "INSUFFICIENT_BALANCE" | "POSITION_NOT_FOUND" | "ORDER_NOT_FOUND" | "OUT_OF_RANGE" | "UNAUTHENTICATED" | "FORBIDDEN" | "ADMIN_REQUIRED" | "RATE_LIMIT_EXCEEDED" | "UPSTREAM_RATE_LIMIT" | "DB_UNAVAILABLE" | "BYBIT_FETCH_FAILED" | "FRED_FETCH_FAILED" | "LLM_SERVICE_UNAVAILABLE" | "INTERNAL_ERROR";
export interface TradelabErrorOptions {
    /** 사용자 facing 메시지 (한국어 OK) */
    message: string;
    /** 추가 디버깅 context (sensitive 정보 절대 X) */
    context?: Record<string, unknown>;
    /** Original error (Wrap 시) */
    cause?: unknown;
}
/**
 * Tradelab error 생성 헬퍼 — TRPCError 를 반환.
 *
 * tRPC procedure 에서 그대로 throw 가능. error.data.tradelabCode 로
 * client 가 식별.
 */
export declare function tradelabError(code: TradelabErrorCode, opts: TradelabErrorOptions): TRPCError;
/**
 * tRPC `errorFormatter` 에 사용 — server → client 전송 시 tradelabCode 가
 * `error.data` 에 포함되도록.
 *
 * trpc.ts 의 initTRPC.config 에서 호출:
 *   errorFormatter: ({ shape, error }) => formatTradelabError({ shape, error }),
 */
export declare function formatTradelabError({ shape, error, }: {
    shape: any;
    error: TRPCError;
}): any;
