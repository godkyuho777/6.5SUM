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
export type TradelabErrorCode =
  // ── 사용자 입력 오류 (400 류) ──────────────────────────
  | "SYMBOL_NOT_FOUND" // 요청한 심볼의 데이터 없음
  | "INVALID_TIMEFRAME" // 지원되지 않는 timeframe
  | "INVALID_PARAMETER" // 일반 input validation 실패
  | "INSUFFICIENT_BALANCE" // 시뮬레이터 cash 부족
  | "POSITION_NOT_FOUND" // 요청한 position id 없음
  | "ORDER_NOT_FOUND" // 요청한 order id 없음
  | "OUT_OF_RANGE" // 값 범위 벗어남 (leverage 등)

  // ── 인증 / 권한 (401 / 403 류) ──────────────────────────
  | "UNAUTHENTICATED" // 로그인 필요
  | "FORBIDDEN" // 권한 부족 (admin 필요 등)
  | "ADMIN_REQUIRED" // admin user 만 접근 가능

  // ── Rate limit (429) ───────────────────────────────────
  | "RATE_LIMIT_EXCEEDED" // 본 서버의 rate limit
  | "UPSTREAM_RATE_LIMIT" // Bybit / FRED 등 외부 API 의 429

  // ── 서버 / 외부 API 오류 (500 류) ──────────────────────
  | "DB_UNAVAILABLE" // Supabase 미설정 또는 connection failed
  | "BYBIT_FETCH_FAILED" // Bybit API 호출 실패
  | "FRED_FETCH_FAILED" // FRED API 호출 실패
  | "LLM_SERVICE_UNAVAILABLE" // OpenRouter / Anthropic 호출 실패
  | "INTERNAL_ERROR"; // 일반 서버 내부 오류

/**
 * TradelabErrorCode → TRPCError code 매핑.
 * tRPC client 가 catch 할 때 표준 HTTP semantics 사용.
 */
const TRPC_CODE_MAP: Record<TradelabErrorCode, TRPCError["code"]> = {
  // 400 류 → BAD_REQUEST
  SYMBOL_NOT_FOUND: "NOT_FOUND",
  INVALID_TIMEFRAME: "BAD_REQUEST",
  INVALID_PARAMETER: "BAD_REQUEST",
  INSUFFICIENT_BALANCE: "BAD_REQUEST",
  POSITION_NOT_FOUND: "NOT_FOUND",
  ORDER_NOT_FOUND: "NOT_FOUND",
  OUT_OF_RANGE: "BAD_REQUEST",

  // 401 / 403 류
  UNAUTHENTICATED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  ADMIN_REQUIRED: "FORBIDDEN",

  // 429
  RATE_LIMIT_EXCEEDED: "TOO_MANY_REQUESTS",
  UPSTREAM_RATE_LIMIT: "TOO_MANY_REQUESTS",

  // 500 류
  DB_UNAVAILABLE: "INTERNAL_SERVER_ERROR",
  BYBIT_FETCH_FAILED: "INTERNAL_SERVER_ERROR",
  FRED_FETCH_FAILED: "INTERNAL_SERVER_ERROR",
  LLM_SERVICE_UNAVAILABLE: "INTERNAL_SERVER_ERROR",
  INTERNAL_ERROR: "INTERNAL_SERVER_ERROR",
};

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
export function tradelabError(
  code: TradelabErrorCode,
  opts: TradelabErrorOptions,
): TRPCError {
  const trpcCode = TRPC_CODE_MAP[code];
  const err = new TRPCError({
    code: trpcCode,
    message: opts.message,
    cause: opts.cause,
  });
  // tRPC 의 errorFormatter 가 client 로 전송할 metadata 첨부.
  // (Object.assign + 명시적 cast — TRPCError 의 옵션 type 이 좁아서)
  (err as unknown as { tradelabCode: TradelabErrorCode }).tradelabCode = code;
  if (opts.context) {
    (err as unknown as { tradelabContext: Record<string, unknown> }).tradelabContext =
      opts.context;
  }
  return err;
}

/**
 * tRPC `errorFormatter` 에 사용 — server → client 전송 시 tradelabCode 가
 * `error.data` 에 포함되도록.
 *
 * trpc.ts 의 initTRPC.config 에서 호출:
 *   errorFormatter: ({ shape, error }) => formatTradelabError({ shape, error }),
 */
export function formatTradelabError({
  shape,
  error,
}: {
  shape: any;
  error: TRPCError;
}): any {
  const tradelabCode = (error as any).tradelabCode;
  const tradelabContext = (error as any).tradelabContext;
  return {
    ...shape,
    data: {
      ...shape.data,
      tradelabCode,
      tradelabContext,
    },
  };
}
