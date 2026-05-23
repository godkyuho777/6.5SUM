/**
 * errors.ts unit tests (P1-#4, 2026-05-23).
 */

import { describe, test, expect } from "vitest";
import { tradelabError } from "../errors";
import { TRPCError } from "@trpc/server";

describe("tradelabError", () => {
  test("returns TRPCError with proper code mapping", () => {
    const err = tradelabError("SYMBOL_NOT_FOUND", {
      message: "BTCUSDT 데이터 없음",
      context: { symbol: "BTCUSDT" },
    });
    expect(err).toBeInstanceOf(TRPCError);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toBe("BTCUSDT 데이터 없음");
    expect((err as any).tradelabCode).toBe("SYMBOL_NOT_FOUND");
    expect((err as any).tradelabContext).toEqual({ symbol: "BTCUSDT" });
  });

  test("INSUFFICIENT_BALANCE → BAD_REQUEST", () => {
    const err = tradelabError("INSUFFICIENT_BALANCE", {
      message: "잔액 부족",
    });
    expect(err.code).toBe("BAD_REQUEST");
    expect((err as any).tradelabCode).toBe("INSUFFICIENT_BALANCE");
  });

  test("DB_UNAVAILABLE → INTERNAL_SERVER_ERROR", () => {
    const err = tradelabError("DB_UNAVAILABLE", {
      message: "Supabase 미설정",
    });
    expect(err.code).toBe("INTERNAL_SERVER_ERROR");
  });

  test("RATE_LIMIT_EXCEEDED → TOO_MANY_REQUESTS", () => {
    const err = tradelabError("RATE_LIMIT_EXCEEDED", {
      message: "초당 5회 초과",
    });
    expect(err.code).toBe("TOO_MANY_REQUESTS");
  });

  test("ADMIN_REQUIRED → FORBIDDEN", () => {
    const err = tradelabError("ADMIN_REQUIRED", {
      message: "관리자 권한 필요",
    });
    expect(err.code).toBe("FORBIDDEN");
  });

  test("UNAUTHENTICATED → UNAUTHORIZED", () => {
    const err = tradelabError("UNAUTHENTICATED", {
      message: "로그인 필요",
    });
    expect(err.code).toBe("UNAUTHORIZED");
  });

  test("context 미지정 시 tradelabContext 도 미지정", () => {
    const err = tradelabError("INTERNAL_ERROR", {
      message: "내부 오류",
    });
    expect((err as any).tradelabContext).toBeUndefined();
  });

  test("cause 가 원본 error wrap", () => {
    const original = new Error("axios timeout");
    const err = tradelabError("BYBIT_FETCH_FAILED", {
      message: "Bybit 호출 실패",
      cause: original,
    });
    expect(err.cause).toBe(original);
  });
});
